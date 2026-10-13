import os
import io
import csv
import json
from pathlib import Path
from typing import Dict, Any, Tuple
import pyarrow as pa
import pyarrow.parquet as pq
import xlsxwriter
from app.services.exporters.snapshot import ExportSnapshot


def sanitize_formula_injection(value: Any) -> Any:
    """
    Prevents CSV / spreadsheet formula injection.
    Prefix values starting with '=', '+', '-', '@' with a single apostrophe `'`
    for text columns, without altering genuine numeric values.
    """
    if value is None:
        return ""
    if isinstance(value, (int, float, bool)):
        return value
    s = str(value)
    if s and s[0] in ("=", "+", "-", "@"):
        # Don't escape if it's a valid integer or float like -123 or +5.4
        try:
            float(s)
            return value
        except ValueError:
            return f"'{s}"
    return s


def export_csv_file(
    snapshot: ExportSnapshot,
    output_dir: str,
    delimiter: str = ",",
    encoding: str = "utf-8",
    quote_style: str = "minimal",
) -> Tuple[str, int, str]:
    """
    Exports snapshot rows to CSV with customizable delimiter, encoding, and formula-injection escaping.
    Returns (absolute_file_path, size_bytes, mime_type).
    """
    clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in snapshot.dataset_name)
    filename = f"{clean_name}_export.csv"
    filepath = os.path.join(output_dir, filename)

    quoting = csv.QUOTE_MINIMAL
    if quote_style == "all":
        quoting = csv.QUOTE_ALL
    elif quote_style == "nonnumeric":
        quoting = csv.QUOTE_NONNUMERIC

    with open(filepath, "w", newline="", encoding=encoding, errors="replace") as f:
        writer = csv.writer(f, delimiter=delimiter, quoting=quoting)
        writer.writerow(snapshot.columns)
        for row in snapshot.rows:
            cleaned_row = [sanitize_formula_injection(row.get(c)) for c in snapshot.columns]
            writer.writerow(cleaned_row)

    size = os.path.getsize(filepath)
    return filepath, size, "text/csv"


def export_parquet_file(
    snapshot: ExportSnapshot,
    output_dir: str,
) -> Tuple[str, int, str]:
    """
    Exports snapshot rows to Apache Parquet via PyArrow.
    Returns (absolute_file_path, size_bytes, mime_type).
    """
    clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in snapshot.dataset_name)
    filename = f"{clean_name}_export.parquet"
    filepath = os.path.join(output_dir, filename)

    pydict = {col: [row.get(col) for row in snapshot.rows] for col in snapshot.columns}
    table = pa.Table.from_pydict(pydict)
    pq.write_table(table, filepath, compression="snappy")

    size = os.path.getsize(filepath)
    return filepath, size, "application/octet-stream"


def export_json_file(
    snapshot: ExportSnapshot,
    output_dir: str,
) -> Tuple[str, int, str]:
    """
    Exports snapshot rows to structured JSON array of records.
    Returns (absolute_file_path, size_bytes, mime_type).
    """
    clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in snapshot.dataset_name)
    filename = f"{clean_name}_export.json"
    filepath = os.path.join(output_dir, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(snapshot.rows, f, indent=2, default=str)

    size = os.path.getsize(filepath)
    return filepath, size, "application/json"


def export_xlsx_values_file(
    snapshot: ExportSnapshot,
    output_dir: str,
) -> Tuple[str, int, str]:
    """
    Exports snapshot rows as an Excel table (.xlsx) with styled headers and typed cells.
    Returns (absolute_file_path, size_bytes, mime_type).
    """
    clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in snapshot.dataset_name)
    filename = f"{clean_name}_export.xlsx"
    filepath = os.path.join(output_dir, filename)

    workbook = xlsxwriter.Workbook(filepath, {"constant_memory": False})
    ws = workbook.add_worksheet("Data")
    ws.freeze_panes(1, 0)

    hdr_fmt = workbook.add_format({
        "bold": True,
        "font_color": "#FFFFFF",
        "bg_color": "#217346",
        "border": 1,
        "font_name": "Calibri",
        "font_size": 11,
        "valign": "vcenter",
    })

    cell_fmt = workbook.add_format({
        "border": 1,
        "border_color": "#E2E8F0",
        "font_name": "Calibri",
        "font_size": 11,
        "valign": "vcenter",
    })

    num_fmt = workbook.add_format({
        "border": 1,
        "border_color": "#E2E8F0",
        "font_name": "Calibri",
        "font_size": 11,
        "num_format": "#,##0.00",
        "valign": "vcenter",
    })

    int_fmt = workbook.add_format({
        "border": 1,
        "border_color": "#E2E8F0",
        "font_name": "Calibri",
        "font_size": 11,
        "num_format": "#,##0",
        "valign": "vcenter",
    })

    for col_idx, col_name in enumerate(snapshot.columns):
        ws.write(0, col_idx, col_name, hdr_fmt)

    col_max_lens = [len(c) for c in snapshot.columns]

    for row_idx, row in enumerate(snapshot.rows):
        excel_row = row_idx + 1
        for col_idx, col_name in enumerate(snapshot.columns):
            val = row.get(col_name)
            str_len = len(str(val)) if val is not None else 0
            if str_len > col_max_lens[col_idx]:
                col_max_lens[col_idx] = min(50, str_len)

            if val is None:
                ws.write_blank(excel_row, col_idx, "", cell_fmt)
            elif isinstance(val, int):
                ws.write_number(excel_row, col_idx, val, int_fmt)
            elif isinstance(val, float):
                ws.write_number(excel_row, col_idx, val, num_fmt)
            elif isinstance(val, bool):
                ws.write_boolean(excel_row, col_idx, val, cell_fmt)
            else:
                ws.write_string(excel_row, col_idx, sanitize_formula_injection(val), cell_fmt)

    # Set column widths with safety margin
    for col_idx, m_len in enumerate(col_max_lens):
        ws.set_column(col_idx, col_idx, max(12, m_len + 3))

    workbook.close()
    size = os.path.getsize(filepath)
    return filepath, size, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
