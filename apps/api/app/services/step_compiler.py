import os
import json
from typing import List, Dict, Any, Tuple, Optional
from app.schemas.steps import StepSchema, GeneratedCode, StepSummary


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

                proj = []
                for c in current_cols:
                    if c == col:
                        proj.append(f'TRY_CAST("{c}" AS {duck_type}) AS "{c}"')
                    else:
                        proj.append(f'"{c}"')

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'TRY_CAST("{col}" AS {duck_type}) AS "{col}"'
                generated.polars = f'df = df.with_columns(pl.col("{col}").cast({cls.POLARS_TYPE_MAP.get(ttype, "pl.Utf8")}))'
                generated.power_query_m = f'Table.TransformColumnTypes(Source, {{"{col}", {cls.PQ_TYPE_MAP.get(ttype, "type text")}}})'
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
                        proj.append(f'"{c}" AS "{new_name}"')
                        new_cols.append(new_name)
                    else:
                        proj.append(f'"{c}"')
                        new_cols.append(c)
                current_cols = new_cols

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'"{old_name}" AS "{new_name}"'
                generated.polars = f'df = df.rename({{"{old_name}": "{new_name}"}})'
                generated.power_query_m = f'Table.RenameColumns(Source, {{"{old_name}", "{new_name}"}})'

            elif stype == "filter_rows":
                col = params["column"]
                op = params.get("operator", "eq")
                val = params.get("value")

                where_cond = cls._build_filter_condition(col, op, val)
                cte_sql = f"{curr_cte} AS (\n    SELECT * FROM {prev_cte} WHERE {where_cond}\n)"
                ctes.append(cte_sql)

                generated.sql = f"WHERE {where_cond}"
                generated.polars = cls._build_polars_filter(col, op, val)
                generated.power_query_m = f'Table.SelectRows(Source, each {where_cond})'
                generated.excel_formula = f'=FILTER(A2:Z1000, {cls._build_excel_filter(col, op, val)})'

            elif stype == "sort_rows":
                col = params["column"]
                dir_str = "DESC" if str(params.get("direction", "asc")).lower() == "desc" else "ASC"

                cte_sql = f"{curr_cte} AS (\n    SELECT * FROM {prev_cte} ORDER BY \"{col}\" {dir_str} NULLS LAST\n)"
                ctes.append(cte_sql)

                descending = "true" if dir_str == "DESC" else "false"
                generated.sql = f'ORDER BY "{col}" {dir_str} NULLS LAST'
                generated.polars = f'df = df.sort("{col}", descending={descending})'
                generated.power_query_m = f'Table.Sort(Source, {{"{col}", Order.{ "Descending" if dir_str == "DESC" else "Ascending" }}})'
                generated.excel_formula = f'=SORT(A2:Z1000, COLUMN_INDEX, {1 if dir_str == "ASC" else -1})'

            elif stype == "remove_duplicates":
                key_cols = params.get("columns", [])
                if not key_cols:
                    key_cols = list(current_cols)
                keep = params.get("keep", "first")
                order_dir = "ASC" if keep == "first" else "DESC"

                safe_part = ", ".join([f'"{k}"' for k in key_cols])
                cte_sql = f"""{curr_cte} AS (
    SELECT * FROM (
        SELECT *, row_number() OVER (PARTITION BY {safe_part} ORDER BY _row_id {order_dir}) as _dedup_rank
        FROM {prev_cte}
    ) WHERE _dedup_rank = 1
)"""
                ctes.append(cte_sql)

                cols_repr = json.dumps(key_cols)
                generated.sql = f"QUALIFY ROW_NUMBER() OVER (PARTITION BY {safe_part} ORDER BY _row_id {order_dir}) = 1"
                generated.polars = f'df = df.unique(subset={cols_repr}, keep="{keep}")'
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
                        proj.append(f'{fn}("{c}" IGNORE NULLS) OVER (ORDER BY _row_id {frame}) AS "{c}"')
                    else:
                        proj.append(f'"{c}"')

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{fn}("{col}" IGNORE NULLS) OVER (ORDER BY _row_id {frame}) AS "{col}"'
                generated.polars = f'df = df.with_columns(pl.col("{col}").forward_fill())' if direction == "down" else f'df = df.with_columns(pl.col("{col}").backward_fill())'
                generated.power_query_m = f'Table.FillDown(Source, {{"{col}"}})' if direction == "down" else f'Table.FillUp(Source, {{"{col}"}})'
                generated.excel_formula = f'=IF(ISBLANK({col}2), {col}1, {col}2)'

            elif stype == "replace_values":
                col = params["column"]
                s_val = params.get("search_value")
                r_val = params.get("replace_value", "")
                m_type = params.get("match_type", "exact")

                escaped_r = str(r_val).replace("'", "''")

                if m_type == "is_null":
                    expr = f'COALESCE("{col}", \'{escaped_r}\')'
                elif m_type == "contains":
                    escaped_s = str(s_val).replace("'", "''")
                    expr = f'REPLACE(CAST("{col}" AS VARCHAR), \'{escaped_s}\', \'{escaped_r}\')'
                else:  # exact
                    escaped_s = str(s_val).replace("'", "''")
                    expr = f'CASE WHEN CAST("{col}" AS VARCHAR) = \'{escaped_s}\' THEN \'{escaped_r}\' ELSE "{col}" END'

                proj = []
                for c in current_cols:
                    if c == col:
                        proj.append(f'{expr} AS "{c}"')
                    else:
                        proj.append(f'"{c}"')

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'{expr} AS "{col}"'
                generated.polars = f'df = df.with_columns(pl.col("{col}").replace("{s_val}", "{r_val}"))'
                generated.power_query_m = f'Table.ReplaceValue(Source, "{s_val}", "{r_val}", Replacer.ReplaceText, {{"{col}"}})'
                generated.excel_formula = f'=SUBSTITUTE({col}2, "{s_val}", "{r_val}")'

            elif stype == "split_column":
                col = params["column"]
                delim = params.get("delimiter", ",")
                new_names = params.get("new_column_names", [f"{col}_1", f"{col}_2"])
                keep_orig = params.get("keep_original", False)

                escaped_delim = delim.replace("'", "''")
                proj = []
                new_cols_added = []

                for c in current_cols:
                    if c == col and not keep_orig:
                        for i, n_name in enumerate(new_names):
                            proj.append(f'string_split(CAST("{c}" AS VARCHAR), \'{escaped_delim}\')[{i+1}] AS "{n_name}"')
                            new_cols_added.append(n_name)
                    else:
                        proj.append(f'"{c}"')
                        new_cols_added.append(c)

                if keep_orig:
                    for i, n_name in enumerate(new_names):
                        proj.append(f'string_split(CAST("{col}" AS VARCHAR), \'{escaped_delim}\')[{i+1}] AS "{n_name}"')
                        new_cols_added.append(n_name)

                current_cols = new_cols_added

                cte_sql = f"{curr_cte} AS (\n    SELECT _row_id, {', '.join(proj)} FROM {prev_cte}\n)"
                ctes.append(cte_sql)

                generated.sql = f'string_split(CAST("{col}" AS VARCHAR), \'{escaped_delim}\')'
                generated.polars = f'df = df.with_columns([pl.col("{col}").str.split("{delim}").list.get(i).alias(name) for i, name in enumerate({new_names})])'
                generated.power_query_m = f'Table.SplitColumn(Source, "{col}", Splitter.SplitTextByDelimiter("{delim}"), {json.dumps(new_names)})'
                generated.excel_formula = f'=TEXTSPLIT({col}2, "{delim}")'

            # Phase 3: Lookup & Join suite
            elif stype in ["xlookup", "lookup"]:
                lk_ds_id = params["lookup_dataset_id"]
                lk_path = dataset_paths.get(lk_ds_id, "")
                lk_sql = lk_path.replace("\\", "/")
                left_key = params["left_key_col"]
                right_key = params["right_key_col"]
                ret_cols = params.get("return_columns", [])
                if_not_found = params.get("if_not_found", "Not found")

                escaped_fallback = str(if_not_found).replace("'", "''")
                ret_proj = []
                for rc in ret_cols:
                    # Rename if conflict with current_cols
                    target_name = f"{rc}_lookup" if rc in current_cols else rc
                    ret_proj.append(f'COALESCE(lk."{rc}", \'{escaped_fallback}\') AS "{target_name}"')
                    current_cols.append(target_name)

                lk_table_name = f"_lk_{step_counter}"
                ctes.append(f"""{lk_table_name} AS (
    SELECT * FROM (
        SELECT *, row_number() OVER (PARTITION BY "{right_key}" ORDER BY 1) as _rn
        FROM read_parquet('{lk_sql}')
    ) WHERE _rn = 1
)""")
                left_proj = [f'{prev_cte}."{c}"' for c in current_cols[:-len(ret_cols)]]
                cte_sql = f"""{curr_cte} AS (
    SELECT {prev_cte}._row_id, {', '.join(left_proj)}, {', '.join(ret_proj)}
    FROM {prev_cte}
    LEFT JOIN {lk_table_name} lk ON {prev_cte}."{left_key}" = lk."{right_key}"
)"""
                ctes.append(cte_sql)

                generated.sql = f'LEFT JOIN (SELECT * FROM read_parquet(...)) lk ON "{left_key}" = lk."{right_key}"'
                generated.polars = f'df = df.join(lookup_df, left_on="{left_key}", right_on="{right_key}", how="left")'
                generated.power_query_m = f'Table.NestedJoin(Source, {{"{left_key}"}}, LookupTable, {{"{right_key}"}}, "Lookup", JoinKind.LeftOuter)'
                first_ret = ret_cols[0] if ret_cols else "Result"
                generated.excel_formula = f'=XLOOKUP({left_key}2, LookupSheet!A:A, LookupSheet!B:B, "{if_not_found}", 0)'

            elif stype in ["append", "append_tables"]:
                app_ds_id = params["append_dataset_id"]
                app_path = dataset_paths.get(app_ds_id, "")
                app_sql = app_path.replace("\\", "/")
                union_kw = "UNION" if params.get("union_type") == "distinct" else "UNION ALL"
                align_mode = params.get("alignment_mode", "by_name")

                if align_mode == "by_name" and app_path and os.path.exists(app_path):
                    try:
                        import duckdb
                        temp_cols = [d[0] for d in duckdb.connect().execute(f"DESCRIBE SELECT * FROM read_parquet('{app_sql}') LIMIT 0").fetchall()]
                        for tc in temp_cols:
                            if tc != "_row_id" and tc not in current_cols:
                                current_cols.append(tc)
                    except Exception:
                        pass

                if align_mode == "by_position":
                    proj_cols = ", ".join([f'"{c}"' for c in current_cols])
                    cte_sql = f"""{curr_cte} AS (
    SELECT row_number() OVER () AS _row_id, * FROM (
        SELECT {proj_cols} FROM {prev_cte}
        {union_kw}
        SELECT {proj_cols} FROM read_parquet('{app_sql}')
    )
)"""
                else:
                    cte_sql = f"""{curr_cte} AS (
    SELECT row_number() OVER () AS _row_id, * FROM (
        SELECT * EXCLUDE(_row_id) FROM {prev_cte}
        {union_kw} BY NAME
        SELECT * FROM read_parquet('{app_sql}')
    )
)"""
                ctes.append(cte_sql)

                generated.sql = f"{union_kw} {'BY NAME ' if align_mode == 'by_name' else ''}SELECT * FROM read_parquet('{app_sql}')"
                generated.polars = f'df = pl.concat([df, append_df], how="{"diagonal" if align_mode == "by_name" else "vertical"}")'
                generated.power_query_m = f'Table.Combine({{Source, AppendTable}})'
                generated.excel_formula = f'=VSTACK(Table1, Table2)'

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
                        proj.append(f'{prev_cte}."{c}"')
                        new_projected_cols.append(c)
                else:
                    for c in current_cols:
                        if c in selected_r_cols:
                            proj.append(f'{prev_cte}."{c}" AS "{c}{s_left}"')
                            new_projected_cols.append(f"{c}{s_left}")
                        else:
                            proj.append(f'{prev_cte}."{c}"')
                            new_projected_cols.append(c)

                    for rc in selected_r_cols:
                        if rc in current_cols:
                            proj.append(f'{r_cte}."{rc}" AS "{rc}{s_right}"')
                            new_projected_cols.append(f"{rc}{s_right}")
                        else:
                            proj.append(f'{r_cte}."{rc}"')
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
                generated.polars = f'df = df.join(right_df, left_on={l_keys}, right_on={r_keys}, how="{polars_how}")'
                generated.power_query_m = f'Table.NestedJoin(Source, {json.dumps(l_keys)}, RightTable, {json.dumps(r_keys)}, "Joined", {pq_join_kind})'
                if j_type in ["left", "inner"]:
                    generated.excel_formula = f'=XLOOKUP({l_keys[0] if l_keys else "Key"}2, RightSheet!A:A, RightSheet!B:B) (1:1 approximation)'
                else:
                    generated.excel_formula = f'Note: {j_type.replace("_", " ").title()} join cannot be expressed as a single standard Excel cell formula.'

            summaries.append(
                StepSummary(
                    step_id=step.id,
                    label=step.label,
                    type=step.type,
                    enabled=step.enabled,
                    generated_code=generated,
                )
            )

        final_proj = ", ".join([f'"{c}"' for c in current_cols])
        final_cte = f"step_{step_counter}"
        compiled_sql = f"WITH\n" + ",\n".join(ctes) + f"\nSELECT {final_proj} FROM {final_cte}"

        return compiled_sql, summaries, current_cols

    @staticmethod
    def _build_filter_condition(col: str, op: str, val: Any) -> str:
        safe_col = f'"{col}"'
        if op == "is_null":
            return f"{safe_col} IS NULL"
        if op == "is_not_null":
            return f"{safe_col} IS NOT NULL"

        escaped_val = str(val).replace("'", "''") if val is not None else ""

        if op == "eq":
            return f"{safe_col} = '{escaped_val}'"
        if op == "neq":
            return f"({safe_col} != '{escaped_val}' OR {safe_col} IS NULL)"
        if op == "gt":
            return f"{safe_col} > {escaped_val}"
        if op == "gte":
            return f"{safe_col} >= {escaped_val}"
        if op == "lt":
            return f"{safe_col} < {escaped_val}"
        if op == "lte":
            return f"{safe_col} <= {escaped_val}"
        if op == "contains":
            return f"CAST({safe_col} AS VARCHAR) ILIKE '%{escaped_val}%'"
        if op == "starts_with":
            return f"CAST({safe_col} AS VARCHAR) ILIKE '{escaped_val}%'"
        if op == "ends_with":
            return f"CAST({safe_col} AS VARCHAR) ILIKE '%{escaped_val}'"
        return f"{safe_col} = '{escaped_val}'"

    @staticmethod
    def _build_polars_filter(col: str, op: str, val: Any) -> str:
        if op == "is_null":
            return f'df = df.filter(pl.col("{col}").is_null())'
        if op == "is_not_null":
            return f'df = df.filter(pl.col("{col}").is_not_null())'
        if op == "eq":
            return f'df = df.filter(pl.col("{col}") == "{val}")'
        if op == "neq":
            return f'df = df.filter(pl.col("{col}") != "{val}")'
        if op == "contains":
            return f'df = df.filter(pl.col("{col}").str.contains("{val}"))'
        return f'df = df.filter(pl.col("{col}") {op} {val})'

    @staticmethod
    def _build_excel_filter(col: str, op: str, val: Any) -> str:
        if op == "is_null":
            return f'ISBLANK({col}2:{col}1000)'
        if op == "is_not_null":
            return f'NOT(ISBLANK({col}2:{col}1000))'
        if op == "eq":
            return f'{col}2:{col}1000 = "{val}"'
        return f'{col}2:{col}1000 {op} "{val}"'


step_compiler = StepCompiler()
