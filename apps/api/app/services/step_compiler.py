import os
import json
import duckdb
from typing import List, Dict, Any, Tuple, Optional
from app.schemas.steps import StepSchema, GeneratedCode, StepSummary
from app.services.sql_safe import (
    quote_ident as Q,
    sql_string_literal,
    sql_number_literal,
    parse_excel_number,
    number_parse_sql,
    date_parse_sql,
    round_half_away_from_zero_sql,
    round_up_sql,
    round_down_sql,
)
from app.services.formula_compiler import compile_formula_to_sql


class StepCompiler:
    """
    Compiles typed pipeline steps into clean, executable DuckDB SQL queries
    and generates equivalent Polars, Power Query M, and Excel formulas.
    Supports all Phase 2 transformations and Phase 3 Lookup & Join suite.
    """

    DUCKDB_TYPE_MAP = {
        "text": "VARCHAR",
        "integer": "BIGINT",
        "float": "DOUBLE",
        "date": "DATE",
        "boolean": "BOOLEAN",
    }

    POLARS_TYPE_MAP = {
        "text": "pl.Utf8",
        "integer": "pl.Int64",
        "float": "pl.Float64",
        "date": "pl.Date",
        "boolean": "pl.Boolean",
    }

    PQ_TYPE_MAP = {
        "text": "type text",
        "integer": "Int64.Type",
        "float": "type number",
        "date": "type date",
        "boolean": "type logical",
    }

    @classmethod
    def compile_pipeline(
        cls,
        parquet_path: str,
        steps: List[StepSchema],
        initial_columns: List[str],
        dataset_paths: Optional[Dict[str, str]] = None,
    ) -> Tuple[str, List[StepSummary], List[str]]:
        """
        Compiles the entire step sequence into a CTE-based DuckDB SQL statement.
        Returns: (compiled_sql, step_summaries, final_column_names)
        """
        dataset_paths = dataset_paths or {}
        parquet_sql = parquet_path.replace("\\", "/")
        ctes: List[str] = []
        current_cols = list(initial_columns)
        summaries: List[StepSummary] = []

        # Base step: source data
        ctes.append(
            f"step_0 AS (\n    SELECT row_number() OVER () AS _row_id, * FROM read_parquet('{parquet_sql}')\n)"
        )

        step_counter = 0

        for idx, step in enumerate(steps):
            if not step.enabled:
                continue

            prev_cte = f"step_{step_counter}"
            step_counter += 1
            curr_cte = f"step_{step_counter}"

            stype = step.type
            params = step.params
            generated = GeneratedCode(sql="", polars="", power_query_m="", excel_formula=None)

            # Phase 2 steps
            if stype == "change_type":
                col = params["column"]
                ttype = params["target_type"]
                duck_type = cls.DUCKDB_TYPE_MAP.get(ttype, "VARCHAR")

                if ttype == "date":
                    # Shared date parser; output stays a DATE (ISO yyyy-mm-dd on display).
                    cast_expr = date_parse_sql(Q(col))
                elif ttype == "float":
                    cast_expr = number_parse_sql(Q(col))
                elif ttype == "integer":
                    # Truncate only if the parsed value is a whole number, else blank.
                    n = number_parse_sql(Q(col))
                    cast_expr = f"(CASE WHEN {n} IS NOT NULL AND {n} = FLOOR({n}) THEN CAST({n} AS BIGINT) ELSE NULL END)"
                elif ttype == "boolean":
                    low = f"LOWER(TRIM(CAST({Q(col)} AS VARCHAR)))"
                    cast_expr = (
                        f"(CASE WHEN {low} IN ('true', 'yes', 'y', '1') THEN TRUE "
                        f"WHEN {low} IN ('false', 'no', 'n', '0') THEN FALSE ELSE NULL END)"
                    )
                else:
                    cast_expr = f'TRY_CAST({Q(col)} AS {duck_type})'

                proj = []
                for c in current_cols:
                    if c == col:
                        proj.append(f'{cast_expr} AS {Q(c)}')
                    else:
                        proj.append(f'{Q(c)}')

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'TRY_CAST({Q(col)} AS {duck_type}) AS {Q(col)}'
                generated.polars = f'df = df.with_columns(pl.col({Q(col)}).cast({cls.POLARS_TYPE_MAP.get(ttype, "pl.Utf8")}))'
                generated.power_query_m = f'Table.TransformColumnTypes(Source, {{{Q(col)}, {cls.PQ_TYPE_MAP.get(ttype, "type text")}}})'
                if ttype in ["integer", "float"]:
                    generated.excel_formula = f'=VALUE({col}2)'
                elif ttype == "text":
                    generated.excel_formula = f'=TEXT({col}2, "@")'

            elif stype == "rename_column":
                old_name = params["column"]
                new_name = params["new_name"]

                proj = []
                new_cols = []
                for c in current_cols:
                    if c == old_name:
                        proj.append(f'{Q(c)} AS {Q(new_name)}')
                        new_cols.append(new_name)
                    else:
                        proj.append(f'{Q(c)}')
                        new_cols.append(c)
                current_cols = new_cols

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{Q(old_name)} AS {Q(new_name)}'
                generated.polars = f'df = df.rename({{{Q(old_name)}: {Q(new_name)}}})'
                generated.power_query_m = f'Table.RenameColumns(Source, {{{Q(old_name)}, {Q(new_name)}}})'

            elif stype == "filter_rows":
                raw_conds = params.get("conditions")
                logic = str(params.get("combine") or params.get("logic") or "AND").upper()
                if isinstance(raw_conds, list) and raw_conds:
                    sub_sqls = []
                    for c in raw_conds:
                        if c.get("column"):
                            sub_sqls.append(cls._build_filter_condition(c["column"], c.get("operator", "eq"), c.get("value")))
                    where_cond = f" {logic} ".join(sub_sqls) if sub_sqls else "1=1"
                else:
                    col = params.get("column", current_cols[0] if current_cols else "col")
                    op = params.get("operator", "eq")
                    val = params.get("value")
                    where_cond = cls._build_filter_condition(col, op, val)

                cte_sql = f"{curr_cte} AS (\n    SELECT * FROM {prev_cte} WHERE {where_cond}\n)"
                ctes.append(cte_sql)

                generated.sql = f"WHERE {where_cond}"
                generated.polars = cls._build_polars_filter(params.get("column", "col"), params.get("operator", "eq"), params.get("value"))
                generated.power_query_m = f'Table.SelectRows(Source, each {where_cond})'
                generated.excel_formula = f'=FILTER(A2:Z1000, {cls._build_excel_filter(params.get("column", "col"), params.get("operator", "eq"), params.get("value"))})'

            elif stype == "sort_rows":
                raw_keys = params.get("sort_keys") or params.get("conditions")
                if isinstance(raw_keys, list) and raw_keys:
                    order_clauses = []
                    for sk in raw_keys:
                        sc = sk.get("column")
                        if sc:
                            sdir = "DESC" if str(sk.get("direction", "asc")).lower() == "desc" else "ASC"
                            order_clauses.append(f'{Q(sc)} {sdir} NULLS LAST')
                    order_sql = ", ".join(order_clauses) if order_clauses else '1 ASC'
                else:
                    col = params.get("column", current_cols[0] if current_cols else "col")
                    dir_str = "DESC" if str(params.get("direction", "asc")).lower() == "desc" else "ASC"
                    order_sql = f'{Q(col)} {dir_str} NULLS LAST'

                cte_sql = f"{curr_cte} AS (\n    SELECT * FROM {prev_cte} ORDER BY {order_sql}\n)"
                ctes.append(cte_sql)

                generated.sql = f'ORDER BY {order_sql}'
                generated.polars = f'df = df.sort(...)'
                generated.power_query_m = f'Table.Sort(Source, ...)'
                generated.excel_formula = f'=SORT(A2:Z1000, 1)'

            elif stype == "remove_duplicates":
                key_cols = params.get("columns", [])
                if not key_cols:
                    key_cols = list(current_cols)
                keep = params.get("keep_mode") or params.get("keep", "first")
                # Case-insensitive ONLY (no trim), per SPEC.md.
                safe_part = ", ".join([f"LOWER(CAST({Q(k)} AS VARCHAR))" for k in key_cols])

                if keep == "duplicates_only":
                    cte_sql = f"""{curr_cte} AS (
    SELECT * FROM (
        SELECT *, count(*) OVER (PARTITION BY {safe_part}) as _dedup_count
        FROM {prev_cte}
    ) WHERE _dedup_count > 1
)"""
                else:
                    order_dir = "ASC" if keep == "first" else "DESC"
                    cte_sql = f"""{curr_cte} AS (
    SELECT * FROM (
        SELECT *, row_number() OVER (PARTITION BY {safe_part} ORDER BY _row_id {order_dir}) as _dedup_rank
        FROM {prev_cte}
    ) WHERE _dedup_rank = 1
)"""
                ctes.append(cte_sql)

                cols_repr = json.dumps(key_cols)
                generated.sql = f"QUALIFY COUNT(*) OVER (PARTITION BY {safe_part}) > 1" if keep == "duplicates_only" else f"QUALIFY ROW_NUMBER() OVER (PARTITION BY {safe_part} ORDER BY _row_id) = 1"
                generated.polars = f'df = df.unique(subset={cols_repr}, keep={Q(keep)})'
                generated.power_query_m = f'Table.Distinct(Source, {cols_repr})'
                generated.excel_formula = f'=UNIQUE(A2:Z1000)'

            elif stype == "fill_down":
                col = params["column"]
                direction = params.get("direction", "down")
                fn = "LAST_VALUE" if direction == "down" else "FIRST_VALUE"
                frame = (
                    "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW"
                    if direction == "down"
                    else "ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING"
                )

                proj = []
                for c in current_cols:
                    if c == col:
                        proj.append(f'{fn}({Q(c)} IGNORE NULLS) OVER (ORDER BY _row_id {frame}) AS {Q(c)}')
                    else:
                        proj.append(f'{Q(c)}')

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{fn}({Q(col)} IGNORE NULLS) OVER (ORDER BY _row_id {frame}) AS {Q(col)}'
                generated.polars = f'df = df.with_columns(pl.col({Q(col)}).forward_fill())' if direction == "down" else f'df = df.with_columns(pl.col({Q(col)}).backward_fill())'
                generated.power_query_m = f'Table.FillDown(Source, {{{Q(col)}}})' if direction == "down" else f'Table.FillUp(Source, {{{Q(col)}}})'
                generated.excel_formula = f'=IF(ISBLANK({col}2), {col}1, {col}2)'

            elif stype == "replace_values":
                col = params["column"]
                s_val = params.get("search_value")
                r_val = params.get("replace_value", "")
                m_type = params.get("match_type", "exact")

                escaped_r = str(r_val).replace("'", "''")

                if m_type == "is_null":
                    expr = f'COALESCE({Q(col)}, \'{escaped_r}\')'
                elif m_type == "contains":
                    escaped_s = str(s_val).replace("'", "''")
                    expr = f'REPLACE(CAST({Q(col)} AS VARCHAR), \'{escaped_s}\', \'{escaped_r}\')'
                else:  # exact
                    escaped_s = str(s_val).replace("'", "''")
                    expr = f'CASE WHEN CAST({Q(col)} AS VARCHAR) = \'{escaped_s}\' THEN \'{escaped_r}\' ELSE {Q(col)} END'

                proj = []
                for c in current_cols:
                    if c == col:
                        proj.append(f'{expr} AS {Q(c)}')
                    else:
                        proj.append(f'{Q(c)}')

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{expr} AS {Q(col)}'
                generated.polars = f'df = df.with_columns(pl.col({Q(col)}).replace({Q(s_val)}, {Q(r_val)}))'
                generated.power_query_m = f'Table.ReplaceValue(Source, {Q(s_val)}, {Q(r_val)}, Replacer.ReplaceText, {{{Q(col)}}})'
                generated.excel_formula = f'=SUBSTITUTE({col}2, {Q(s_val)}, {Q(r_val)})'

            elif stype == "split_column":
                col = params["column"]
                delim = params.get("delimiter", ",")
                new_names = params.get("new_column_names", [f"{col}_1", f"{col}_2"])
                keep_orig = params.get("keep_original", True)  # default True per SPEC.md

                escaped_delim = delim.replace("'", "''")
                proj = []
                new_cols_added = []

                for c in current_cols:
                    if c == col and not keep_orig:
                        for i, n_name in enumerate(new_names):
                            proj.append(f'string_split(CAST({Q(c)} AS VARCHAR), \'{escaped_delim}\')[{i+1}] AS {Q(n_name)}')
                            new_cols_added.append(n_name)
                    else:
                        proj.append(f'{Q(c)}')
                        new_cols_added.append(c)

                if keep_orig:
                    for i, n_name in enumerate(new_names):
                        proj.append(f'string_split(CAST({Q(col)} AS VARCHAR), \'{escaped_delim}\')[{i+1}] AS {Q(n_name)}')
                        new_cols_added.append(n_name)

                current_cols = new_cols_added

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'string_split(CAST({Q(col)} AS VARCHAR), \'{escaped_delim}\')'
                generated.polars = f'df = df.with_columns([pl.col({Q(col)}).str.split({Q(delim)}).list.get(i).alias(name) for i, name in enumerate({new_names})])'
                generated.power_query_m = f'Table.SplitColumn(Source, {Q(col)}, Splitter.SplitTextByDelimiter({Q(delim)}), {json.dumps(new_names)})'
                generated.excel_formula = f'=TEXTSPLIT({col}2, {Q(delim)})'

            # Phase 3: Lookup & Join suite
            elif stype in ["xlookup", "lookup", "vlookup"]:
                lk_ds_id = params["lookup_dataset_id"]
                lk_path = dataset_paths.get(lk_ds_id, "")
                lk_sql = lk_path.replace("\\", "/")
                left_key = params["left_key_col"]
                right_key = params["right_key_col"]
                if_not_found = params.get("if_not_found")

                if stype == "vlookup":
                    match_mode = -1 if params.get("range_lookup") else 0
                    search_mode = 1
                    ret_cols = list(params.get("return_columns") or [])
                    single_ret = params.get("return_column")
                    if single_ret and single_ret not in ret_cols:
                        ret_cols = [single_ret] + ret_cols
                    if not ret_cols and params.get("col_index_num"):
                        # Resolve the Nth column (1-based) of the lookup dataset.
                        try:
                            probe = duckdb.connect()
                            lk_desc_cols = [d[0] for d in probe.execute(
                                f"DESCRIBE SELECT * FROM read_parquet('{lk_sql}') LIMIT 0"
                            ).fetchall()]
                            probe.close()
                            idx = int(params["col_index_num"]) - 1
                            if 0 <= idx < len(lk_desc_cols):
                                ret_cols = [lk_desc_cols[idx]]
                        except Exception:
                            ret_cols = []
                    out_rename = params.get("output_column")
                else:
                    match_mode = int(params.get("match_mode", 0) or 0)
                    search_mode = int(params.get("search_mode", 1) or 1)
                    ret_cols = params.get("return_columns", [])
                    out_rename = None

                ret_target_names = []
                for i, rc in enumerate(ret_cols):
                    if out_rename and len(ret_cols) == 1:
                        target_name = out_rename
                    elif rc in current_cols:
                        target_name = f"{rc}_lookup"
                    else:
                        target_name = rc
                    ret_target_names.append((rc, target_name))

                lk_table = f"_lk_{step_counter}"
                ctes.append(f"""{lk_table} AS (
    SELECT *, row_number() OVER () AS _lk_rn FROM read_parquet('{lk_sql}')
)""")

                left_key_sql = f"{prev_cte}.{Q(left_key)}"
                right_key_sql = f"{lk_table}.{Q(right_key)}"
                key_is_blank = f"({left_key_sql} IS NULL OR TRIM(CAST({left_key_sql} AS VARCHAR)) = '')"
                rn_dir = "ASC" if search_mode != -1 else "DESC"

                if match_mode == 2:
                    norm_left = f"LOWER(TRIM(CAST({left_key_sql} AS VARCHAR)))"
                    pattern = (
                        f"REPLACE(REPLACE(REPLACE(REPLACE({norm_left}, '%', '\\%'), '_', '\\_'), '*', '%'), '?', '_')"
                    )
                    norm_right = f"LOWER(TRIM(CAST({right_key_sql} AS VARCHAR)))"
                    match_cond = f"{norm_right} LIKE {pattern} ESCAPE '\\'"
                    order_sql = f"ORDER BY _lk_rn {rn_dir}"
                elif match_mode in (-1, 1):
                    left_num = f"TRY_CAST({left_key_sql} AS DOUBLE)"
                    right_num = f"TRY_CAST({right_key_sql} AS DOUBLE)"
                    if match_mode == -1:
                        rel_cond = f"{right_num} <= {left_num}"
                        num_dir = "DESC"
                    else:
                        rel_cond = f"{right_num} >= {left_num}"
                        num_dir = "ASC"
                    match_cond = f"{left_num} IS NOT NULL AND {right_num} IS NOT NULL AND {rel_cond}"
                    order_sql = f"ORDER BY {right_num} {num_dir}, _lk_rn {rn_dir}"
                else:
                    norm_left = f"LOWER(TRIM(CAST({left_key_sql} AS VARCHAR)))"
                    norm_right = f"LOWER(TRIM(CAST({right_key_sql} AS VARCHAR)))"
                    match_cond = f"{norm_right} = {norm_left}"
                    order_sql = f"ORDER BY _lk_rn {rn_dir}"

                join_sql = f"""LEFT JOIN LATERAL (
        SELECT * FROM {lk_table}
        WHERE NOT {key_is_blank} AND {match_cond}
        {order_sql}
        LIMIT 1
    ) AS lk ON TRUE"""

                has_fallback_text = if_not_found not in (None, "")
                ret_proj = []
                for rc, target_name in ret_target_names:
                    if has_fallback_text:
                        esc_fb = str(if_not_found).replace("'", "''")
                        ret_proj.append(
                            f"CASE WHEN lk._lk_rn IS NULL THEN '{esc_fb}' ELSE CAST(lk.{Q(rc)} AS VARCHAR) END AS {Q(target_name)}"
                        )
                    else:
                        ret_proj.append(f"lk.{Q(rc)} AS {Q(target_name)}")
                    current_cols.append(target_name)

                left_proj = [f'{prev_cte}.{Q(c)}' for c in current_cols[: len(current_cols) - len(ret_target_names)]]
                if ret_proj:
                    select_extra = ", " + ", ".join(ret_proj)
                else:
                    select_extra = ""
                cte_sql = f"""{curr_cte} AS (
    SELECT {prev_cte}._row_id, {', '.join(left_proj)}{select_extra}
    FROM {prev_cte}
    {join_sql}
)"""
                ctes.append(cte_sql)

                generated.sql = f'LEFT JOIN LATERAL (SELECT * FROM read_parquet(...) WHERE ...) lk ON TRUE'
                generated.polars = f'df = df.join(lookup_df, left_on={Q(left_key)}, right_on={Q(right_key)}, how="left")'
                generated.power_query_m = f'Table.NestedJoin(Source, {{{Q(left_key)}}}, LookupTable, {{{Q(right_key)}}}, "Lookup", JoinKind.LeftOuter)'
                fallback_repr = Q(if_not_found) if if_not_found is not None else '""'
                if stype == "vlookup":
                    generated.excel_formula = f'=VLOOKUP({left_key}2, LookupRange, {params.get("col_index_num", 2)}, {str(bool(params.get("range_lookup"))).upper()})'
                else:
                    first_ret = ret_cols[0] if ret_cols else "Result"
                    generated.excel_formula = (
                        f'=XLOOKUP({left_key}2, LookupSheet!{Q(right_key)}, LookupSheet!{Q(first_ret)}, '
                        f'{fallback_repr}, {match_mode}, {search_mode})'
                    )

            elif stype in ["append", "append_tables"]:
                raw_ids = params.get("dataset_ids") or []
                if not raw_ids and params.get("append_dataset_id"):
                    raw_ids = [params["append_dataset_id"]]
                elif not raw_ids and params.get("right_dataset_id"):
                    raw_ids = [params["right_dataset_id"]]
                if not raw_ids and dataset_paths:
                    raw_ids = [list(dataset_paths.keys())[0]]

                union_kw = "UNION" if params.get("union_type") == "distinct" else "UNION ALL"
                align_mode = params.get("alignment_mode", "by_name")

                # Custom Provenance / Discriminator Column
                add_custom_col = bool(params.get("add_custom_column") or params.get("custom_column_name"))
                custom_col = str(params.get("custom_column_name") or "").strip()
                primary_val = str(params.get("primary_value") if params.get("primary_value") is not None else "").replace("'", "''")
                append_val = str(params.get("appended_value") if params.get("appended_value") is not None else "").replace("'", "''")

                # Incremental key handling
                inc_mode = params.get("incremental_mode") or ("distinct" if params.get("union_type") == "distinct" else "all")
                key_col = params.get("key_column")

                for app_ds_id in raw_ids:
                    app_path = dataset_paths.get(app_ds_id, "")
                    app_sql = app_path.replace("\\", "/")
                    if align_mode == "by_name" and app_path and os.path.exists(app_path):
                        try:
                            temp_cols = [d[0] for d in duckdb.connect().execute(f"DESCRIBE SELECT * FROM read_parquet('{app_sql}') LIMIT 0").fetchall()]
                            for tc in temp_cols:
                                if tc != "_row_id" and tc not in current_cols:
                                    current_cols.append(tc)
                        except Exception:
                            pass

                if add_custom_col and custom_col and custom_col not in current_cols:
                    current_cols.append(custom_col)

                # Build left query
                if add_custom_col and custom_col:
                    if custom_col in current_cols:
                        left_proj = f'* EXCLUDE(_row_id, {Q(custom_col)}), COALESCE({Q(custom_col)}, \'{primary_val}\') AS {Q(custom_col)}'
                    else:
                        left_proj = f'* EXCLUDE(_row_id), \'{primary_val}\' AS {Q(custom_col)}'
                else:
                    left_proj = '* EXCLUDE(_row_id)'

                left_where = ""
                right_selects = []
                for app_ds_id in raw_ids:
                    app_path = dataset_paths.get(app_ds_id, "")
                    app_sql = app_path.replace("\\", "/")
                    right_where = ""

                    if key_col and inc_mode == "append_new_only":
                        right_where = f' WHERE {Q(key_col)} NOT IN (SELECT {Q(key_col)} FROM {prev_cte})'
                    elif key_col and inc_mode == "upsert":
                        left_where = f' WHERE {Q(key_col)} NOT IN (SELECT {Q(key_col)} FROM read_parquet(\'{app_sql}\'))'

                    if add_custom_col and custom_col:
                        right_proj = f'*, \'{append_val}\' AS {Q(custom_col)}'
                    else:
                        right_proj = '*'

                    if align_mode == "by_position":
                        proj_cols = ", ".join([f'{Q(c)}' for c in current_cols])
                        right_selects.append(f"SELECT {proj_cols} FROM (SELECT {right_proj} FROM read_parquet('{app_sql}'){right_where})")
                    else:
                        right_selects.append(f"SELECT {right_proj} FROM read_parquet('{app_sql}'){right_where}")

                if not right_selects:
                    right_selects.append(f"SELECT {left_proj} FROM {prev_cte} LIMIT 0")

                if align_mode == "by_position":
                    proj_cols = ", ".join([f'{Q(c)}' for c in current_cols])
                    base_select = f"SELECT {proj_cols} FROM (SELECT {left_proj} FROM {prev_cte}{left_where})"
                    union_chain = f"\n        {union_kw}\n        ".join([base_select] + right_selects)
                    cte_sql = f"""{curr_cte} AS (
    SELECT row_number() OVER () AS _row_id, * FROM (
        {union_chain}
    )
)"""
                else:
                    base_select = f"SELECT {left_proj} FROM {prev_cte}{left_where}"
                    union_chain = f"\n        {union_kw} BY NAME\n        ".join([base_select] + right_selects)
                    cte_sql = f"""{curr_cte} AS (
    SELECT row_number() OVER () AS _row_id, * FROM (
        {union_chain}
    )
)"""
                ctes.append(cte_sql)

                if add_custom_col and custom_col:
                    first_sql = dataset_paths.get(raw_ids[0], "").replace("\\", "/") if raw_ids else "append_table"
                    generated.sql = f"SELECT {left_proj} FROM table UNION ALL BY NAME SELECT {right_proj} FROM read_parquet('{first_sql}')"
                    generated.polars = f'df = pl.concat([df.with_columns(pl.lit({Q(primary_val)}).alias({Q(custom_col)})), *[app_df.with_columns(pl.lit({Q(append_val)}).alias({Q(custom_col)})) for app_df in other_dfs]])'
                    generated.power_query_m = f'Table.Combine({{Table.AddColumn(Source, {Q(custom_col)}, each {Q(primary_val)}), ...}})'
                    generated.excel_formula = f'=VSTACK(HSTACK(Table1, {Q(primary_val)}), HSTACK(Table2, {Q(append_val)}))'
                else:
                    first_sql = dataset_paths.get(raw_ids[0], "").replace("\\", "/") if raw_ids else "append_table"
                    generated.sql = f"{union_kw} {'BY NAME ' if align_mode == 'by_name' else ''}SELECT * FROM read_parquet('{first_sql}')"
                    generated.polars = f'df = pl.concat([df, *other_dfs], how="{"diagonal" if align_mode == "by_name" else "vertical"}")'
                    generated.power_query_m = f'Table.Combine({{Source, Table2, ...}})'
                    generated.excel_formula = f'=VSTACK(Table1, Table2, ...)'

            elif stype == "custom_column":
                new_col = (params.get("new_column") or params.get("column") or params.get("target_column") or "custom_col").strip()
                raw_val = params.get("value")
                expr = params.get("expression") or params.get("formula")
                if expr:
                    # SECURITY: `expr` is user-controlled text. It is NEVER pasted into SQL
                    # directly. It is parsed by a real tokenizer/parser (formula_compiler.py)
                    # into an AST, and only the AST -- with every literal and column
                    # reference safely escaped/quoted -- is turned into SQL. Anything the
                    # grammar does not recognise (e.g. arbitrary SQL such as
                    # `(SELECT content FROM read_text(...))`) compiles to the literal
                    # Excel error value '#NAME?' instead of ever reaching the query.
                    val_sql = compile_formula_to_sql(str(expr), current_cols)
                    val_str = str(expr)
                else:
                    val_sql = sql_string_literal(raw_val if raw_val is not None else "")
                    val_str = str(raw_val)

                proj = [f'{Q(c)}' for c in current_cols] + [f'{val_sql} AS {Q(new_col)}']
                current_cols.append(new_col)
                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{val_sql} AS {Q(new_col)}'
                generated.polars = f'df = df.with_columns(pl.lit({Q(val_str)}).alias({Q(new_col)}))'
                generated.power_query_m = f'Table.AddColumn(Source, {Q(new_col)}, each {Q(val_str)})'
                generated.excel_formula = f'={Q(val_str)}'

            elif stype == "remove_column":
                to_drop = set(params.get("columns", []) if isinstance(params.get("columns"), list) else [params.get("column")] if params.get("column") else [])
                keep_selected = bool(params.get("keep_selected"))
                if keep_selected:
                    new_cols = [c for c in current_cols if c in to_drop]
                else:
                    new_cols = [c for c in current_cols if c not in to_drop]
                if not new_cols:
                    new_cols = list(current_cols)
                current_cols = new_cols
                proj = [f'{Q(c)}' for c in current_cols]
                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)
                generated.sql = f"SELECT {', '.join(proj)} FROM {prev_cte}"
                generated.polars = f'df = df.select({json.dumps(current_cols)})'
                generated.power_query_m = f'Table.SelectColumns(Source, {json.dumps(current_cols)})'

            elif stype == "reorder_columns":
                order = params.get("column_order", [])
                if isinstance(order, list) and order:
                    new_cols = [c for c in order if c in current_cols] + [c for c in current_cols if c not in order]
                    current_cols = new_cols
                proj = [f'{Q(c)}' for c in current_cols]
                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)
                generated.sql = f"SELECT {', '.join(proj)} FROM {prev_cte}"
                generated.polars = f'df = df.select({json.dumps(current_cols)})'
                generated.power_query_m = f'Table.ReorderColumns(Source, {json.dumps(current_cols)})'

            elif stype == "promote_headers":
                # Real implementation: the first row's values become the new
                # column names, and that row is dropped.
                probe = duckdb.connect()
                try:
                    probe_sql = "WITH\n" + ",\n".join(ctes) + f"\nSELECT * FROM {prev_cte} ORDER BY _row_id LIMIT 1"
                    cur = probe.execute(probe_sql)
                    desc = cur.description
                    first_row = cur.fetchone()
                finally:
                    probe.close()

                old_names = [d[0] for d in desc if d[0] != "_row_id"]
                seen: Dict[str, int] = {}
                new_cols: List[str] = []
                rename_proj = []
                for d_idx, d in enumerate(desc):
                    if d[0] == "_row_id":
                        continue
                    raw_new = first_row[d_idx] if first_row else None
                    base_new = str(raw_new).strip() if raw_new not in (None, "") else d[0]
                    candidate = base_new
                    n = seen.get(base_new, 0)
                    while candidate in new_cols:
                        n += 1
                        candidate = f"{base_new}_{n}"
                    seen[base_new] = n
                    new_cols.append(candidate)
                    rename_proj.append(f"{Q(d[0])} AS {Q(candidate)}")

                current_cols = new_cols
                cte_sql = (
                    f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(rename_proj)} FROM {prev_cte} "
                    f"WHERE _row_id > (SELECT MIN(_row_id) FROM {prev_cte})\n)"
                )
                ctes.append(cte_sql)
                generated.sql = "-- Promote first row as headers, drop that row"
                generated.polars = "df = df.rename(dict(zip(df.columns, df.row(0)))).slice(1)"
                generated.power_query_m = "Table.PromoteHeaders(Source)"

            elif stype == "remove_rows":
                mode = params.get("mode", "top_n")
                count = max(0, int(params.get("count", 1)))
                if mode == "top_n":
                    cte_sql = f"{curr_cte} AS (\n    SELECT * FROM {prev_cte} OFFSET {count}\n)"
                elif mode == "keep_top_n":
                    cte_sql = f"{curr_cte} AS (\n    SELECT * FROM {prev_cte} LIMIT {count}\n)"
                elif mode == "blank_rows":
                    chk_cols = params.get("columns") or list(current_cols)
                    null_conds = " AND ".join([f'({Q(c)} IS NULL OR CAST({Q(c)} AS VARCHAR) = \'\')' for c in chk_cols])
                    cte_sql = f"{curr_cte} AS (\n    SELECT * FROM {prev_cte} WHERE NOT ({null_conds})\n)"
                else:
                    cte_sql = f"{curr_cte} AS (\n    SELECT * FROM {prev_cte}\n)"
                ctes.append(cte_sql)
                generated.sql = cte_sql
                generated.polars = f'df = df.slice({count})' if mode == 'top_n' else 'df = df'
                generated.power_query_m = f'Table.Skip(Source, {count})' if mode == 'top_n' else 'Source'

            elif stype == "transpose":
                # NOT SUPPORTED: transpose turns every existing row into a new
                # COLUMN. This pipeline compiler represents a fixed, static
                # column list across the whole step sequence, so it cannot
                # express a transform whose output schema depends on the
                # number of input *rows* (unbounded, and only known at
                # execution time). Rather than silently no-op (the previous
                # behaviour), raise a clear, actionable error.
                raise NotImplementedError(
                    "The 'transpose' step is not supported by the server engine: "
                    "it would require a column count that depends on the number "
                    "of input rows, which this SQL pipeline compiler cannot "
                    "represent. Use the standalone/browser engine for transpose, "
                    "or restructure the data with pivot/unpivot instead."
                )

            elif stype == "standardize_values":
                col = params.get("column", current_cols[0] if current_cols else "col")
                out_col = params.get("output_column") or col
                mappings = params.get("mappings", [])
                when_clauses = []
                for m in mappings:
                    f_val = str(m.get("from", "")).replace("'", "''")
                    t_val = str(m.get("to", "")).replace("'", "''")
                    when_clauses.append(f"WHEN LOWER(TRIM(CAST(\"{col}\" AS VARCHAR))) = LOWER('{f_val}') THEN '{t_val}'")
                case_expr = f"CASE {' '.join(when_clauses)} ELSE \"{col}\" END" if when_clauses else f'{Q(col)}'
                proj = []
                if out_col in current_cols:
                    for c in current_cols:
                        proj.append(f'{case_expr} AS {Q(c)}' if c == out_col else f'{Q(c)}')
                else:
                    proj = [f'{Q(c)}' for c in current_cols] + [f'{case_expr} AS {Q(out_col)}']
                    current_cols.append(out_col)
                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)
                generated.sql = f'{case_expr} AS {Q(out_col)}'
                generated.polars = f'df = df.with_columns(...) '
                generated.power_query_m = 'Table.ReplaceValue(Source, ...)'

            elif stype == "impute_missing":
                col = params.get("column", current_cols[0] if current_cols else "col")
                out_col = params.get("output_column") or col
                strat = params.get("strategy", "mean")
                if strat == "mean":
                    val_expr = f'COALESCE({Q(col)}, AVG({Q(col)}) OVER ())'
                elif strat == "median":
                    val_expr = f'COALESCE({Q(col)}, MEDIAN({Q(col)}) OVER ())'
                else:
                    fixed = str(params.get("fixed_value", 0)).replace("'", "''")
                    val_expr = f'COALESCE({Q(col)}, \'{fixed}\')'
                proj = []
                if out_col in current_cols:
                    for c in current_cols:
                        proj.append(f'{val_expr} AS {Q(c)}' if c == out_col else f'{Q(c)}')
                else:
                    proj = [f'{Q(c)}' for c in current_cols] + [f'{val_expr} AS {Q(out_col)}']
                    current_cols.append(out_col)
                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)
                generated.sql = f'{val_expr} AS {Q(out_col)}'
                generated.polars = f'df = df.with_columns(pl.col({Q(col)}).fill_null(strategy={Q(strat)}).alias({Q(out_col)}))'
                generated.power_query_m = 'Table.ReplaceValue(Source, null, ...)'

            elif stype == "flag_outliers":
                col = params.get("column", current_cols[0] if current_cols else "col")
                out_col = params.get("output_column") or f"{col}_is_outlier"
                outlier_case = f'CASE WHEN {Q(col)} < (QUANTILE_CONT({Q(col)}, 0.25) OVER () - 1.5 * (QUANTILE_CONT({Q(col)}, 0.75) OVER () - QUANTILE_CONT({Q(col)}, 0.25) OVER ())) OR {Q(col)} > (QUANTILE_CONT({Q(col)}, 0.75) OVER () + 1.5 * (QUANTILE_CONT({Q(col)}, 0.75) OVER () - QUANTILE_CONT({Q(col)}, 0.25) OVER ())) THEN TRUE ELSE FALSE END'
                proj = [f'{Q(c)}' for c in current_cols] + [f'{outlier_case} AS {Q(out_col)}']
                current_cols.append(out_col)
                filt = f' WHERE NOT ({out_col})' if params.get("filter_outliers") else ''
                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}{filt}\n)"
                ctes.append(cte_sql)
                generated.sql = f'{outlier_case} AS {Q(out_col)}'
                generated.polars = f'df = df.with_columns(...) '
                generated.power_query_m = f'// Flag outliers on {col}'

            elif stype == "top_bottom_n":
                col = params.get("column", current_cols[0] if current_cols else "col")
                mode = params.get("mode", "top")
                n = max(1, int(params.get("n", 10)))
                dir_str = "DESC" if mode == "top" else "ASC"
                cte_sql = f"{curr_cte} AS (\n    SELECT * FROM {prev_cte} ORDER BY \"{col}\" {dir_str} NULLS LAST LIMIT {n}\n)"
                ctes.append(cte_sql)
                generated.sql = f'SELECT * FROM {prev_cte} ORDER BY {Q(col)} {dir_str} LIMIT {n}'
                generated.polars = f'df = df.sort({Q(col)}, descending={ "True" if mode == "top" else "False" }).head({n})'
                generated.power_query_m = f'Table.FirstN(Table.Sort(Source, {{{Q(col)}, Order.{"Descending" if mode == "top" else "Ascending"}}}), {n})'

            elif stype in ["join", "join_builder"]:
                r_ds_id = params.get("right_dataset_id")
                j_type = params.get("join_type", "left").lower()
                r_path = dataset_paths.get(r_ds_id, "")
                r_sql = r_path.replace("\\", "/")
                key_pairs = params.get("key_pairs", [])
                selected_r_cols = params.get("selected_right_columns", [])
                s_left = params.get("suffix_left", "_left")
                s_right = params.get("suffix_right", "_right")
                dedupe_r = params.get("dedupe_right_first", False)

                # Right table CTE
                r_cte = f"_r_{step_counter}"
                if dedupe_r and key_pairs:
                    dedup_p = ", ".join([f'"{kp["right_col"]}"' for kp in key_pairs])
                    ctes.append(f"""{r_cte} AS (
    SELECT * FROM (
        SELECT *, row_number() OVER (PARTITION BY {dedup_p} ORDER BY 1) as _r_rn
        FROM read_parquet('{r_sql}')
    ) WHERE _r_rn = 1
)""")
                else:
                    ctes.append(f"""{r_cte} AS (\n    SELECT * FROM read_parquet('{r_sql}')\n)""")

                # Build ON conditions
                on_conditions = []
                for kp in key_pairs:
                    lc = f'{prev_cte}."{kp["left_col"]}"'
                    rc = f'{r_cte}."{kp["right_col"]}"'
                    if kp.get("trim_whitespace"):
                        lc = f"trim(cast({lc} as varchar))"
                        rc = f"trim(cast({rc} as varchar))"
                    if kp.get("case_insensitive"):
                        lc = f"lower(cast({lc} as varchar))"
                        rc = f"lower(cast({rc} as varchar))"
                    on_conditions.append(f"{lc} = {rc}")

                on_clause = f" ON {' AND '.join(on_conditions)}" if on_conditions else ""

                # Handle join types
                join_sql_kw = "LEFT JOIN"
                pq_join_kind = "JoinKind.LeftOuter"
                polars_how = "left"

                if j_type == "inner":
                    join_sql_kw = "INNER JOIN"
                    pq_join_kind = "JoinKind.Inner"
                    polars_how = "inner"
                elif j_type == "right":
                    join_sql_kw = "RIGHT JOIN"
                    pq_join_kind = "JoinKind.RightOuter"
                    polars_how = "right"
                elif j_type == "full":
                    join_sql_kw = "FULL OUTER JOIN"
                    pq_join_kind = "JoinKind.FullOuter"
                    polars_how = "full"
                elif j_type == "left_semi":
                    join_sql_kw = "SEMI JOIN"
                    pq_join_kind = "JoinKind.LeftSemi"
                    polars_how = "semi"
                elif j_type == "left_anti":
                    join_sql_kw = "ANTI JOIN"
                    pq_join_kind = "JoinKind.LeftAnti"
                    polars_how = "anti"
                elif j_type == "cross":
                    join_sql_kw = "CROSS JOIN"
                    on_clause = ""
                    pq_join_kind = "JoinKind.Inner"
                    polars_how = "cross"

                # Projection columns
                new_projected_cols = []
                proj = [f"{prev_cte}._row_id"]

                if j_type in ["left_semi", "left_anti"]:
                    # Keeps only left columns
                    for c in current_cols:
                        proj.append(f'{prev_cte}.{Q(c)}')
                        new_projected_cols.append(c)
                else:
                    for c in current_cols:
                        if c in selected_r_cols:
                            proj.append(f'{prev_cte}.{Q(c)} AS "{c}{s_left}"')
                            new_projected_cols.append(f"{c}{s_left}")
                        else:
                            proj.append(f'{prev_cte}.{Q(c)}')
                            new_projected_cols.append(c)

                    for rc in selected_r_cols:
                        if rc in current_cols:
                            proj.append(f'{r_cte}.{Q(rc)} AS "{rc}{s_right}"')
                            new_projected_cols.append(f"{rc}{s_right}")
                        else:
                            proj.append(f'{r_cte}.{Q(rc)}')
                            new_projected_cols.append(rc)

                current_cols = new_projected_cols

                cte_sql = f"""{curr_cte} AS (
    SELECT {', '.join(proj)}
    FROM {prev_cte}
    {join_sql_kw} {r_cte}{on_clause}
)"""
                ctes.append(cte_sql)

                generated.sql = f"{join_sql_kw} right_table{on_clause}"
                l_keys = [kp["left_col"] for kp in key_pairs]
                r_keys = [kp["right_col"] for kp in key_pairs]
                generated.polars = f'df = df.join(right_df, left_on={l_keys}, right_on={r_keys}, how={Q(polars_how)})'
                generated.power_query_m = f'Table.NestedJoin(Source, {json.dumps(l_keys)}, RightTable, {json.dumps(r_keys)}, "Joined", {pq_join_kind})'
                if j_type in ["left", "inner"]:
                    generated.excel_formula = f'=XLOOKUP({l_keys[0] if l_keys else "Key"}2, RightSheet!A:A, RightSheet!B:B) (1:1 approximation)'
                else:
                    generated.excel_formula = f'Note: {j_type.replace("_", " ").title()} join cannot be expressed as a single standard Excel cell formula.'

            # Phase 4: Logical & Conditional
            elif stype in ["conditional", "if_condition"]:
                new_col = params.get("new_column", "conditional_col")
                rules = params.get("rules", [])
                else_val = params.get("else_value")

                # Per SPEC.md: "If every result and the else value parse as
                # numbers, the output column is numeric" (not forced VARCHAR,
                # which would otherwise break a later SUM/aggregation).
                all_results = [r.get("result") for r in rules] + [else_val]
                numeric_results = [parse_excel_number(v) for v in all_results]
                is_numeric_output = len(rules) > 0 and all(v is not None for v in numeric_results)

                def _lit(v, as_numeric: bool) -> str:
                    if as_numeric:
                        n = parse_excel_number(v)
                        return sql_number_literal(n) if n is not None else "NULL"
                    return sql_string_literal("" if v is None else str(v))

                when_clauses = []
                for r in rules:
                    cond = cls._build_filter_condition(r["column"], r.get("operator", "eq"), r.get("value"))
                    res_sql = _lit(r.get("result", ""), is_numeric_output)
                    when_clauses.append(f"WHEN {cond} THEN {res_sql}")

                else_sql = _lit(else_val, is_numeric_output) if else_val is not None else "NULL"
                case_expr = f"CASE {' '.join(when_clauses)} ELSE {else_sql} END"
                proj = [f'{Q(c)}' for c in current_cols] + [f'{case_expr} AS {Q(new_col)}']
                current_cols.append(new_col)

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{case_expr} AS {Q(new_col)}'
                generated.polars = f'df = df.with_columns(pl.when(...).then(...).otherwise(...).alias({Q(new_col)}))'
                generated.power_query_m = f'Table.AddColumn(Source, {Q(new_col)}, each if ... then ... else ...)'

                # Build a displayed Excel formula that honours ALL rules (not just the first).
                def _excel_lit(v):
                    if isinstance(v, str):
                        n = parse_excel_number(v)
                        if n is not None:
                            return repr(int(n)) if n == int(n) else repr(n)
                        return f'"{v}"'
                    return str(v)

                excel_parts = []
                for r in rules:
                    op_raw = r.get("operator", "eq")
                    op_sym = {"eq": "=", "neq": "<>", "gte": ">=", "lte": "<=", "gt": ">", "lt": "<"}.get(op_raw, "=")
                    val_repr = _excel_lit(r.get("value"))
                    res_repr = _excel_lit(r.get("result"))
                    excel_parts.append(f'{r.get("column", "A")}2{op_sym}{val_repr}, {res_repr}')
                else_repr = _excel_lit(else_val)
                generated.excel_formula = f'=IFS({", ".join(excel_parts)}, TRUE, {else_repr})'

            # Phase 4: Aggregation & Group By
            elif stype in ["group_by", "aggregate"]:
                group_cols = (
                    params.get("group_by_columns")
                    or params.get("group_columns")
                    or ([params.get("group_by")] if params.get("group_by") else [])
                )
                aggs = params.get("aggregations", [])
                if not aggs and (params.get("agg_column") or params.get("column")):
                    aggs = [{
                        "column": params.get("agg_column") or params.get("column"),
                        "agg_func": params.get("agg_func") or params.get("function") or "sum",
                        "output_column": params.get("output_column") or params.get("alias"),
                    }]

                agg_projs = []
                new_cols = list(group_cols)
                for agg in aggs:
                    col = agg.get("column", "")
                    func = (agg.get("agg_func") or agg.get("function") or "sum").lower()
                    out_name = (
                        agg.get("output_column")
                        or agg.get("alias")
                        or agg.get("output_name")
                        or f"{func}_{col}"
                    )
                    col_text = f"CAST({Q(col)} AS VARCHAR)"
                    non_blank = f"({Q(col)} IS NOT NULL AND TRIM({col_text}) != '')"
                    num_expr = number_parse_sql(Q(col))

                    if func == "sum":
                        expr = f'SUM({num_expr})'
                    elif func == "count":
                        expr = f'COUNT(CASE WHEN {non_blank} THEN 1 END)'
                    elif func == "distinct_count":
                        expr = f"COUNT(DISTINCT CASE WHEN {non_blank} THEN LOWER(TRIM({col_text})) END)"
                    elif func in ["avg", "mean"]:
                        expr = f'AVG({num_expr})'
                    elif func == "min":
                        expr = f'MIN({Q(col)})'
                    elif func == "max":
                        expr = f'MAX({Q(col)})'
                    else:
                        expr = f'SUM({num_expr})'

                    agg_projs.append(f'{expr} AS {Q(out_name)}')
                    new_cols.append(out_name)

                if group_cols:
                    # Case-insensitive group-by keys (per SPEC.md), but the group's
                    # output shows the first-seen spelling via arg_min(..., _row_id).
                    group_key_display = [f"arg_min({Q(c)}, _row_id) AS {Q(c)}" for c in group_cols]
                    # Case-insensitive ONLY -- group-by does NOT trim, per SPEC.md.
                    group_by_clause = "GROUP BY " + ", ".join([f"LOWER(CAST({Q(c)} AS VARCHAR))" for c in group_cols])
                    select_clause = ", ".join(group_key_display + agg_projs)
                else:
                    group_by_clause = ""
                    select_clause = ", ".join(agg_projs)

                current_cols = new_cols
                cte_sql = f"{curr_cte} AS (\n    SELECT row_number() OVER () AS _row_id, {select_clause} FROM {prev_cte} {group_by_clause}\n)"
                ctes.append(cte_sql)

                generated.sql = f"SELECT {select_clause} FROM table {group_by_clause}"
                generated.polars = f"df = df.group_by({group_cols}).agg([{', '.join(agg_projs)}])"
                generated.power_query_m = f"Table.Group(Source, {json.dumps(group_cols)}, ...)"
                generated.excel_formula = f"=SUMIFS(...) or =COUNTIFS(...)"

            # Phase 4: Window Functions
            elif stype in ["window_calc", "window_function"]:
                calc_type = params.get("calc_type", "running_total")
                t_col = params["target_column"]
                out_col = params.get("output_column") or f"{calc_type}_{t_col}"
                parts = params.get("partition_by", [])
                order_by_param = params.get("order_by") or ""
                order_dir = "DESC" if str(params.get("order_direction", "asc")).lower() == "desc" else "ASC"
                w_size = params.get("window_size", 3)
                offset = params.get("offset", 1)

                # rank: if order_by names a different column, rank by that column;
                # otherwise rank by target_column itself. Other calc types order
                # by order_by (file order / _row_id if none given).
                if calc_type == "rank":
                    rank_col = order_by_param or t_col
                    order_sql_col = number_parse_sql(Q(rank_col))
                    order_clause = f"ORDER BY {order_sql_col} {order_dir} NULLS LAST"
                else:
                    order_col = order_by_param or "_row_id"
                    order_clause = f"ORDER BY {Q(order_col)} {order_dir} NULLS LAST" if order_by_param else f"ORDER BY {Q(order_col)} {order_dir}"

                part_clause = f"PARTITION BY {', '.join([Q(c) for c in parts])}" if parts else ""
                over_core = f"OVER ({part_clause} {order_clause}".strip()

                if calc_type == "running_total":
                    num_t = number_parse_sql(Q(t_col))
                    expr = f'SUM({num_t}) {over_core} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)'
                elif calc_type == "rank":
                    rank_col = order_by_param or t_col
                    base_rank = f'DENSE_RANK() {over_core})'
                    expr = f"(CASE WHEN {Q(rank_col)} IS NULL THEN NULL ELSE {base_rank} END)"
                elif calc_type == "percent_of_total":
                    part_only = f"OVER ({part_clause})" if part_clause else "OVER ()"
                    num_t = number_parse_sql(Q(t_col))
                    expr = f'ROUND({num_t} * 100.0 / NULLIF(SUM({num_t}) {part_only}, 0), 2)'
                elif calc_type == "moving_avg":
                    num_t = number_parse_sql(Q(t_col))
                    expr = f'ROUND(AVG({num_t}) {over_core} ROWS BETWEEN {w_size - 1} PRECEDING AND CURRENT ROW), 2)'
                elif calc_type == "lag":
                    expr = f'LAG({Q(t_col)}, {offset}) {over_core})'
                elif calc_type == "lead":
                    expr = f'LEAD({Q(t_col)}, {offset}) {over_core})'
                else:
                    num_t = number_parse_sql(Q(t_col))
                    expr = f'SUM({num_t}) {over_core})'

                proj = [f'{Q(c)}' for c in current_cols] + [f'{expr} AS {Q(out_col)}']
                current_cols.append(out_col)

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{expr} AS {Q(out_col)}'
                generated.polars = f'df = df.with_columns({expr}.alias({Q(out_col)}))'
                generated.power_query_m = f'Table.AddColumn(Source, {Q(out_col)}, ...)'
                generated.excel_formula = f'=SUM($B$2:B2) or =RANK(B2, $B$2:$B$100)'

            # Phase 4: Text Operations
            elif stype in ["text_transform", "text_operation"]:
                col = params["column"]
                op = params.get("operation", "trim").lower()
                out_col = params.get("output_column") or col
                length = params.get("length", 5)
                start = params.get("start", 1)
                delim = params.get("delimiter", " ")
                concat_cols = params.get("concat_columns", [])
                sep = params.get("concat_separator", " ")

                safe_col = f'CAST({Q(col)} AS VARCHAR)'

                if op == "trim":
                    # TRIM: strip ends AND collapse internal runs of spaces to one.
                    expr = f"TRIM(REGEXP_REPLACE({safe_col}, '\\s+', ' ', 'g'))"
                elif op == "clean":
                    expr = f"REGEXP_REPLACE({safe_col}, '[\r\n\t]+', ' ', 'g')"
                elif op == "upper":
                    expr = f'UPPER({safe_col})'
                elif op == "lower":
                    expr = f'LOWER({safe_col})'
                elif op == "proper":
                    # PROPER: uppercase a letter that follows a non-letter (or
                    # string start), lowercase everything else. Splitting on the
                    # letter/non-letter boundary (rather than just spaces) is what
                    # makes "o'brien" -> "O'Brien" and "mary-jane SMITH" ->
                    # "Mary-Jane Smith" work.
                    expr = (
                        "array_to_string(list_transform(regexp_extract_all(" + safe_col +
                        ", '[A-Za-z]+|[^A-Za-z]+'), "
                        "x -> CASE WHEN regexp_matches(x, '^[A-Za-z]') THEN upper(x[1:1]) || lower(x[2:]) ELSE x END), '')"
                    )
                elif op == "left":
                    expr = f'SUBSTR({safe_col}, 1, {length})'
                elif op == "right":
                    expr = f'RIGHT({safe_col}, {length})'
                elif op == "mid":
                    expr = f'SUBSTR({safe_col}, {start}, {length})'
                elif op == "length":
                    expr = f'LENGTH({safe_col})'
                elif op == "concat":
                    all_c = [f'COALESCE(CAST({Q(c)} AS VARCHAR), \'\')' for c in [col] + concat_cols]
                    escaped_sep = sep.replace("'", "''")
                    expr = f"CONCAT_WS('{escaped_sep}', {', '.join(all_c)})"
                elif op == "extract_delimiter":
                    escaped_delim = delim.replace("'", "''")
                    pos = params.get("position", "before")
                    part_idx = 1 if pos == "before" else 2
                    expr = f"SPLIT_PART({safe_col}, '{escaped_delim}', {part_idx})"
                elif op == "clean_spaces":
                    expr = f"TRIM(REGEXP_REPLACE({safe_col}, '\\s+', ' ', 'g'))"
                else:
                    expr = f'TRIM({safe_col})'

                proj = []
                if out_col == col:
                    for c in current_cols:
                        if c == col:
                            proj.append(f'{expr} AS {Q(c)}')
                        else:
                            proj.append(f'{Q(c)}')
                else:
                    proj = [f'{Q(c)}' for c in current_cols] + [f'{expr} AS {Q(out_col)}']
                    current_cols.append(out_col)

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{expr} AS {Q(out_col)}'
                generated.polars = f'df = df.with_columns({expr}.alias({Q(out_col)}))'
                generated.power_query_m = f'Table.TransformColumns(Source, {{{Q(col)}, ...}})'
                generated.excel_formula = f'={op.upper()}({col}2)'

            # Phase 4: Date & Time Operations
            elif stype in ["date_transform", "date_operation"]:
                col = params["column"]
                op = params.get("operation", "extract_part").lower()
                out_col = params.get("output_column") or f"{col}_{op}"
                safe_col = date_parse_sql(Q(col))

                if op == "extract_part":
                    part = params.get("date_part", "year").lower()
                    if part == "day_name":
                        expr = f"STRFTIME({safe_col}, '%A')"
                    elif part == "weekday":
                        # Weekday number 0-6, Sunday = 0 (per SPEC.md / the dialog).
                        expr = f"DAYOFWEEK({safe_col})"
                    elif part == "week":
                        # Excel WEEKNUM type 1: week starts Sunday, Jan 1 is week 1.
                        expr = (
                            f"(CAST(STRFTIME({safe_col}, '%j') AS INTEGER) - 1 + "
                            f"DAYOFWEEK(MAKE_DATE(DATE_PART('year', {safe_col}), 1, 1))) / 7 + 1"
                        )
                    else:
                        expr = f"DATE_PART('{part}', {safe_col})"
                elif op == "eomonth":
                    months = params.get("amount", 0)
                    expr = f"LAST_DAY(({safe_col} + CAST({months} AS INTEGER) * INTERVAL 1 MONTH))"
                elif op == "datedif":
                    sec_col = params.get("second_column", col)
                    unit = params.get("unit", "day").lower()
                    d1 = safe_col
                    d2 = date_parse_sql(Q(sec_col))
                    if unit == "day":
                        expr = f"(CASE WHEN {d1} IS NULL OR {d2} IS NULL THEN NULL ELSE DATE_DIFF('day', {d1}, {d2}) END)"
                    elif unit == "year":
                        # Complete years elapsed (Excel DATEDIF semantics):
                        # subtract 1 if the end date hasn't yet reached the
                        # same month/day as the start date.
                        raw_years = f"(DATE_PART('year', {d2}) - DATE_PART('year', {d1}))"
                        not_reached = (
                            f"(DATE_PART('month', {d2}) < DATE_PART('month', {d1}) OR "
                            f"(DATE_PART('month', {d2}) = DATE_PART('month', {d1}) AND "
                            f"DATE_PART('day', {d2}) < DATE_PART('day', {d1})))"
                        )
                        expr = (
                            f"(CASE WHEN {d1} IS NULL OR {d2} IS NULL THEN NULL "
                            f"WHEN {not_reached} THEN {raw_years} - 1 ELSE {raw_years} END)"
                        )
                    else:  # month -- complete months elapsed, Excel-style:
                        # subtract 1 if the end date's day-of-month hasn't yet
                        # reached the start date's day-of-month. (Verified
                        # against SPEC.md's examples: 31 Jan -> 1 Mar = 1;
                        # 15 Jan -> 14 Feb = 0; 31 Jan -> 1 Feb = 0.)
                        raw_months = (
                            f"((DATE_PART('year', {d2}) - DATE_PART('year', {d1})) * 12 + "
                            f"(DATE_PART('month', {d2}) - DATE_PART('month', {d1})))"
                        )
                        day_not_reached = f"(DATE_PART('day', {d2}) < DATE_PART('day', {d1}))"
                        expr = (
                            f"(CASE WHEN {d1} IS NULL OR {d2} IS NULL THEN NULL "
                            f"WHEN {day_not_reached} THEN {raw_months} - 1 ELSE {raw_months} END)"
                        )
                elif op == "add_time":
                    amt = parse_excel_number(params.get("amount", 1)) or 0
                    unit = str(params.get("unit", "day")).upper()
                    if unit in ("MONTH", "MONTHS"):
                        # Add months, clamping to month end (31 Jan + 1mo = 29 Feb 2024).
                        expr = (
                            f"(CASE WHEN {safe_col} = LAST_DAY({safe_col}) "
                            f"THEN LAST_DAY({safe_col} + CAST({int(amt)} AS INTEGER) * INTERVAL 1 MONTH) "
                            f"ELSE LEAST({safe_col} + CAST({int(amt)} AS INTEGER) * INTERVAL 1 MONTH, "
                            f"LAST_DAY({safe_col} + CAST({int(amt)} AS INTEGER) * INTERVAL 1 MONTH)) END)"
                        )
                    elif unit in ("YEAR", "YEARS"):
                        expr = (
                            f"(CASE WHEN {safe_col} = LAST_DAY({safe_col}) "
                            f"THEN LAST_DAY({safe_col} + CAST({int(amt)} AS INTEGER) * INTERVAL 1 YEAR) "
                            f"ELSE {safe_col} + CAST({int(amt)} AS INTEGER) * INTERVAL 1 YEAR END)"
                        )
                    else:
                        interval_unit = "DAY"
                        expr = f"({safe_col} + CAST({int(amt)} AS INTEGER) * INTERVAL 1 {interval_unit})"
                elif op == "fiscal_year":
                    f_start = int(params.get("fiscal_start_month", 1) or 1)
                    cal_year = f"DATE_PART('year', {safe_col})"
                    if f_start <= 1:
                        fy_num = cal_year
                    else:
                        fy_num = f"(CASE WHEN DATE_PART('month', {safe_col}) >= {f_start} THEN {cal_year} + 1 ELSE {cal_year} END)"
                    # Output text "FY2025" in both engines.
                    expr = f"(CASE WHEN {safe_col} IS NULL THEN NULL ELSE 'FY' || CAST({fy_num} AS VARCHAR) END)"
                elif op == "networkdays":
                    sec_col = params.get("second_column", col)
                    d2 = date_parse_sql(Q(sec_col))
                    expr = (
                        f"(CASE WHEN {safe_col} IS NULL OR {d2} IS NULL THEN NULL ELSE ("
                        f"SELECT COUNT(*) FROM range(LEAST({safe_col}, {d2}), GREATEST({safe_col}, {d2}) + 1, INTERVAL 1 DAY) t(d) "
                        f"WHERE DAYOFWEEK(d) NOT IN (0, 6)) END)"
                    )
                else:
                    expr = f"DATE_PART('year', {safe_col})"

                proj = [f'{Q(c)}' for c in current_cols] + [f'{expr} AS {Q(out_col)}']
                current_cols.append(out_col)

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{expr} AS {Q(out_col)}'
                generated.polars = f'df = df.with_columns({expr}.alias({Q(out_col)}))'
                generated.power_query_m = f'Table.AddColumn(Source, {Q(out_col)}, ...)'
                generated.excel_formula = f'=YEAR({col}2) or =EOMONTH({col}2, 0)'

            # Phase 4: Numeric & Math
            elif stype in ["math_transform", "math_operation"]:
                col1 = params["column1"]
                col2 = params.get("column2")
                op = params.get("operation", "arithmetic").lower()
                out_col = params.get("output_column") or f"{col1}_calc"
                decimals = params.get("decimals", 2)

                # Both operands go through the shared Excel-style number parser
                # (handles "1,234.50", "$500", "(300)", "15%", ...). A bare
                # numeric literal step-param (not a column name) is embedded
                # as a safe validated literal, never raw text.
                def _operand_sql(c):
                    if c is None or str(c) == "":
                        return "0"
                    if c in current_cols:
                        return number_parse_sql(Q(c))
                    lit = parse_excel_number(c)
                    return sql_number_literal(lit) if lit is not None else "NULL"

                safe_c1 = _operand_sql(col1)
                safe_c2 = _operand_sql(col2) if (col2 is not None and str(col2) != "") else "0"
                decimals_sql = sql_number_literal(parse_excel_number(decimals), "0")

                if op == "arithmetic":
                    math_op = params.get("math_operator", "+")
                    if math_op == "/":
                        expr = f'(CASE WHEN {safe_c2} = 0 THEN NULL ELSE {safe_c1} / {safe_c2} END)'
                    elif math_op == "^":
                        expr = f'POWER({safe_c1}, {safe_c2})'
                    else:
                        expr = f'({safe_c1} {math_op} {safe_c2})'
                elif op == "round":
                    expr = round_half_away_from_zero_sql(safe_c1, decimals_sql)
                elif op == "roundup":
                    expr = round_up_sql(safe_c1, decimals_sql)
                elif op == "rounddown":
                    expr = round_down_sql(safe_c1, decimals_sql)
                elif op == "abs":
                    expr = f'ABS({safe_c1})'
                elif op == "int":
                    expr = f'FLOOR({safe_c1})'
                elif op == "clean_numeric":
                    expr = number_parse_sql(Q(col1))
                elif op == "mod":
                    # MOD takes the sign of the divisor (MOD(-7,3) = 2), per SPEC.md.
                    expr = f'(CASE WHEN {safe_c2} = 0 THEN NULL ELSE {safe_c1} - {safe_c2} * FLOOR({safe_c1} / {safe_c2}) END)'
                elif op == "ceiling":
                    sig = safe_c2 if safe_c2 != "0" else "1"
                    expr = f'(CASE WHEN {sig} = 0 THEN 0 ELSE CEIL({safe_c1} / {sig}) * {sig} END)'
                elif op == "floor":
                    sig = safe_c2 if safe_c2 != "0" else "1"
                    expr = f'(CASE WHEN {sig} = 0 THEN 0 ELSE FLOOR({safe_c1} / {sig}) * {sig} END)'
                elif op == "percent_change":
                    expr = round_half_away_from_zero_sql(
                        f'(CASE WHEN {safe_c1} = 0 THEN NULL ELSE ({safe_c2} - {safe_c1}) * 100.0 / {safe_c1} END)',
                        decimals_sql,
                    )
                elif op == "formula":
                    # Formula Builder, via custom_column's safe tokenizer/parser/compiler.
                    formula_text = params.get("formula") or params.get("expression") or ""
                    expr = compile_formula_to_sql(str(formula_text), current_cols)
                elif op == "bin":
                    bins = params.get("bins", [])
                    when_parts = []
                    for b in bins:
                        b_max = parse_excel_number(b.get("max"))
                        b_lbl = sql_string_literal(b.get("label", ""))
                        if b_max is not None:
                            when_parts.append(f"WHEN {safe_c1} <= {sql_number_literal(b_max)} THEN {b_lbl}")
                    fallback = sql_string_literal(params.get("bin_other", "Other"))
                    expr = f"CASE {' '.join(when_parts)} ELSE {fallback} END"
                else:
                    expr = round_half_away_from_zero_sql(safe_c1, decimals_sql)

                proj = []
                if out_col in current_cols:
                    for c in current_cols:
                        if c == out_col:
                            proj.append(f'{expr} AS {Q(c)}')
                        else:
                            proj.append(f'{Q(c)}')
                else:
                    proj = [f'{Q(c)}' for c in current_cols] + [f'{expr} AS {Q(out_col)}']
                    current_cols.append(out_col)

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{expr} AS {Q(out_col)}'
                if op == "arithmetic":
                    math_op = params.get("math_operator", "+")
                    c1_ref = f"{col1}2" if col1 in current_cols else str(col1)
                    c2_ref = f"{col2}2" if (col2 and col2 in current_cols) else str(col2 or 0)
                    generated.excel_formula = f"={c1_ref} {math_op} {c2_ref}"
                    generated.polars = f'df = df.with_columns(({safe_c1} {math_op} {safe_c2}).alias({Q(out_col)}))'
                    generated.power_query_m = f'Table.AddColumn(Source, {Q(out_col)}, each [#{col1}] {math_op} [#{col2}])'
                elif op == "round":
                    generated.polars = f'df = df.with_columns({expr}.alias({Q(out_col)}))'
                    generated.power_query_m = f'Table.AddColumn(Source, {Q(out_col)}, ...)'
                    generated.excel_formula = f'=ROUND({col1}2, {decimals})'
                else:
                    generated.polars = f'df = df.with_columns({expr}.alias({Q(out_col)}))'
                    generated.power_query_m = f'Table.AddColumn(Source, {Q(out_col)}, ...)'
                    generated.excel_formula = f'=ROUND({col1}2, {decimals})'

            # Phase 4: Pivot & Unpivot
            elif stype == "pivot":
                pivot_col = params["pivot_column"]
                val_col = params["value_column"]
                agg_func = params.get("agg_func", "sum").lower()
                idx_cols = params.get("index_columns", [])

                idx_clause = f"GROUP BY {', '.join([Q(c) for c in idx_cols])}" if idx_cols else ""
                cte_sql = f"""{curr_cte} AS (
    SELECT row_number() OVER () AS _row_id, * FROM (
        PIVOT {prev_cte} ON {Q(pivot_col)} USING {agg_func}({Q(val_col)}) {idx_clause}
    )
)"""
                ctes.append(cte_sql)
                # Refresh current_cols so a following step sees the ACTUAL pivoted
                # column names, instead of raising a BinderException against the
                # stale pre-pivot column list.
                current_cols = cls._probe_columns(ctes, curr_cte)

                generated.sql = f'PIVOT table ON {Q(pivot_col)} USING {agg_func}({Q(val_col)}) {idx_clause}'
                generated.polars = f'df = df.pivot(index={idx_cols}, on={Q(pivot_col)}, values={Q(val_col)})'
                generated.power_query_m = f'Table.Pivot(Source, ...)'
                generated.excel_formula = 'Excel Pivot Table'

            elif stype == "unpivot":
                val_cols = params.get("value_columns", [])
                name_col = params.get("name_column", "attribute")
                val_out_col = params.get("value_column", "value")

                val_cols_str = ", ".join([f'{Q(c)}' for c in val_cols])
                cte_sql = f"""{curr_cte} AS (
    SELECT row_number() OVER () AS _row_id, * FROM (
        UNPIVOT {prev_cte} ON {val_cols_str} INTO NAME {Q(name_col)} VALUE {Q(val_out_col)}
    )
)"""
                ctes.append(cte_sql)
                current_cols = cls._probe_columns(ctes, curr_cte)
                generated.sql = f'UNPIVOT table ON {val_cols_str} INTO NAME {Q(name_col)} VALUE {Q(val_out_col)}'
                generated.polars = f'df = df.unpivot(on={val_cols}, variable_name={Q(name_col)}, value_name={Q(val_out_col)})'
                generated.power_query_m = f'Table.UnpivotOtherColumns(Source, ...)'
                generated.excel_formula = 'Power Query Unpivot'

            summaries.append(
                StepSummary(
                    step_id=step.id,
                    label=step.label,
                    type=step.type,
                    enabled=step.enabled,
                    generated_code=generated,
                )
            )

        final_cte = f"step_{step_counter}"
        final_proj = ", ".join([Q(c) for c in current_cols]) if current_cols else "*"
        # Preserve the left table's row order and row count: no window/lookup/
        # join step may silently reorder rows (per SPEC.md). _row_id is carried
        # through every CTE even when not in the projected column list. This
        # is skipped when the pipeline contains an EXPLICIT ordering step
        # (sort_rows / top_bottom_n) -- that step's own ORDER BY already runs
        # inside its CTE, and forcing _row_id order afterwards would silently
        # undo the user's requested sort.
        has_explicit_sort = any(
            s.type in ("sort_rows", "top_bottom_n") and s.enabled for s in steps
        )
        order_suffix = "" if has_explicit_sort else " ORDER BY _row_id"
        compiled_sql = (
            f"WITH\n" + ",\n".join(ctes) +
            f"\nSELECT {final_proj} FROM {final_cte}{order_suffix}"
        )

        return compiled_sql, summaries, current_cols

    @staticmethod
    def _probe_columns(ctes: List[str], cte_name: str) -> List[str]:
        """Execute the CTE chain built so far (against the real parquet file)
        to discover the ACTUAL output column names of `cte_name`. Used after
        steps whose column list is only known at execution time (pivot,
        unpivot), so later steps operate on the real column list instead of
        a stale pre-pivot one (which previously raised a BinderException).
        """
        probe = duckdb.connect()
        try:
            probe_sql = "WITH\n" + ",\n".join(ctes) + f"\nSELECT * FROM {cte_name} LIMIT 0"
            cols = [d[0] for d in probe.execute(probe_sql).description]
            return [c for c in cols if c != "_row_id"]
        finally:
            probe.close()

    @staticmethod
    def _build_filter_condition(col: str, op: str, val: Any) -> str:
        """Build a SAFE SQL boolean expression for one filter/conditional
        rule. `val` is a Python-side literal from step params -- it is NEVER
        pasted unescaped/unquoted into SQL (that was the SPEC.md SQL
        injection flaw for gt/gte/lt/lte/between, e.g. `999 OR 1=1`).

        Per SPEC.md: compare numerically when both sides parse as numbers
        (shared Excel-style number parser), else case-insensitive text.
        An empty comparison value on > < >= <= compares with 0 when the
        column is numeric, else is treated as false (never a SQL error).
        """
        safe_col = Q(col)
        col_num = number_parse_sql(safe_col)

        if op == "is_null":
            return f"{safe_col} IS NULL"
        if op == "is_not_null":
            return f"{safe_col} IS NOT NULL"

        is_blank_value = val is None or (isinstance(val, str) and val == "")
        val_num = None if is_blank_value else parse_excel_number(val)
        val_text_literal = sql_string_literal("" if val is None else str(val))

        if op in ("eq", "neq"):
            text_cmp = f"LOWER(TRIM(CAST({safe_col} AS VARCHAR))) = LOWER(TRIM({val_text_literal}))"
            if val_num is not None:
                numeric_cmp = f"{col_num} = {sql_number_literal(val_num)}"
                eq_expr = f"(CASE WHEN {col_num} IS NOT NULL THEN {numeric_cmp} ELSE {text_cmp} END)"
            else:
                eq_expr = f"({text_cmp})"
            if op == "eq":
                return eq_expr
            return f"(NOT ({eq_expr}) OR {safe_col} IS NULL)"

        if op in ("gt", "gte", "lt", "lte"):
            sql_op = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[op]
            if is_blank_value:
                # Empty comparison value: compare with 0 when numeric, else false.
                return f"(CASE WHEN {col_num} IS NOT NULL THEN {col_num} {sql_op} 0 ELSE FALSE END)"
            text_cmp = f"(LOWER(TRIM(CAST({safe_col} AS VARCHAR))) {sql_op} LOWER(TRIM({val_text_literal})))"
            if val_num is not None:
                # Numeric when BOTH sides parse as numbers; otherwise
                # case-insensitive text (per SPEC.md), not a hard FALSE.
                return f"(CASE WHEN {col_num} IS NOT NULL THEN {col_num} {sql_op} {sql_number_literal(val_num)} ELSE {text_cmp} END)"
            return text_cmp

        if op == "contains":
            return f"CAST({safe_col} AS VARCHAR) ILIKE {sql_string_literal('%' + ('' if val is None else str(val)) + '%')}"
        if op == "starts_with":
            return f"CAST({safe_col} AS VARCHAR) ILIKE {sql_string_literal(('' if val is None else str(val)) + '%')}"
        if op == "ends_with":
            return f"CAST({safe_col} AS VARCHAR) ILIKE {sql_string_literal('%' + ('' if val is None else str(val)))}"
        if op == "not_contains":
            return f"CAST({safe_col} AS VARCHAR) NOT ILIKE {sql_string_literal('%' + ('' if val is None else str(val)) + '%')}"
        if op == "between":
            if isinstance(val, (list, tuple)) and len(val) >= 2:
                lo, hi = val[0], val[1]
            else:
                parts = str(val).split(",")
                lo = parts[0].strip() if len(parts) >= 1 else None
                hi = parts[1].strip() if len(parts) >= 2 else None
            lo_num, hi_num = parse_excel_number(lo), parse_excel_number(hi)
            if lo_num is None or hi_num is None:
                return "FALSE"
            return f"(CASE WHEN {col_num} IS NOT NULL THEN {col_num} BETWEEN {sql_number_literal(lo_num)} AND {sql_number_literal(hi_num)} ELSE FALSE END)"
        if op == "in":
            items = val if isinstance(val, (list, tuple)) else [v.strip() for v in str(val).split(",")]
            sql_items = ", ".join(["LOWER(TRIM(" + sql_string_literal(str(i)) + "))" for i in items])
            return f"(LOWER(TRIM(CAST({safe_col} AS VARCHAR))) IN ({sql_items}))"
        if op == "not_in":
            items = val if isinstance(val, (list, tuple)) else [v.strip() for v in str(val).split(",")]
            sql_items = ", ".join(["LOWER(TRIM(" + sql_string_literal(str(i)) + "))" for i in items])
            return f"({safe_col} IS NOT NULL AND LOWER(TRIM(CAST({safe_col} AS VARCHAR))) NOT IN ({sql_items}))"
        return f"{safe_col} = {val_text_literal}"

    @staticmethod
    def _build_polars_filter(col: str, op: str, val: Any) -> str:
        if op == "is_null":
            return f'df = df.filter(pl.col({Q(col)}).is_null())'
        if op == "is_not_null":
            return f'df = df.filter(pl.col({Q(col)}).is_not_null())'
        if op == "eq":
            return f'df = df.filter(pl.col({Q(col)}) == {Q(val)})'
        if op == "neq":
            return f'df = df.filter(pl.col({Q(col)}) != {Q(val)})'
        if op == "contains":
            return f'df = df.filter(pl.col({Q(col)}).str.contains({Q(val)}))'
        return f'df = df.filter(pl.col({Q(col)}) {op} {val})'

    @staticmethod
    def _build_excel_filter(col: str, op: str, val: Any) -> str:
        if op == "is_null":
            return f'ISBLANK({col}2:{col}1000)'
        if op == "is_not_null":
            return f'NOT(ISBLANK({col}2:{col}1000))'
        if op == "eq":
            return f'{col}2:{col}1000 = {Q(val)}'
        return f'{col}2:{col}1000 {op} {Q(val)}'


step_compiler = StepCompiler()
