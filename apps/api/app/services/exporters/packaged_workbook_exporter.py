import os
import io
import re
import json
from typing import List, Dict, Any, Tuple, Optional
import xlsxwriter
from app.services.exporters.snapshot import ExportSnapshot
from app.services.export_service import ExportService, col_idx_to_letter


def clean_sheet_name(name: str, max_len: int = 31) -> str:
    r"""Excel sheet names cannot exceed 31 chars and cannot contain []:*?/\."""
    cleaned = re.sub(r"[\[\]:*?/\\]", "_", name)
    return cleaned[:max_len] if cleaned else "Sheet"


def export_packaged_workbook_file(
    snapshot: ExportSnapshot,
    output_dir: str,
    include_live_formulas: bool = True,
    include_lineage: bool = True,
    include_quality: bool = True,
    include_lookups: bool = True,
    include_dictionary: bool = True,
) -> Tuple[str, int, str]:
    """
    Builds a complete, multi-tab Packaged Workbook (.xlsx) deliverable:
      - Tab 1: Output Data (clean data, auto-filter, frozen header, type formats, live formulas)
      - Tab 2: Formula Lineage (step-by-step pipeline audit trail & logic)
      - Tab 3: Data Quality (quality rules evaluated, health score, pass/warn/fail counts)
      - Tab 4: Referenced Lookups (self-contained lookup tables frozen at snapshot time)
      - Tab 5: Data Dictionary (column types, null counts, null %, unique counts, samples)

    Returns (absolute_file_path, size_bytes, mime_type).
    """
    clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in snapshot.dataset_name)
    filename = f"{clean_name}_packaged_workbook.xlsx"
    filepath = os.path.join(output_dir, filename)

    workbook = xlsxwriter.Workbook(filepath, {"in_memory": False})

    # Typography & Colors: StepSheet Microsoft Fluent Palette
    font_name = "Calibri"

    # Formats
    hdr_main_fmt = workbook.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 11,
        "font_color": "#FFFFFF",
        "bg_color": "#185C37",  # StepSheet Forest Green
        "border": 1,
        "border_color": "#124629",
        "valign": "vcenter",
    })

    hdr_accent_fmt = workbook.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 11,
        "font_color": "#FFFFFF",
        "bg_color": "#217346",  # StepSheet Medium Green
        "border": 1,
        "border_color": "#185C37",
        "valign": "vcenter",
    })

    hdr_slate_fmt = workbook.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 11,
        "font_color": "#FFFFFF",
        "bg_color": "#1E293B",  # Slate
        "border": 1,
        "border_color": "#0F172A",
        "valign": "vcenter",
    })

    title_fmt = workbook.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 14,
        "font_color": "#0F172A",
    })

    subtitle_fmt = workbook.add_format({
        "font_name": font_name,
        "font_size": 10,
        "font_color": "#475569",
    })

    meta_label_fmt = workbook.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 10,
        "font_color": "#334155",
        "bg_color": "#F1F5F9",
        "border": 1,
        "border_color": "#CBD5E1",
    })

    meta_val_fmt = workbook.add_format({
        "font_name": font_name,
        "font_size": 10,
        "font_color": "#0F172A",
        "border": 1,
        "border_color": "#CBD5E1",
    })

    cell_text_fmt = workbook.add_format({
        "font_name": font_name,
        "font_size": 10,
        "border": 1,
        "border_color": "#E2E8F0",
        "valign": "vcenter",
    })

    cell_int_fmt = workbook.add_format({
        "font_name": font_name,
        "font_size": 10,
        "num_format": "#,##0",
        "border": 1,
        "border_color": "#E2E8F0",
        "valign": "vcenter",
    })

    cell_float_fmt = workbook.add_format({
        "font_name": font_name,
        "font_size": 10,
        "num_format": "#,##0.00",
        "border": 1,
        "border_color": "#E2E8F0",
        "valign": "vcenter",
    })

    cell_curr_fmt = workbook.add_format({
        "font_name": font_name,
        "font_size": 10,
        "num_format": "$#,##0.00",
        "border": 1,
        "border_color": "#E2E8F0",
        "valign": "vcenter",
    })

    cell_pct_fmt = workbook.add_format({
        "font_name": font_name,
        "font_size": 10,
        "num_format": "0.0%",
        "border": 1,
        "border_color": "#E2E8F0",
        "valign": "vcenter",
    })

    cell_date_fmt = workbook.add_format({
        "font_name": font_name,
        "font_size": 10,
        "num_format": "yyyy-mm-dd",
        "border": 1,
        "border_color": "#E2E8F0",
        "valign": "vcenter",
    })

    cell_formula_fmt = workbook.add_format({
        "font_name": font_name,
        "font_size": 10,
        "bg_color": "#F0FDF4",  # Subtle green tint for formulas
        "border": 1,
        "border_color": "#86EFAC",
        "valign": "vcenter",
    })

    badge_pass_fmt = workbook.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 10,
        "bg_color": "#DCFCE7",
        "font_color": "#166534",
        "border": 1,
        "border_color": "#86EFAC",
        "align": "center",
    })

    badge_warn_fmt = workbook.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 10,
        "bg_color": "#FEF3C7",
        "font_color": "#92400E",
        "border": 1,
        "border_color": "#FCD34D",
        "align": "center",
    })

    badge_fail_fmt = workbook.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 10,
        "bg_color": "#FEE2E2",
        "font_color": "#991B1B",
        "border": 1,
        "border_color": "#FCA5A5",
        "align": "center",
    })

    # =========================================================================
    # TAB 1: OUTPUT DATA
    # =========================================================================
    ws_data = workbook.add_worksheet("Output Data")
    ws_data.freeze_panes(1, 0)

    columns = snapshot.columns
    rows = snapshot.rows
    col_letter_map = {col_name: col_idx_to_letter(idx) for idx, col_name in enumerate(columns)}

    for col_idx, col_name in enumerate(columns):
        ws_data.write(0, col_idx, col_name, hdr_main_fmt)

    # Map output columns created by steps to their step definition
    formula_step_map = {}
    if include_live_formulas:
        for s in snapshot.steps:
            if not getattr(s, "enabled", True):
                continue
            params = getattr(s, "params", {}) or {}
            out_col = params.get("output_column") or params.get("new_column")
            if out_col and out_col in col_letter_map:
                formula_step_map[out_col] = s

    exp_service = ExportService()

    # Determine column formats
    def get_col_format(col_name: str, val: Any) -> Any:
        col_lower = col_name.lower()
        if any(w in col_lower for w in ("revenue", "price", "cost", "salary", "amount", "total", "sales", "fee", "margin", "profit", "budget")):
            return cell_curr_fmt
        if any(w in col_lower for w in ("pct", "percent", "rate", "ratio")) and isinstance(val, (int, float)) and abs(float(val)) <= 1.0:
            return cell_pct_fmt
        if isinstance(val, float):
            return cell_float_fmt
        if isinstance(val, int) and not isinstance(val, bool):
            return cell_int_fmt
        return cell_text_fmt

    max_lens = [len(c) for c in columns]

    for row_idx, r in enumerate(rows):
        excel_row_num = row_idx + 2
        for col_idx, col_name in enumerate(columns):
            val = r.get(col_name)
            col_fmt = get_col_format(col_name, val)

            step_def = formula_step_map.get(col_name)
            formula_str = None
            if include_live_formulas and step_def:
                try:
                    formula_str = exp_service._build_row_formula(step_def, col_letter_map, excel_row_num)
                except Exception:
                    formula_str = None

            if formula_str:
                num_val = float(val) if isinstance(val, (int, float)) else 0
                ws_data.write_formula(row_idx + 1, col_idx, formula_str, cell_formula_fmt, num_val)
            else:
                if val is None:
                    ws_data.write_blank(row_idx + 1, col_idx, "", col_fmt)
                elif isinstance(val, (int, float)) and not isinstance(val, bool):
                    ws_data.write_number(row_idx + 1, col_idx, val, col_fmt)
                elif isinstance(val, bool):
                    ws_data.write_boolean(row_idx + 1, col_idx, val, col_fmt)
                else:
                    s_val = str(val)
                    ws_data.write_string(row_idx + 1, col_idx, s_val, col_fmt)
                    if len(s_val) > max_lens[col_idx]:
                        max_lens[col_idx] = len(s_val)

    # Set column widths & auto-filter
    if rows:
        ws_data.autofilter(0, 0, len(rows), len(columns) - 1)

    for col_idx in range(len(columns)):
        width = max(max_lens[col_idx] + 3, 12)
        ws_data.set_column(col_idx, col_idx, min(width, 50))

    # =========================================================================
    # TAB 2: FORMULA LINEAGE
    # =========================================================================
    if include_lineage:
        ws_lineage = workbook.add_worksheet("Formula Lineage")
        ws_lineage.write(0, 0, "StepSheet Pipeline Lineage & Audit Trail", title_fmt)
        ws_lineage.write(1, 0, f"Generated automatically • {len(snapshot.steps)} transformation step(s) applied", subtitle_fmt)

        # Metadata cards
        meta_items = [
            ("Dataset Name", snapshot.dataset_name),
            ("Project", snapshot.project_name or "StepSheet Project"),
            ("Data As Of", snapshot.data_as_of),
            ("Author", snapshot.author or "StepSheet User"),
            ("Raw Input Rows", f"{snapshot.total_raw_rows:,}"),
            ("Exported Rows", f"{snapshot.total_exported_rows:,}"),
            ("Excluded Columns", ", ".join(snapshot.excluded_columns) if snapshot.excluded_columns else "None"),
        ]

        for m_idx, (m_label, m_val) in enumerate(meta_items):
            ws_lineage.write(3 + m_idx, 0, m_label, meta_label_fmt)
            ws_lineage.write(3 + m_idx, 1, m_val, meta_val_fmt)

        # Steps table
        table_start_row = 12
        lineage_cols = [
            ("Step #", 8),
            ("Step Name / Label", 30),
            ("Step Type", 18),
            ("Target Column", 20),
            ("Excel Formula / Logic", 36),
            ("Parameters Summary", 40),
            ("Status", 12),
        ]

        for c_idx, (c_name, c_w) in enumerate(lineage_cols):
            ws_lineage.write(table_start_row, c_idx, c_name, hdr_accent_fmt)
            ws_lineage.set_column(c_idx, c_idx, c_w)

        ws_lineage.freeze_panes(table_start_row + 1, 0)

        for s_idx, s in enumerate(snapshot.steps):
            cur_r = table_start_row + 1 + s_idx
            params = getattr(s, "params", {}) or {}
            label = getattr(s, "label", f"Step {s_idx + 1}")
            stype = getattr(s, "type", "transform")
            target_col = params.get("output_column") or params.get("new_column") or params.get("column") or "-"
            enabled = getattr(s, "enabled", True)

            sample_f = exp_service._build_row_formula(s, col_letter_map, 2) or "N/A"

            ws_lineage.write(cur_r, 0, s_idx + 1, cell_int_fmt)
            ws_lineage.write(cur_r, 1, label, cell_text_fmt)
            ws_lineage.write(cur_r, 2, stype.upper(), cell_text_fmt)
            ws_lineage.write(cur_r, 3, target_col, cell_text_fmt)
            ws_lineage.write(cur_r, 4, sample_f, cell_text_fmt)
            ws_lineage.write(cur_r, 5, json.dumps(params), cell_text_fmt)
            ws_lineage.write(cur_r, 6, "ENABLED" if enabled else "DISABLED", badge_pass_fmt if enabled else badge_warn_fmt)

    # =========================================================================
    # TAB 3: DATA QUALITY
    # =========================================================================
    if include_quality:
        ws_quality = workbook.add_worksheet("Data Quality")
        ws_quality.write(0, 0, "StepSheet Data Quality & Health Audit", title_fmt)
        ws_quality.write(1, 0, f"Quality evaluation for {snapshot.dataset_name}", subtitle_fmt)

        q_rep = snapshot.quality_report or {}
        overall_score = q_rep.get("overall_score", 100.0)
        rules = q_rep.get("rules", [])
        total_eval = len(rules)
        pass_count = sum(1 for r in rules if r.get("status") == "pass")
        fail_count = sum(1 for r in rules if r.get("status") == "fail")
        warn_count = sum(1 for r in rules if r.get("status") == "warn")

        # Summary Metrics
        q_meta = [
            ("Data Health Score", f"{overall_score:.1f}%"),
            ("Total Rules Evaluated", total_eval if total_eval > 0 else len(columns)),
            ("Rules Passed", pass_count if total_eval > 0 else len(columns)),
            ("Rules with Warnings", warn_count),
            ("Rules Failed", fail_count),
        ]

        for m_idx, (m_label, m_val) in enumerate(q_meta):
            ws_quality.write(3 + m_idx, 0, m_label, meta_label_fmt)
            ws_quality.write(3 + m_idx, 1, m_val, meta_val_fmt)

        q_table_row = 10
        q_cols = [
            ("Rule #", 8),
            ("Rule Name", 28),
            ("Target Column", 20),
            ("Validation Type", 18),
            ("Status", 12),
            ("Passing Records", 16),
            ("Failing / Anomalies", 18),
            ("Diagnostics", 35),
        ]

        for c_idx, (c_name, c_w) in enumerate(q_cols):
            ws_quality.write(q_table_row, c_idx, c_name, hdr_slate_fmt)
            ws_quality.set_column(c_idx, c_idx, c_w)

        ws_quality.freeze_panes(q_table_row + 1, 0)

        if rules:
            for r_idx, rule in enumerate(rules):
                cur_r = q_table_row + 1 + r_idx
                st = rule.get("status", "pass").upper()
                badge_fmt = badge_pass_fmt if st == "PASS" else badge_fail_fmt if st == "FAIL" else badge_warn_fmt
                ws_quality.write(cur_r, 0, r_idx + 1, cell_int_fmt)
                ws_quality.write(cur_r, 1, rule.get("rule_name", "Check"), cell_text_fmt)
                ws_quality.write(cur_r, 2, rule.get("column", "All"), cell_text_fmt)
                ws_quality.write(cur_r, 3, rule.get("rule_type", "type_check"), cell_text_fmt)
                ws_quality.write(cur_r, 4, st, badge_fmt)
                ws_quality.write(cur_r, 5, rule.get("passing_count", len(rows)), cell_int_fmt)
                ws_quality.write(cur_r, 6, rule.get("failing_count", 0), cell_int_fmt)
                ws_quality.write(cur_r, 7, rule.get("message", "Compliant"), cell_text_fmt)
        else:
            # Generate synthetic null check report based on actual rows
            for c_idx, col_name in enumerate(columns):
                cur_r = q_table_row + 1 + c_idx
                nulls = sum(1 for r in rows if r.get(col_name) is None or str(r.get(col_name)).strip() == "")
                passing = len(rows) - nulls
                st = "PASS" if nulls == 0 else "WARN" if nulls < len(rows) * 0.1 else "FAIL"
                badge_fmt = badge_pass_fmt if st == "PASS" else badge_warn_fmt if st == "WARN" else badge_fail_fmt

                ws_quality.write(cur_r, 0, c_idx + 1, cell_int_fmt)
                ws_quality.write(cur_r, 1, f"NotNull_{col_name}", cell_text_fmt)
                ws_quality.write(cur_r, 2, col_name, cell_text_fmt)
                ws_quality.write(cur_r, 3, "completeness", cell_text_fmt)
                ws_quality.write(cur_r, 4, st, badge_fmt)
                ws_quality.write(cur_r, 5, passing, cell_int_fmt)
                ws_quality.write(cur_r, 6, nulls, cell_int_fmt)
                ws_quality.write(cur_r, 7, f"{nulls} missing values ({nulls / max(1, len(rows)):.1%})" if nulls > 0 else "100% complete", cell_text_fmt)

    # =========================================================================
    # TAB 4: REFERENCED LOOKUPS
    # =========================================================================
    if include_lookups and snapshot.lookup_tables:
        for lookup_id, lkp_data in snapshot.lookup_tables.items():
            t_name = lkp_data.get("name", "Lookup")
            sheet_title = clean_sheet_name(f"Lookup_{t_name}")
            ws_lkp = workbook.add_worksheet(sheet_title)
            ws_lkp.freeze_panes(1, 0)

            lkp_cols = lkp_data.get("columns", [])
            lkp_rows = lkp_data.get("rows", [])

            for c_idx, c_name in enumerate(lkp_cols):
                ws_lkp.write(0, c_idx, c_name, hdr_slate_fmt)

            for r_idx, r_dict in enumerate(lkp_rows):
                for c_idx, c_name in enumerate(lkp_cols):
                    val = r_dict.get(c_name)
                    if isinstance(val, (int, float)) and not isinstance(val, bool):
                        ws_lkp.write_number(r_idx + 1, c_idx, val, cell_float_fmt if isinstance(val, float) else cell_int_fmt)
                    elif isinstance(val, bool):
                        ws_lkp.write_boolean(r_idx + 1, c_idx, val, cell_text_fmt)
                    elif val is None:
                        ws_lkp.write_blank(r_idx + 1, c_idx, "", cell_text_fmt)
                    else:
                        ws_lkp.write_string(r_idx + 1, c_idx, str(val), cell_text_fmt)

            if lkp_rows:
                ws_lkp.autofilter(0, 0, len(lkp_rows), len(lkp_cols) - 1)

            for c_idx, c_name in enumerate(lkp_cols):
                ws_lkp.set_column(c_idx, c_idx, max(len(c_name) + 4, 14))

    # =========================================================================
    # TAB 5: DATA DICTIONARY
    # =========================================================================
    if include_dictionary:
        ws_dict = workbook.add_worksheet("Data Dictionary")
        ws_dict.write(0, 0, "Dataset Schema & Data Dictionary", title_fmt)
        ws_dict.write(1, 0, f"Schema profile for {snapshot.dataset_name} ({len(columns)} columns)", subtitle_fmt)

        dict_cols = [
            ("Col #", 8),
            ("Column Name", 24),
            ("Physical Type", 16),
            ("Logical Type", 16),
            ("Nullable", 12),
            ("Null Count", 14),
            ("Null %", 12),
            ("Distinct Count", 16),
            ("Sample Values", 40),
        ]

        dict_start_row = 3
        for c_idx, (c_name, c_w) in enumerate(dict_cols):
            ws_dict.write(dict_start_row, c_idx, c_name, hdr_main_fmt)
            ws_dict.set_column(c_idx, c_idx, c_w)

        ws_dict.freeze_panes(dict_start_row + 1, 0)

        for col_idx, col_name in enumerate(columns):
            cur_r = dict_start_row + 1 + col_idx
            col_vals = [r.get(col_name) for r in rows]
            null_count = sum(1 for v in col_vals if v is None or str(v).strip() == "")
            null_pct = null_count / max(1, len(rows))
            distinct_set = {str(v) for v in col_vals if v is not None and str(v).strip() != ""}
            distinct_count = len(distinct_set)
            sample_vals = ", ".join(list(distinct_set)[:3]) if distinct_set else "-"

            phys_type = snapshot.column_types.get(col_name, "text")
            log_type = "Currency" if any(w in col_name.lower() for w in ("revenue", "price", "cost", "salary", "amount", "total", "sales")) else phys_type.capitalize()

            ws_dict.write(cur_r, 0, col_idx + 1, cell_int_fmt)
            ws_dict.write(cur_r, 1, col_name, cell_text_fmt)
            ws_dict.write(cur_r, 2, phys_type, cell_text_fmt)
            ws_dict.write(cur_r, 3, log_type, cell_text_fmt)
            ws_dict.write(cur_r, 4, "YES" if null_count > 0 else "NO", cell_text_fmt)
            ws_dict.write(cur_r, 5, null_count, cell_int_fmt)
            ws_dict.write(cur_r, 6, null_pct, cell_pct_fmt)
            ws_dict.write(cur_r, 7, distinct_count, cell_int_fmt)
            ws_dict.write(cur_r, 8, sample_vals, cell_text_fmt)

    workbook.close()

    size_bytes = os.path.getsize(filepath)
    mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return filepath, size_bytes, mime_type
