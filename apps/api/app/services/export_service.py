import io
import csv
import json
import time
from typing import List, Dict, Any, Optional
import xlsxwriter
import duckdb
from app.services.duckdb_engine import duckdb_engine
from app.services.step_compiler import step_compiler
from app.schemas.steps import StepSchema
from app.schemas.export import CodeExportResponse, RunFullPipelineResponse


def col_idx_to_letter(col_idx: int) -> str:
    result = ""
    col_idx += 1
    while col_idx > 0:
        col_idx, remainder = divmod(col_idx - 1, 26)
        result = chr(65 + remainder) + result
    return result


class ExportService:
    """
    Multi-format export engine for StepSheet:
    - Excel XLSX with LIVE formulas and pipeline Documentation sheet
    - CSV, Parquet, and JSON downloads
    - Standalone Code Exporters (Power Query M, ANSI/DuckDB SQL, Polars Python)
    - Full pipeline execution engine
    """

    def export_excel_bytes(
        self,
        local_parquet_path: str,
        initial_columns: List[str],
        steps: List[StepSchema],
        dataset_paths: Optional[Dict[str, str]] = None,
        include_formulas: bool = True,
        include_documentation: bool = True,
    ) -> bytes:
        escaped_path = local_parquet_path.replace("\\", "/")
        conn = duckdb_engine.get_connection()

        if steps and len(steps) > 0:
            compiled_sql, step_summaries, final_cols = step_compiler.compile_pipeline(
                parquet_path=local_parquet_path,
                steps=steps,
                initial_columns=initial_columns,
                dataset_paths=dataset_paths or {},
            )
            cur = conn.execute(compiled_sql)
            columns = [d[0] for d in cur.description]
            rows = [dict(zip(columns, r)) for r in cur.fetchall()]
        else:
            cur = conn.execute(f"SELECT * FROM read_parquet('{escaped_path}')")
            columns = [d[0] for d in cur.description]
            rows = [dict(zip(columns, r)) for r in cur.fetchall()]

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {"in_memory": True})

        header_fmt = workbook.add_format({
            "bold": True,
            "font_color": "#FFFFFF",
            "bg_color": "#1E293B",
            "border": 1,
            "border_color": "#334155",
            "font_name": "Calibri",
            "font_size": 11,
            "valign": "vcenter",
        })

        data_cell_fmt = workbook.add_format({
            "border": 1,
            "border_color": "#E2E8F0",
            "font_name": "Calibri",
            "font_size": 11,
            "valign": "vcenter",
        })

        formula_cell_fmt = workbook.add_format({
            "border": 1,
            "border_color": "#CBD5E1",
            "bg_color": "#F0FDF4",
            "font_name": "Calibri",
            "font_size": 11,
            "valign": "vcenter",
        })

        title_fmt = workbook.add_format({
            "bold": True,
            "font_size": 14,
            "font_color": "#0F172A",
            "font_name": "Calibri",
        })

        doc_header_fmt = workbook.add_format({
            "bold": True,
            "font_color": "#FFFFFF",
            "bg_color": "#4338CA",
            "border": 1,
            "font_name": "Calibri",
            "font_size": 10,
        })

        # Sheet 1: Data
        ws_data = workbook.add_worksheet("Data")
        ws_data.freeze_panes(1, 0)

        col_letter_map = {col_name: col_idx_to_letter(idx) for idx, col_name in enumerate(columns)}
        for col_idx, col_name in enumerate(columns):
            ws_data.write(0, col_idx, col_name, header_fmt)

        formula_step_map = {}
        for s in steps:
            if not s.enabled:
                continue
            out_col = s.params.get("output_column") or s.params.get("new_column")
            if out_col and out_col in col_letter_map:
                formula_step_map[out_col] = s

        for row_idx, row_dict in enumerate(rows):
            excel_row_num = row_idx + 2
            for col_idx, col_name in enumerate(columns):
                val = row_dict.get(col_name)

                step_def = formula_step_map.get(col_name)
                formula = None
                if include_formulas and step_def:
                    formula = self._build_row_formula(step_def, col_letter_map, excel_row_num)

                if formula:
                    num_val = float(val) if isinstance(val, (int, float)) else 0
                    ws_data.write_formula(row_idx + 1, col_idx, formula, formula_cell_fmt, num_val)
                else:
                    if val is None:
                        ws_data.write_blank(row_idx + 1, col_idx, "", data_cell_fmt)
                    elif isinstance(val, (int, float)):
                        ws_data.write_number(row_idx + 1, col_idx, val, data_cell_fmt)
                    elif isinstance(val, bool):
                        ws_data.write_boolean(row_idx + 1, col_idx, val, data_cell_fmt)
                    else:
                        ws_data.write_string(row_idx + 1, col_idx, str(val), data_cell_fmt)

        for col_idx, col_name in enumerate(columns):
            max_len = max(len(col_name), 10)
            ws_data.set_column(col_idx, col_idx, max_len + 3)

        # Sheet 2: Documentation
        if include_documentation and steps:
            ws_doc = workbook.add_worksheet("Documentation")
            ws_doc.write(0, 0, "StepSheet Pipeline Transformation Audit Trail", title_fmt)
            ws_doc.write(1, 0, f"Generated automatically • {len(steps)} total steps applied")

            doc_cols = ["Step #", "Step Label", "Type", "Live Excel Formula", "DuckDB SQL Expression", "Parameters Summary"]
            for c_idx, c_name in enumerate(doc_cols):
                ws_doc.write(3, c_idx, c_name, doc_header_fmt)

            for s_idx, s in enumerate(steps):
                d_row = s_idx + 4
                ws_doc.write(d_row, 0, s_idx + 1, data_cell_fmt)
                ws_doc.write(d_row, 1, s.label, data_cell_fmt)
                ws_doc.write(d_row, 2, s.type.upper(), data_cell_fmt)

                dummy_f = self._build_row_formula(s, col_letter_map, 2) or s.params.get("output_column", "N/A")
                ws_doc.write(d_row, 3, dummy_f, data_cell_fmt)
                ws_doc.write(d_row, 4, f"{s.type} transform", data_cell_fmt)
                ws_doc.write(d_row, 5, json.dumps(s.params), data_cell_fmt)

            ws_doc.set_column(0, 0, 8)
            ws_doc.set_column(1, 1, 30)
            ws_doc.set_column(2, 2, 16)
            ws_doc.set_column(3, 3, 30)
            ws_doc.set_column(4, 4, 35)
            ws_doc.set_column(5, 5, 45)

        workbook.close()
        return output.getvalue()

    def _build_row_formula(
        self,
        step: StepSchema,
        col_letter_map: Dict[str, str],
        excel_row_num: int,
    ) -> Optional[str]:
        stype = step.type
        params = step.params

        if stype == "math_transform":
            c1 = params.get("column1", "")
            c2 = params.get("column2", "")
            op = params.get("operation", "arithmetic").lower()
            math_op = params.get("math_operator", "+")

            if op == "arithmetic":
                c1_let = col_letter_map.get(c1)
                if not c1_let:
                    return None
                c2_let = col_letter_map.get(c2)
                if c2_let:
                    return f"={c1_let}{excel_row_num} {math_op} {c2_let}{excel_row_num}"
                elif c2 is not None and str(c2) != "":
                    return f"={c1_let}{excel_row_num} {math_op} {c2}"
                else:
                    return f"={c1_let}{excel_row_num}"

            elif op == "round":
                c1_let = col_letter_map.get(c1)
                decs = params.get("decimals", 2)
                return f"=ROUND({c1_let}{excel_row_num}, {decs})" if c1_let else None

            elif op == "abs":
                c1_let = col_letter_map.get(c1)
                return f"=ABS({c1_let}{excel_row_num})" if c1_let else None

        elif stype == "conditional":
            rules = params.get("rules", [])
            else_val = params.get("else_value", "Other")
            if rules:
                r = rules[0]
                c_let = col_letter_map.get(r.get("column", ""))
                if not c_let:
                    return None
                op_raw = r.get("operator", "eq")
                op_sym = "=" if op_raw == "eq" else "!=" if op_raw == "neq" else ">=" if op_raw == "gte" else "<=" if op_raw == "lte" else ">" if op_raw == "gt" else "<" if op_raw == "lt" else "="
                v = r.get("value")
                val_repr = f'"{v}"' if isinstance(v, str) else str(v)
                res = r.get("result")
                res_repr = f'"{res}"' if isinstance(res, str) else str(res)
                else_repr = f'"{else_val}"' if isinstance(else_val, str) else str(else_val)
                return f"=IF({c_let}{excel_row_num}{op_sym}{val_repr}, {res_repr}, {else_repr})"

        elif stype == "text_transform":
            c = params.get("column", "")
            c_let = col_letter_map.get(c)
            if not c_let:
                return None
            op = params.get("operation", "trim").lower()
            if op == "upper":
                return f"=UPPER({c_let}{excel_row_num})"
            elif op == "lower":
                return f"=LOWER({c_let}{excel_row_num})"
            elif op == "proper":
                return f"=PROPER({c_let}{excel_row_num})"
            elif op == "trim":
                return f"=TRIM({c_let}{excel_row_num})"
            elif op == "left":
                length = params.get("length", 5)
                return f"=LEFT({c_let}{excel_row_num}, {length})"
            elif op == "right":
                length = params.get("length", 5)
                return f"=RIGHT({c_let}{excel_row_num}, {length})"
            elif op == "length":
                return f"=LEN({c_let}{excel_row_num})"
            elif op == "concat":
                c2 = params.get("concat_columns", [])
                sep = params.get("concat_separator", " ")
                if c2 and col_letter_map.get(c2[0]):
                    c2_let = col_letter_map.get(c2[0])
                    return f'=CONCATENATE({c_let}{excel_row_num}, "{sep}", {c2_let}{excel_row_num})'

        elif stype == "date_transform":
            c = params.get("column", "")
            c_let = col_letter_map.get(c)
            if not c_let:
                return None
            op = params.get("operation", "extract_part").lower()
            if op == "extract_part":
                part = params.get("date_part", "year").lower()
                if part == "year":
                    return f"=YEAR({c_let}{excel_row_num})"
                elif part == "month":
                    return f"=MONTH({c_let}{excel_row_num})"
                elif part == "day":
                    return f"=DAY({c_let}{excel_row_num})"
            elif op == "eomonth":
                return f"=EOMONTH({c_let}{excel_row_num}, 0)"

        return None

    def export_csv_bytes(
        self,
        local_parquet_path: str,
        initial_columns: List[str],
        steps: List[StepSchema],
        dataset_paths: Optional[Dict[str, str]] = None,
    ) -> bytes:
        escaped_path = local_parquet_path.replace("\\", "/")
        conn = duckdb_engine.get_connection()
        if steps and len(steps) > 0:
            compiled_sql, _, _ = step_compiler.compile_pipeline(
                parquet_path=local_parquet_path,
                steps=steps,
                initial_columns=initial_columns,
                dataset_paths=dataset_paths or {},
            )
            cur = conn.execute(compiled_sql)
        else:
            cur = conn.execute(f"SELECT * FROM read_parquet('{escaped_path}')")

        buf = io.StringIO()
        writer = csv.writer(buf)
        cols = [d[0] for d in cur.description]
        writer.writerow(cols)
        for r in cur.fetchall():
            writer.writerow(r)
        return buf.getvalue().encode("utf-8")

    def export_parquet_bytes(
        self,
        local_parquet_path: str,
        initial_columns: List[str],
        steps: List[StepSchema],
        dataset_paths: Optional[Dict[str, str]] = None,
    ) -> bytes:
        escaped_path = local_parquet_path.replace("\\", "/")
        conn = duckdb_engine.get_connection()
        if steps and len(steps) > 0:
            compiled_sql, _, _ = step_compiler.compile_pipeline(
                parquet_path=local_parquet_path,
                steps=steps,
                initial_columns=initial_columns,
                dataset_paths=dataset_paths or {},
            )
            sql = compiled_sql
        else:
            sql = f"SELECT * FROM read_parquet('{escaped_path}')"

        temp_parquet = local_parquet_path + f".exp_{int(time.time() * 1000)}.parquet"
        escaped_tmp = temp_parquet.replace("\\", "/")
        conn.execute(f"COPY ({sql}) TO '{escaped_tmp}' (FORMAT PARQUET)")
        with open(temp_parquet, "rb") as f:
            data = f.read()
        try:
            import os
            os.remove(temp_parquet)
        except Exception:
            pass
        return data

    def export_json_bytes(
        self,
        local_parquet_path: str,
        initial_columns: List[str],
        steps: List[StepSchema],
        dataset_paths: Optional[Dict[str, str]] = None,
    ) -> bytes:
        escaped_path = local_parquet_path.replace("\\", "/")
        conn = duckdb_engine.get_connection()
        if steps and len(steps) > 0:
            compiled_sql, _, _ = step_compiler.compile_pipeline(
                parquet_path=local_parquet_path,
                steps=steps,
                initial_columns=initial_columns,
                dataset_paths=dataset_paths or {},
            )
            cur = conn.execute(compiled_sql)
        else:
            cur = conn.execute(f"SELECT * FROM read_parquet('{escaped_path}')")

        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        return json.dumps(rows, indent=2, default=str).encode("utf-8")

    def generate_code_bundle(
        self,
        dataset_id: str,
        local_parquet_path: str,
        initial_columns: List[str],
        steps: List[StepSchema],
        dataset_paths: Optional[Dict[str, str]] = None,
    ) -> CodeExportResponse:
        compiled_sql, step_summaries, _ = step_compiler.compile_pipeline(
            parquet_path=local_parquet_path,
            steps=steps,
            initial_columns=initial_columns,
            dataset_paths=dataset_paths or {},
        )

        polars_lines = [
            "import polars as pl",
            "",
            "# 1. Load source dataset",
            f"df = pl.read_parquet('{dataset_id}.parquet')",
            "",
            "# 2. Apply StepSheet pipeline transformations",
        ]
        for s in step_summaries:
            polars_lines.append(f"# Step: {s.label} ({s.type})")
            polars_lines.append(s.generated_code.polars)
        polars_lines.append("")
        polars_lines.append("# 3. Save or inspect output")
        polars_lines.append("print(df.head(10))")
        polars_lines.append("df.write_csv('output.csv')")

        m_lines = [
            "let",
            '    Source = Csv.Document(File.Contents("data.csv"), [Delimiter=",", Encoding=65001]),',
            '    #"Promoted Headers" = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),',
        ]
        prev_step_name = '#"Promoted Headers"'
        for idx, s in enumerate(step_summaries):
            curr_step_name = f'#"Step_{idx + 1}_{s.type}"'
            m_expr = s.generated_code.power_query_m.replace("Source", prev_step_name)
            m_lines.append(f"    {curr_step_name} = {m_expr},")
            prev_step_name = curr_step_name
        m_lines.append(f"in")
        m_lines.append(f"    {prev_step_name}")

        excel_formulas = []
        for s in step_summaries:
            if s.generated_code.excel_formula:
                excel_formulas.append({"step": s.label, "formula": s.generated_code.excel_formula})

        return CodeExportResponse(
            dataset_id=dataset_id,
            sql=compiled_sql,
            power_query_m="\n".join(m_lines),
            polars="\n".join(polars_lines),
            excel_formulas=excel_formulas,
        )

    def run_full_pipeline(
        self,
        dataset_id: str,
        local_parquet_path: str,
        initial_columns: List[str],
        steps: List[StepSchema],
        dataset_paths: Optional[Dict[str, str]] = None,
    ) -> RunFullPipelineResponse:
        start_time = time.perf_counter()
        compiled_sql, _, final_cols = step_compiler.compile_pipeline(
            parquet_path=local_parquet_path,
            steps=steps,
            initial_columns=initial_columns,
            dataset_paths=dataset_paths or {},
        )

        conn = duckdb_engine.get_connection()
        total_rows = conn.execute(f"SELECT COUNT(*) FROM ({compiled_sql})").fetchone()[0]
        cur = conn.execute(f"{compiled_sql} LIMIT 10")
        cols = [d[0] for d in cur.description]
        sample_rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        duration_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

        return RunFullPipelineResponse(
            dataset_id=dataset_id,
            total_rows=total_rows,
            column_count=len(final_cols),
            execution_time_ms=duration_ms,
            status="success",
            sample_preview=sample_rows,
        )


export_service = ExportService()
