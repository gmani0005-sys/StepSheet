import json
from typing import List, Dict, Any, Tuple, Optional
from app.schemas.steps import StepSchema, GeneratedCode, StepSummary
from app.schemas.dataset import ColumnSchema


class StepCompiler:
    """
    Compiles typed pipeline steps into clean, executable DuckDB SQL queries
    and generates equivalent Polars, Power Query M, and Excel formulas.
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
    ) -> Tuple[str, List[StepSummary], List[str]]:
        """
        Compiles the entire step sequence into a CTE-based DuckDB SQL statement.
        Returns: (compiled_sql, step_summaries, final_column_names)
        """
        parquet_sql = parquet_path.replace("\\", "/")
        ctes: List[str] = []
        current_cols = list(initial_columns)
        summaries: List[StepSummary] = []

        # Base step: source data
        # We include an auto-incrementing row_id to support stable deterministic windowing (e.g. fill_down, remove_duplicates)
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

            if stype == "change_type":
                col = params["column"]
                ttype = params["target_type"]
                duck_type = cls.DUCKDB_TYPE_MAP.get(ttype, "VARCHAR")
                
                # Projection
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
                if ttype == "integer" or ttype == "float":
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
                frame = "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW" if direction == "down" else "ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING"

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
                        # Replace with split columns
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

            summaries.append(
                StepSummary(
                    step_id=step.id,
                    label=step.label,
                    type=step.type,
                    enabled=step.enabled,
                    generated_code=generated,
                )
            )

        # Final select projecting all columns except internal _row_id and _dedup_rank
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
