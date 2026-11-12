"""Tests for the SQL-injection fixes, VLOOKUP support, and the Formula
Builder tokenizer/parser/compiler, per SPEC.md."""
import os
import tempfile

import duckdb
import pytest

from app.services.duckdb_engine import duckdb_engine
from app.services.step_compiler import step_compiler
from app.services.formula_compiler import compile_formula_to_sql
from app.schemas.steps import StepSchema


def _load_csv(tmp_dir, name, text):
    src = os.path.join(tmp_dir, name + ".csv")
    pq = os.path.join(tmp_dir, name + ".parquet")
    with open(src, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    row_count, col_count, cols = duckdb_engine.ingest_file_to_parquet(src, pq, "csv")
    return pq, [c.name for c in cols]


def _step(step_type, **params):
    return StepSchema(id=f"s-{step_type}", type=step_type, label=step_type, params=params)


def _run(pq, cols, steps, dataset_paths=None):
    sql, summaries, final_cols = step_compiler.compile_pipeline(pq, steps, cols, dataset_paths or {})
    conn = duckdb_engine.get_connection()
    cur = conn.execute(sql)
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()], summaries


@pytest.fixture()
def tmp_dir():
    with tempfile.TemporaryDirectory() as d:
        yield d


def test_custom_column_cannot_read_server_files(tmp_dir):
    """The classic SQL-injection flaw: an expression that smuggles a SELECT
    reading an arbitrary file must NOT be able to leak file contents --
    it must come back as the Excel error value #NAME?, not the secret."""
    pq, cols = _load_csv(tmp_dir, "data", "amt\n1\n2\n3\n")
    secret_path = os.path.join(tmp_dir, "secret.txt")
    with open(secret_path, "w") as f:
        f.write("DB_PASSWORD=hunter2\n")

    injection = f"(SELECT content FROM read_text('{secret_path}'))"
    rows, _ = _run(pq, cols, [_step("custom_column", new_column="c", expression=injection)])
    assert all(r["c"] == "#NAME?" for r in rows)


def test_filter_rows_value_cannot_inject_sql(tmp_dir):
    """gt/gte/lt/lte/between values must never be spliced unescaped/
    unquoted into SQL (e.g. "999 OR 1=1")."""
    pq, cols = _load_csv(tmp_dir, "data", "amt\n1\n2\n3\n")
    rows, _ = _run(pq, cols, [_step("filter_rows", column="amt", operator="gt", value="999 OR 1=1")])
    # Whatever the exact comparison semantics, the injected OR 1=1 must never
    # cause every row to come back -- that would mean the injection worked.
    assert len(rows) < 3


def test_column_name_with_embedded_quote_does_not_break_sql(tmp_dir):
    pq, cols = _load_csv(tmp_dir, "data", 'id,"Rate ""A""",amt\n1,2,3\n')
    rows, _ = _run(pq, cols, [_step("math_transform", operation="round", column1="amt", column2="", math_operator="+", decimals=0, output_column="out", bins=[], bin_other="Other")])
    assert rows[0]["out"] == 3
    assert 'Rate "A"' in rows[0]


def test_vlookup_step_type_accepted_by_schema():
    step = StepSchema(
        id="s1",
        type="vlookup",
        label="vlookup",
        params={
            "lookup_dataset_id": "x",
            "left_key_col": "amt",
            "right_key_col": "min",
            "col_index_num": 2,
            "return_column": "rate",
            "range_lookup": True,
        },
    )
    assert step.type == "vlookup"


def test_vlookup_exact_and_approximate(tmp_dir):
    left_pq, left_cols = _load_csv(tmp_dir, "amts", "amt\n500\n1000\n7500\n20000\n")
    right_pq, _ = _load_csv(tmp_dir, "slab", "min,rate\n1000,0.05\n5000,0.08\n10000,0.1\n")

    rows, _ = _run(
        left_pq, left_cols,
        [_step(
            "vlookup", lookup_dataset_id="slab", left_key_col="amt", right_key_col="min",
            return_column="rate", range_lookup=True, if_not_found="NA",
        )],
        {"slab": right_pq},
    )
    rates = [r["rate"] for r in rows]
    # 500 is below the smallest key (1000) -> not found.
    assert rates[0] == "NA"
    assert rates[1] == "0.05"
    assert rates[2] == "0.08"
    assert rates[3] == "0.1"


def test_xlookup_blank_return_cell_is_blank_not_fallback(tmp_dir):
    """A matched row whose return cell is blank must stay blank -- if_not_found
    is used ONLY when there is no matching row at all."""
    left_pq, left_cols = _load_csv(tmp_dir, "ord", "o,customer_id\n1,cust-001\n")
    right_pq, _ = _load_csv(tmp_dir, "cust", "customer_id,tier\nCUST-001,\n")
    rows, _ = _run(
        left_pq, left_cols,
        [_step(
            "xlookup", lookup_dataset_id="cust", left_key_col="customer_id", right_key_col="customer_id",
            return_columns=["tier"], if_not_found="Not found", match_mode=0, search_mode=1,
        )],
        {"cust": right_pq},
    )
    assert rows[0]["tier"] in (None, "")


def test_row_order_preserved_after_lookup(tmp_dir):
    left_text = "o,k\n" + "".join(f"{i},K{i % 5}\n" for i in range(1, 51))
    left_pq, left_cols = _load_csv(tmp_dir, "left", left_text)
    right_pq, _ = _load_csv(tmp_dir, "right", "k,v\n" + "".join(f"K{i},{i}\n" for i in range(5)))
    rows, _ = _run(
        left_pq, left_cols,
        [_step("xlookup", lookup_dataset_id="r", left_key_col="k", right_key_col="k", return_columns=["v"], if_not_found="0")],
        {"r": right_pq},
    )
    assert [r["o"] for r in rows] == list(range(1, 51))


# -- Formula compiler (tokenizer/parser) -----------------------------------

def test_formula_compiler_rejects_unknown_function():
    sql = compile_formula_to_sql("READ_TEXT('/etc/passwd')", ["amt"])
    assert sql == "'#NAME?'"


def test_formula_compiler_if_basic():
    con = duckdb.connect()
    sql = compile_formula_to_sql('IF([amt]>1,"A","B")', ["amt"])
    result = con.execute(f"SELECT {sql} FROM (SELECT 5 AS amt)").fetchone()[0]
    assert result == "A"
    result2 = con.execute(f"SELECT {sql} FROM (SELECT 1 AS amt)").fetchone()[0]
    assert result2 == "B"
