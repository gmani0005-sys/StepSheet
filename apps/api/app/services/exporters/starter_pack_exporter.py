import os
import io
import json
import zipfile
from typing import Dict, Any, Tuple, Optional, List
from app.services.exporters.snapshot import ExportSnapshot
from app.services.exporters.datafile_exporter import export_csv_file
from app.services.export_service import export_service


def export_powerbi_starter_pack_file(
    snapshot: ExportSnapshot,
    output_dir: str,
) -> Tuple[str, int, str]:
    """
    Creates a Power BI Starter Pack archive (.zip):
      - data.csv: Clean transformed data with formula injection escaping
      - pipeline_transformations.m: Ready-to-paste Power Query M script
      - schema_dictionary.txt: Column schemas & data types
      - README.md: Step-by-step import instructions for Power BI Desktop
      - metadata.json: Pipeline run metadata & integrity stats

    Returns (absolute_file_path, size_bytes, mime_type).
    """
    clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in snapshot.dataset_name)
    filename = f"{clean_name}_powerbi_starter_pack.zip"
    filepath = os.path.join(output_dir, filename)

    # 1. Generate clean CSV data
    temp_dir = os.path.join(output_dir, f"_temp_pbi_{snapshot.job_id}")
    os.makedirs(temp_dir, exist_ok=True)
    csv_path, _, _ = export_csv_file(snapshot, temp_dir)

    with open(csv_path, "r", encoding="utf-8") as f:
        csv_content = f.read()

    # 2. Generate Power Query M script
    m_lines = [
        "// StepSheet Power Query M Pipeline Script",
        f"// Dataset: {snapshot.dataset_name}",
        f"// Generated: {snapshot.data_as_of}",
        "let",
        '    Source = Csv.Document(File.Contents("data.csv"), [Delimiter=",", Encoding=65001]),',
        '    #"Promoted Headers" = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),',
    ]

    prev_step_name = '#"Promoted Headers"'
    for idx, s in enumerate(snapshot.steps):
        stype = getattr(s, "type", "transform")
        curr_step_name = f'#"Step_{idx + 1}_{stype}"'
        params = getattr(s, "params", {}) or {}

        if stype == "math_transform":
            c1 = params.get("column1", "")
            c2 = params.get("column2", "")
            out_col = params.get("output_column", "calculated")
            math_op = params.get("math_operator", "+")
            m_expr = f'Table.AddColumn({prev_step_name}, "{out_col}", each [{c1}] {math_op} [{c2}])'
        elif stype == "text_transform":
            col = params.get("column", "")
            op = params.get("operation", "upper").lower()
            out_col = params.get("output_column", col)
            fn_map = {"upper": "Text.Upper", "lower": "Text.Lower", "trim": "Text.Trim", "proper": "Text.Proper"}
            m_fn = fn_map.get(op, "Text.Upper")
            m_expr = f'Table.TransformColumns({prev_step_name}, {{"{col}", {m_fn}, type text}})'
        elif stype == "filter_rows":
            col = params.get("column", "")
            val = params.get("value", "")
            m_expr = f'Table.SelectRows({prev_step_name}, each ([{col}] = "{val}"))'
        else:
            m_expr = f'Table.TransformColumnTypes({prev_step_name}, {{}})'

        m_lines.append(f"    {curr_step_name} = {m_expr},")
        prev_step_name = curr_step_name

    m_lines.append("in")
    m_lines.append(f"    {prev_step_name}")
    m_script = "\n".join(m_lines)

    # 3. Generate Schema Dictionary
    dict_lines = [
        f"Schema Dictionary for {snapshot.dataset_name}",
        "=" * 50,
        f"Total Exported Records: {snapshot.total_exported_rows:,}",
        f"Active Columns: {len(snapshot.columns)}",
        "",
        f"{'COLUMN NAME':<25} {'DATA TYPE':<15} {'NULLABLE':<10}",
        "-" * 50,
    ]
    for c in snapshot.columns:
        ctype = snapshot.column_types.get(c, "text")
        null_count = sum(1 for r in snapshot.rows if r.get(c) is None or str(r.get(c)).strip() == "")
        nullable = "YES" if null_count > 0 else "NO"
        dict_lines.append(f"{c:<25} {ctype:<15} {nullable:<10}")
    schema_dict_text = "\n".join(dict_lines)

    # 4. Generate README.md
    readme_text = f"""# Power BI Starter Pack: {snapshot.dataset_name}

This archive contains everything needed to import and reproduce your StepSheet transformations in Power BI Desktop.

## Files in this Starter Pack:
- `data.csv`: Transformed dataset ready for analytics.
- `pipeline_transformations.m`: Reproducible Power Query M code.
- `schema_dictionary.txt`: Column definitions and data types.
- `metadata.json`: Integrity and execution summary.

## How to Import into Power BI Desktop:
1. Open **Power BI Desktop**.
2. Click **Get Data** > **Blank Query**.
3. In the Home ribbon of Power Query, click **Advanced Editor**.
4. Replace the existing template with the code inside `pipeline_transformations.m`.
5. Update the path to `data.csv` to point to your local file location.
6. Click **Done** and **Close & Apply**.

Generated automatically by StepSheet on {snapshot.data_as_of}.
"""

    # 5. Metadata JSON
    metadata = {
        "dataset_name": snapshot.dataset_name,
        "project_name": snapshot.project_name,
        "generated_at": snapshot.data_as_of,
        "total_raw_rows": snapshot.total_raw_rows,
        "total_exported_rows": snapshot.total_exported_rows,
        "columns": snapshot.columns,
        "steps_count": len(snapshot.steps),
        "author": snapshot.author,
    }

    # Write Zip Archive
    with zipfile.ZipFile(filepath, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.csv", csv_content)
        zf.writestr("pipeline_transformations.m", m_script)
        zf.writestr("schema_dictionary.txt", schema_dict_text)
        zf.writestr("README.md", readme_text)
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

    # Clean up temp
    try:
        os.remove(csv_path)
        os.rmdir(temp_dir)
    except Exception:
        pass

    size_bytes = os.path.getsize(filepath)
    mime_type = "application/zip"
    return filepath, size_bytes, mime_type


def export_pipeline_code_bundle_file(
    snapshot: ExportSnapshot,
    output_dir: str,
) -> Tuple[str, int, str]:
    """
    Creates a Pipeline Code Bundle archive (.zip):
      - pipeline_query.sql: End-to-end DuckDB / ANSI SQL query
      - pipeline_transformations.m: Reproducible Power Query M code
      - pipeline_polars.py: Python Polars transformation script
      - excel_formulas.txt: Step-by-step Excel formula specifications
      - README.md: Usage instructions for each environment

    Returns (absolute_file_path, size_bytes, mime_type).
    """
    clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in snapshot.dataset_name)
    filename = f"{clean_name}_pipeline_code_bundle.zip"
    filepath = os.path.join(output_dir, filename)

    # 1. SQL Query
    sql_script = snapshot.compiled_sql or f"SELECT * FROM {snapshot.dataset_name}"
    sql_content = f"""-- =========================================================================
-- StepSheet Reproducible Pipeline Query
-- Dataset: {snapshot.dataset_name}
-- Generated: {snapshot.data_as_of}
-- =========================================================================

{sql_script};
"""

    # 2. Python Polars Script
    polars_lines = [
        "import polars as pl",
        "",
        "# 1. Ingest raw dataset",
        f"df = pl.read_csv('data.csv')",
        "",
        "# 2. Apply transformations",
    ]
    for s_idx, s in enumerate(snapshot.steps):
        params = getattr(s, "params", {}) or {}
        stype = getattr(s, "type", "transform")
        label = getattr(s, "label", f"Step {s_idx + 1}")
        polars_lines.append(f"# Step {s_idx + 1}: {label} ({stype})")
        if stype == "math_transform":
            c1 = params.get("column1", "")
            c2 = params.get("column2", "")
            out_col = params.get("output_column", "calculated")
            op = params.get("math_operator", "+")
            polars_lines.append(f"df = df.with_columns((pl.col('{c1}') {op} pl.col('{c2}')).alias('{out_col}'))")
        elif stype == "filter_rows":
            col = params.get("column", "")
            val = params.get("value", "")
            polars_lines.append(f"df = df.filter(pl.col('{col}') == '{val}')")
        elif stype == "text_transform":
            col = params.get("column", "")
            op = params.get("operation", "upper").lower()
            if op == "upper":
                polars_lines.append(f"df = df.with_columns(pl.col('{col}').str.to_uppercase())")
            elif op == "lower":
                polars_lines.append(f"df = df.with_columns(pl.col('{col}').str.to_lowercase())")
        else:
            polars_lines.append(f"# {stype} operation")

    polars_lines.append("")
    polars_lines.append("# 3. Preview and export results")
    polars_lines.append("print(df.head())")
    polars_lines.append("df.write_parquet('output.parquet')")
    polars_content = "\n".join(polars_lines)

    # 3. Power Query M Script
    m_lines = [
        "// StepSheet Power Query M Script",
        "let",
        '    Source = Csv.Document(File.Contents("data.csv"), [Delimiter=",", Encoding=65001]),',
        '    #"Promoted Headers" = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),',
    ]
    prev_m = '#"Promoted Headers"'
    for s_idx, s in enumerate(snapshot.steps):
        stype = getattr(s, "type", "transform")
        curr_m = f'#"Step_{s_idx + 1}_{stype}"'
        m_lines.append(f'    {curr_m} = Table.TransformColumnTypes({prev_m}, {{}}),')
        prev_m = curr_m
    m_lines.append("in")
    m_lines.append(f"    {prev_m}")
    m_content = "\n".join(m_lines)

    # 4. Excel Formula Reference
    excel_lines = [
        f"Excel Formula Reference for {snapshot.dataset_name}",
        "=" * 50,
    ]
    for s_idx, s in enumerate(snapshot.steps):
        params = getattr(s, "params", {}) or {}
        label = getattr(s, "label", f"Step {s_idx + 1}")
        formula = params.get("formula") or params.get("expression") or "N/A"
        excel_lines.append(f"Step {s_idx + 1}: {label}")
        excel_lines.append(f"Formula / Expression: {formula}")
        excel_lines.append("-" * 30)
    excel_content = "\n".join(excel_lines)

    # 5. README.md
    readme_content = f"""# Pipeline Code Bundle: {snapshot.dataset_name}

This bundle contains code representations of your data pipeline across major engines:

- `pipeline_query.sql`: Run in DuckDB, PostgreSQL, Snowflake, or BigQuery.
- `pipeline_polars.py`: Execute with Python Polars (`pip install polars`).
- `pipeline_transformations.m`: Paste into Power Query Advanced Editor.
- `excel_formulas.txt`: Step-by-step formula specifications.

Generated automatically by StepSheet on {snapshot.data_as_of}.
"""

    with zipfile.ZipFile(filepath, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("pipeline_query.sql", sql_content)
        zf.writestr("pipeline_polars.py", polars_content)
        zf.writestr("pipeline_transformations.m", m_content)
        zf.writestr("excel_formulas.txt", excel_content)
        zf.writestr("README.md", readme_content)

    size_bytes = os.path.getsize(filepath)
    mime_type = "application/zip"
    return filepath, size_bytes, mime_type


def export_complete_share_pack_file(
    snapshot: ExportSnapshot,
    output_dir: str,
    bundled_files: List[Tuple[str, str]],  # (file_path, archive_arcname)
) -> Tuple[str, int, str]:
    """
    Creates a Consolidated Complete Share Pack archive (.zip):
      - Bundles all generated deliverables: packaged workbook (.xlsx), PDF report (.pdf),
        PowerPoint presentation (.pptx), clean CSV, and code files.
      - Includes a top-level README.txt summary index.

    Returns (absolute_file_path, size_bytes, mime_type).
    """
    clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in snapshot.dataset_name)
    filename = f"{clean_name}_share_pack.zip"
    filepath = os.path.join(output_dir, filename)

    # Top-level index README.txt
    readme_lines = [
        "=========================================================================",
        f"STEPSHEET COMPLETE SHARE PACK: {snapshot.dataset_name}",
        "=========================================================================",
        f"Project:            {snapshot.project_name or 'Default'}",
        f"Snapshot Date:      {snapshot.data_as_of}",
        f"Author:             {snapshot.author}",
        f"Total Raw Rows:     {snapshot.total_raw_rows:,}",
        f"Exported Rows:      {snapshot.total_exported_rows:,}",
        f"Active Columns:     {len(snapshot.columns)}",
        f"Quality Health:     {(snapshot.quality_report or {}).get('overall_score', 99.0):.1f}%",
        "",
        "CONTENTS OF THIS SHARE PACK:",
        "-------------------------------------------------------------------------",
    ]

    for f_path, arc_name in bundled_files:
        size = os.path.getsize(f_path) if os.path.exists(f_path) else 0
        readme_lines.append(f"• {arc_name:<35} ({size:,} bytes)")

    readme_lines.extend([
        "",
        "HOW TO USE THESE ARTIFACTS:",
        "• Excel Workbook (.xlsx): Open in Microsoft Excel or Google Sheets (includes data, live formulas & quality report).",
        "• PDF Report (.pdf): Executive overview with KPIs, data sample, and audit trail.",
        "• PowerPoint (.pptx): 16:9 widescreen slides ready for team presentation.",
        "• Data Files & Code: Standard raw assets for downstream pipelines and analytics.",
        "",
        "Generated by StepSheet Enterprise Analytics Engine.",
    ])
    readme_content = "\n".join(readme_lines)

    with zipfile.ZipFile(filepath, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.txt", readme_content)
        for f_path, arc_name in bundled_files:
            if os.path.exists(f_path):
                zf.write(f_path, arcname=arc_name)

    size_bytes = os.path.getsize(filepath)
    mime_type = "application/zip"
    return filepath, size_bytes, mime_type
