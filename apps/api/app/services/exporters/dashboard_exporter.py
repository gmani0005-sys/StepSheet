import os
import re
import json
import html
from datetime import datetime
from typing import Dict, Any, List, Optional

import xlsxwriter
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    HRFlowable,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle, Wedge


def export_dashboard_xlsx(payload: Dict[str, Any], output_path: str) -> str:
    """
    Builds a native, multi-tab Microsoft Excel (.xlsx) file using xlsxwriter:
      - Tab 1: Dashboard Summary (Executive KPIs Scorecard + Visualizations Summary Tables)
      - Tab 2: Underlying Data (Complete filtered dataset with styled headers and auto-filters)
      - Tab 3: Pipeline Lineage (Transformation steps audit trail)
    """
    title = payload.get("title") or "Executive Dashboard"
    dataset_name = payload.get("dataset_name") or payload.get("datasetName") or "Dataset"
    kpis = payload.get("kpis") or []
    visuals = payload.get("visuals") or []
    rows = payload.get("rows") or []
    columns = payload.get("columns") or []
    steps = payload.get("steps") or []
    filtered_count = payload.get("filtered_row_count") or payload.get("filteredRowCount") or len(rows)
    total_count = payload.get("total_row_count") or payload.get("totalRowCount") or len(rows)

    wb = xlsxwriter.Workbook(output_path, {"in_memory": False})

    # Typography & Styles
    font_name = "Calibri"
    title_fmt = wb.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 16,
        "font_color": "#185C37",
    })
    sub_fmt = wb.add_format({
        "font_name": font_name,
        "font_size": 10,
        "font_color": "#64748B",
        "italic": True,
    })
    sec_hdr_fmt = wb.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 12,
        "font_color": "#FFFFFF",
        "bg_color": "#217346",
        "border": 1,
        "border_color": "#185C37",
    })
    sub_hdr_fmt = wb.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 11,
        "font_color": "#FFFFFF",
        "bg_color": "#185C37",
        "border": 1,
        "border_color": "#124629",
    })
    tbl_hdr_fmt = wb.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 10,
        "font_color": "#0F172A",
        "bg_color": "#F1F5F9",
        "border": 1,
        "border_color": "#CBD5E1",
    })
    kpi_val_fmt = wb.add_format({
        "bold": True,
        "font_name": font_name,
        "font_size": 13,
        "font_color": "#217346",
        "border": 1,
        "border_color": "#E2E8F0",
    })
    cell_fmt = wb.add_format({
        "font_name": font_name,
        "font_size": 10,
        "border": 1,
        "border_color": "#E2E8F0",
    })
    cell_num_fmt = wb.add_format({
        "font_name": font_name,
        "font_size": 10,
        "border": 1,
        "border_color": "#E2E8F0",
        "num_format": "#,##0.00",
    })

    # SHEET 1: DASHBOARD SUMMARY
    ws_dash = wb.add_worksheet("Dashboard Summary")
    ws_dash.set_column(0, 0, 32)
    ws_dash.set_column(1, 1, 20)
    ws_dash.set_column(2, 2, 18)
    ws_dash.set_column(3, 3, 22)
    ws_dash.set_column(4, 4, 30)

    r = 0
    ws_dash.write(r, 0, f"StepSheet Executive BI Dashboard: {title}", title_fmt)
    r += 1
    ws_dash.write(
        r,
        0,
        f"Dataset: {dataset_name} | Filtered Records: {filtered_count} of {total_count} | Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        sub_fmt,
    )
    r += 2

    # KPI Section
    ws_dash.write(r, 0, "KEY PERFORMANCE INDICATORS (KPIs)", sec_hdr_fmt)
    for c in range(1, 5):
        ws_dash.write(r, c, "", sec_hdr_fmt)
    r += 1

    ws_dash.write_row(r, 0, ["KPI Title", "Metric Value", "Calculation", "Target Column", "Context Subtitle"], sub_hdr_fmt)
    r += 1

    for k in kpis:
        val_str = str(k.get("formattedValue") or k.get("formatted_value") or k.get("value") or "0")
        agg_str = str(k.get("aggFunc") or k.get("agg_func") or "sum").upper()
        col_str = str(k.get("column") or "")
        sub_str = str(k.get("subtitle") or "")
        ws_dash.write(r, 0, str(k.get("title") or "Metric"), cell_fmt)
        ws_dash.write(r, 1, val_str, kpi_val_fmt)
        ws_dash.write(r, 2, agg_str, cell_fmt)
        ws_dash.write(r, 3, col_str, cell_fmt)
        ws_dash.write(r, 4, sub_str, cell_fmt)
        r += 1

    r += 1

    # Visualizations Section
    ws_dash.write(r, 0, "DASHBOARD VISUALIZATIONS & METRICS SUMMARY", sec_hdr_fmt)
    for c in range(1, 5):
        ws_dash.write(r, c, "", sec_hdr_fmt)
    r += 1

    for v in visuals:
        v_title = str(v.get("title") or "Visual")
        v_type = str(v.get("type") or "bar").upper()
        v_cat = str(v.get("categoryCol") or v.get("category_col") or "")
        v_val = str(v.get("valueCol") or v.get("value_col") or "")
        v_agg = str(v.get("aggFunc") or v.get("agg_func") or "sum")
        items = v.get("items") or []

        v_start_r = r
        ws_dash.write(r, 0, f"{v_title} [{v_type}]", sub_hdr_fmt)
        ws_dash.write(r, 1, f"Dimension: {v_cat}", sub_hdr_fmt)
        ws_dash.write(r, 2, f"Measure: {v_agg}({v_val})", sub_hdr_fmt)
        ws_dash.write(r, 3, "", sub_hdr_fmt)
        r += 1

        ws_dash.write_row(r, 0, ["Category", "Metric Value", "Contribution %", "Record Count"], tbl_hdr_fmt)
        r += 1

        item_start_r = r
        for it in items:
            cat_name = str(it.get("category") or "(Blank)")
            val = it.get("value") or 0
            pct = str(it.get("percentage") or "")
            cnt = it.get("count") or 0

            ws_dash.write(r, 0, cat_name, cell_fmt)
            if isinstance(val, (int, float)):
                ws_dash.write_number(r, 1, float(val), cell_num_fmt)
            else:
                ws_dash.write(r, 1, str(val), cell_fmt)
            ws_dash.write(r, 2, pct, cell_fmt)
            ws_dash.write(r, 3, int(cnt), cell_fmt)
            r += 1

        # Insert real graphical Excel chart right next to the summary table
        if items:
            try:
                low_t = v_type.lower()
                chart_type = 'column'
                subtype = None
                if 'bar' in low_t:
                    chart_type = 'bar'
                elif 'donut' in low_t:
                    chart_type = 'doughnut'
                elif 'pie' in low_t:
                    chart_type = 'pie'
                elif 'line' in low_t or 'area' in low_t:
                    chart_type = 'line'
                elif 'stacked' in low_t:
                    chart_type = 'column'
                    subtype = 'stacked'

                chart_opts = {'type': chart_type}
                if subtype:
                    chart_opts['subtype'] = subtype
                chart = wb.add_chart(chart_opts)

                chart.add_series({
                    'name': v_title,
                    'categories': ['Dashboard Summary', item_start_r, 0, r - 1, 0],
                    'values': ['Dashboard Summary', item_start_r, 1, r - 1, 1],
                })
                chart.set_title({'name': f"{v_title} ({v_type})"})
                chart.set_size({'width': 440, 'height': max(200, min(300, 20 * len(items) + 80))})
                if chart_type in ('pie', 'doughnut'):
                    chart.set_legend({'position': 'right'})
                else:
                    chart.set_legend({'position': 'none'})

                ws_dash.insert_chart(f'F{v_start_r + 1}', chart)
            except Exception:
                pass

        r = max(r, v_start_r + 18) + 2

    # SHEET 2: UNDERLYING DATA
    ws_data = wb.add_worksheet("Underlying Data")
    if columns:
        for c_idx, col_name in enumerate(columns):
            ws_data.set_column(c_idx, c_idx, max(12, len(str(col_name)) + 4))
        ws_data.write_row(0, 0, columns, sub_hdr_fmt)
        for r_idx, row in enumerate(rows[:50000]):
            for c_idx, col_name in enumerate(columns):
                v = row.get(col_name)
                if isinstance(v, (int, float)) and v is not None:
                    ws_data.write_number(r_idx + 1, c_idx, float(v), cell_fmt)
                else:
                    ws_data.write(r_idx + 1, c_idx, "" if v is None else str(v), cell_fmt)
        ws_data.autofilter(0, 0, max(1, len(rows)), len(columns) - 1)

    # SHEET 3: PIPELINE LINEAGE
    ws_steps = wb.add_worksheet("Pipeline Lineage")
    ws_steps.set_column(0, 0, 10)
    ws_steps.set_column(1, 1, 20)
    ws_steps.set_column(2, 2, 40)
    ws_steps.write_row(0, 0, ["Step #", "Transformation Type", "Step Label / Description"], sub_hdr_fmt)
    if steps:
        for idx, s in enumerate(steps):
            ws_steps.write(idx + 1, 0, idx + 1, cell_fmt)
            ws_steps.write(idx + 1, 1, str(s.get("type") or ""), cell_fmt)
            ws_steps.write(idx + 1, 2, str(s.get("label") or s.get("id") or ""), cell_fmt)

    wb.close()
    return output_path


def export_dashboard_pptx(payload: Dict[str, Any], output_path: str) -> str:
    """
    Builds a native 16:9 widescreen PowerPoint presentation (.pptx) using python-pptx:
      - Slide 1: Cover Slide
      - Slide 2: Executive KPI Scorecard
      - Slides 3..N: Dedicated visual chart slides with metrics, table & share
      - Slide N+1: Data Lineage & Pipeline Steps
    """
    title = payload.get("title") or "Executive Dashboard"
    dataset_name = payload.get("dataset_name") or payload.get("datasetName") or "Dataset"
    kpis = payload.get("kpis") or []
    visuals = payload.get("visuals") or []
    rows = payload.get("rows") or []
    steps = payload.get("steps") or []
    filtered_count = payload.get("filtered_row_count") or payload.get("filteredRowCount") or len(rows)

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Colors
    c_primary = RGBColor(24, 92, 55)     # #185C37
    c_accent = RGBColor(33, 115, 70)     # #217346
    c_dark = RGBColor(15, 23, 42)        # #0F172A
    c_slate = RGBColor(100, 116, 139)    # #64748B
    c_white = RGBColor(255, 255, 255)
    c_card_bg = RGBColor(241, 245, 249)  # #F1F5F9

    def add_slide_header(slide, heading: str, sub: str = ""):
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(0.4), Inches(11.733), Inches(0.06))
        bar.fill.solid()
        bar.fill.fore_color.rgb = c_primary
        bar.line.color.rgb = c_primary

        tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.55), Inches(11.733), Inches(0.8))
        tf = tb.text_frame
        tf.word_wrap = True
        p1 = tf.paragraphs[0]
        p1.text = heading
        p1.font.size = Pt(22)
        p1.font.bold = True
        p1.font.color.rgb = c_primary

        if sub:
            p2 = tf.add_paragraph()
            p2.text = sub
            p2.font.size = Pt(11)
            p2.font.color.rgb = c_slate

    # SLIDE 1: COVER
    s1 = prs.slides.add_slide(blank_layout)
    bg = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
    bg.fill.solid()
    bg.fill.fore_color.rgb = RGBColor(15, 23, 42)
    bg.line.fill.background()

    tb1 = s1.shapes.add_textbox(Inches(1.2), Inches(2.2), Inches(11.0), Inches(3.0))
    tf1 = tb1.text_frame
    tf1.word_wrap = True
    p_title = tf1.paragraphs[0]
    p_title.text = title
    p_title.font.size = Pt(40)
    p_title.font.bold = True
    p_title.font.color.rgb = RGBColor(52, 211, 153)  # Emerald light

    p_sub = tf1.add_paragraph()
    p_sub.text = "Executive Business Intelligence Presentation • StepSheet"
    p_sub.font.size = Pt(18)
    p_sub.font.color.rgb = RGBColor(148, 163, 184)
    p_sub.space_before = Pt(14)

    p_meta = tf1.add_paragraph()
    p_meta.text = f"Dataset: {dataset_name}  •  Active Records: {filtered_count}  •  Generated: {datetime.now().strftime('%B %d, %Y')}"
    p_meta.font.size = Pt(12)
    p_meta.font.color.rgb = RGBColor(203, 213, 225)
    p_meta.space_before = Pt(28)

    # SLIDE 2: KPI SCORECARD
    s2 = prs.slides.add_slide(blank_layout)
    add_slide_header(s2, "Executive Key Performance Indicators (KPIs)", "Core operational performance indicators and headline metrics")

    if kpis:
        kpi_count = len(kpis)
        cols_n = min(4, kpi_count)
        card_w = Inches(2.65)
        card_h = Inches(2.2)
        start_x = Inches(0.8)
        start_y = Inches(1.8)
        gap_x = Inches(0.3)
        gap_y = Inches(0.35)

        for idx, k in enumerate(kpis[:8]):
            col_i = idx % cols_n
            row_i = idx // cols_n
            cx = start_x + col_i * (card_w + gap_x)
            cy = start_y + row_i * (card_h + gap_y)

            sh = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, cx, cy, card_w, card_h)
            sh.fill.solid()
            sh.fill.fore_color.rgb = c_card_bg
            sh.line.color.rgb = RGBColor(203, 213, 225)

            # Left accent stripe
            stripe = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, cx, cy, Inches(0.08), card_h)
            stripe.fill.solid()
            stripe.fill.fore_color.rgb = c_accent
            stripe.line.fill.background()

            tb_card = s2.shapes.add_textbox(cx + Inches(0.15), cy + Inches(0.12), card_w - Inches(0.25), card_h - Inches(0.24))
            tf_c = tb_card.text_frame
            tf_c.word_wrap = True

            p_kt = tf_c.paragraphs[0]
            p_kt.text = str(k.get("title") or "Metric").upper()
            p_kt.font.size = Pt(10)
            p_kt.font.bold = True
            p_kt.font.color.rgb = c_slate

            p_kv = tf_c.add_paragraph()
            p_kv.text = str(k.get("formattedValue") or k.get("formatted_value") or k.get("value") or "0")
            p_kv.font.size = Pt(26)
            p_kv.font.bold = True
            p_kv.font.color.rgb = c_primary
            p_kv.space_before = Pt(8)

            p_ks = tf_c.add_paragraph()
            agg = str(k.get("aggFunc") or k.get("agg_func") or "sum").upper()
            col = str(k.get("column") or "")
            sub = str(k.get("subtitle") or "")
            p_ks.text = f"{agg} of {col}\n{sub}"
            p_ks.font.size = Pt(9)
            p_ks.font.color.rgb = c_slate
            p_ks.space_before = Pt(6)

    # SLIDES 3..N: VISUAL CHARTS
    for v_idx, v in enumerate(visuals):
        sv = prs.slides.add_slide(blank_layout)
        v_title = str(v.get("title") or "Chart")
        v_type = str(v.get("type") or "bar").upper()
        v_cat = str(v.get("categoryCol") or v.get("category_col") or "")
        v_val = str(v.get("valueCol") or v.get("value_col") or "")
        v_agg = str(v.get("aggFunc") or v.get("agg_func") or "sum")
        items = v.get("items") or []

        add_slide_header(sv, f"Chart: {v_title}", f"Visual Type: {v_type}  •  Dimension: {v_cat}  •  Measure: {v_agg}({v_val})")

        # Table with category metrics on left side
        table_rows = min(11, len(items) + 1)
        table_cols = 4
        tbl_shape = sv.shapes.add_table(table_rows, table_cols, Inches(0.8), Inches(1.8), Inches(5.6), Inches(4.8))
        tbl = tbl_shape.table

        headers = ["Category", "Metric", "Share %", "Count"]
        col_widths = [Inches(2.2), Inches(1.3), Inches(1.1), Inches(1.0)]
        for ci, w in enumerate(col_widths):
            tbl.columns[ci].width = w

        for ci, h_text in enumerate(headers):
            cell = tbl.cell(0, ci)
            cell.text = h_text
            cell.fill.solid()
            cell.fill.fore_color.rgb = c_primary
            for p in cell.text_frame.paragraphs:
                p.font.size = Pt(11)
                p.font.bold = True
                p.font.color.rgb = c_white

        for ri, it in enumerate(items[:10]):
            cat_name = str(it.get("category") or "(Blank)")
            val = it.get("value") or 0
            val_str = f"{val:,.2f}" if isinstance(val, (int, float)) else str(val)
            pct_str = str(it.get("percentage") or "")
            cnt_str = str(it.get("count") or "")

            row_cells = [cat_name, val_str, pct_str, cnt_str]
            for ci, val_txt in enumerate(row_cells):
                cell = tbl.cell(ri + 1, ci)
                cell.text = val_txt
                cell.fill.solid()
                cell.fill.fore_color.rgb = c_card_bg if ri % 2 == 0 else c_white
                for p in cell.text_frame.paragraphs:
                    p.font.size = Pt(10)
                    p.font.color.rgb = c_dark
                    if ci == 0:
                        p.font.bold = True

        # Insert real graphical PowerPoint chart on the right side
        if items:
            try:
                from pptx.chart.data import CategoryChartData
                from pptx.enum.chart import XL_CHART_TYPE

                cdata = CategoryChartData()
                cdata.categories = [str(it.get("category") or "(Blank)")[:16] for it in items[:10]]
                cdata.add_series(v_title[:24], [float(it.get("value") or 0) for it in items[:10]])

                low_t = v_type.lower()
                pptx_chart_type = XL_CHART_TYPE.COLUMN_CLUSTERED
                if 'bar' in low_t:
                    pptx_chart_type = XL_CHART_TYPE.BAR_CLUSTERED
                elif 'donut' in low_t:
                    pptx_chart_type = XL_CHART_TYPE.DOUGHNUT
                elif 'pie' in low_t:
                    pptx_chart_type = XL_CHART_TYPE.PIE
                elif 'line' in low_t or 'area' in low_t:
                    pptx_chart_type = XL_CHART_TYPE.LINE
                elif 'stacked' in low_t:
                    pptx_chart_type = XL_CHART_TYPE.COLUMN_STACKED

                sv.shapes.add_chart(
                    pptx_chart_type,
                    Inches(6.8), Inches(1.8), Inches(5.7), Inches(4.8),
                    cdata
                )
            except Exception:
                pass

    # FINAL SLIDE: LINEAGE
    if steps:
        s_steps = prs.slides.add_slide(blank_layout)
        add_slide_header(s_steps, "Data Pipeline Transformations & Lineage", "Applied steps and audit trail")
        t_rows = min(12, len(steps) + 1)
        t_shape = s_steps.shapes.add_table(t_rows, 3, Inches(0.8), Inches(1.8), Inches(11.733), Inches(4.5))
        s_tbl = t_shape.table
        s_tbl.columns[0].width = Inches(1.5)
        s_tbl.columns[1].width = Inches(3.5)
        s_tbl.columns[2].width = Inches(6.733)

        s_headers = ["Step #", "Transformation", "Label / Definition"]
        for ci, h in enumerate(s_headers):
            cell = s_tbl.cell(0, ci)
            cell.text = h
            cell.fill.solid()
            cell.fill.fore_color.rgb = c_primary
            for p in cell.text_frame.paragraphs:
                p.font.size = Pt(11)
                p.font.bold = True
                p.font.color.rgb = c_white

        for ri, st in enumerate(steps[:11]):
            c0 = s_tbl.cell(ri + 1, 0)
            c0.text = str(ri + 1)
            c1 = s_tbl.cell(ri + 1, 1)
            c1.text = str(st.get("type") or "").upper()
            c2 = s_tbl.cell(ri + 1, 2)
            c2.text = str(st.get("label") or st.get("id") or "")
            for cell in (c0, c1, c2):
                cell.fill.solid()
                cell.fill.fore_color.rgb = c_card_bg if ri % 2 == 0 else c_white
                for p in cell.text_frame.paragraphs:
                    p.font.size = Pt(10)
                    p.font.color.rgb = c_dark

    prs.save(output_path)
    return output_path


REPORTLAB_PALETTE = [
    colors.HexColor('#217346'),
    colors.HexColor('#0EA5E9'),
    colors.HexColor('#D97706'),
    colors.HexColor('#7C3AED'),
    colors.HexColor('#EC4899'),
    colors.HexColor('#059669'),
    colors.HexColor('#3B82F6'),
    colors.HexColor('#F97316'),
    colors.HexColor('#14B8A6'),
    colors.HexColor('#6366F1'),
]


def render_pdf_chart_drawing(v_title: str, v_type: str, items: List[Dict[str, Any]], width: float = 530, height: float = 175) -> Drawing:
    """
    Renders an authentic vector chart (Column, Bar, Donut, Line, Area, Histogram)
    directly into a ReportLab Drawing flowable for inclusion in executive PDF reports.
    """
    d = Drawing(width, height)
    # Background card
    d.add(Rect(0, 0, width, height, fillColor=colors.HexColor('#FFFFFF'), strokeColor=colors.HexColor('#E2E8F0'), strokeWidth=1, rx=6, ry=6))
    # Header bar
    d.add(Rect(0, height - 24, width, 24, fillColor=colors.HexColor('#F8FAFC'), strokeColor=colors.HexColor('#E2E8F0'), strokeWidth=0.5, rx=6, ry=6))
    d.add(String(12, height - 16, f"{v_title}  [{v_type.upper()}]", fontName='Helvetica-Bold', fontSize=9, fillColor=colors.HexColor('#185C37')))

    if not items:
        d.add(String(width / 2, height / 2 - 10, "No data points available for this visualization", textAnchor='middle', fontName='Helvetica', fontSize=9, fillColor=colors.HexColor('#94A3B8')))
        return d

    v_low = str(v_type).lower()
    values = [abs(float(it.get('value') or 0)) for it in items]
    max_val = max(values) if values and max(values) > 0 else 1.0

    if 'donut' in v_low or 'pie' in v_low:
        cx, cy, r = 110, 72, 54
        total_sum = sum([max(0, float(it.get('value') or 0)) for it in items]) or 1.0
        cur_ang = 90
        for idx, it in enumerate(items[:8]):
            val = max(0, float(it.get('value') or 0))
            span = (val / total_sum) * 360
            col = REPORTLAB_PALETTE[idx % len(REPORTLAB_PALETTE)]
            if span > 0.5:
                d.add(Wedge(cx, cy, r, cur_ang, cur_ang + span, fillColor=col, strokeColor=colors.white, strokeWidth=1.5))
            cur_ang += span
        if 'donut' in v_low:
            d.add(Circle(cx, cy, 28, fillColor=colors.white, strokeColor=colors.HexColor('#E2E8F0'), strokeWidth=1))
            d.add(String(cx, cy - 4, f"{len(items)} Items", textAnchor='middle', fontName='Helvetica-Bold', fontSize=8, fillColor=colors.HexColor('#185C37')))

        # Legend on right side
        for idx, it in enumerate(items[:8]):
            col = REPORTLAB_PALETTE[idx % len(REPORTLAB_PALETTE)]
            cat = str(it.get('category') or '(Blank)')[:18]
            val = float(it.get('value') or 0)
            pct = str(it.get('percentage') or f"{(val / total_sum * 100):.1f}%")
            lx = 220 if idx < 4 else 370
            ly = height - 52 - (idx % 4) * 26
            d.add(Rect(lx, ly, 10, 10, fillColor=col, strokeColor=None, rx=2, ry=2))
            d.add(String(lx + 15, ly + 2, cat, fontName='Helvetica-Bold', fontSize=8, fillColor=colors.HexColor('#334155')))
            d.add(String(lx + 15, ly - 8, f"{val:,.1f} ({pct})", fontName='Helvetica', fontSize=7.5, fillColor=colors.HexColor('#64748B')))

    elif 'bar' in v_low:
        avail_items = items[:6]
        n = len(avail_items)
        plot_h = height - 40
        row_h = plot_h / max(1, n)
        for idx, it in enumerate(avail_items):
            col = REPORTLAB_PALETTE[idx % len(REPORTLAB_PALETTE)]
            val = float(it.get('value') or 0)
            pct = str(it.get('percentage') or '')
            cat = str(it.get('category') or '(Blank)')[:16]
            y = height - 32 - (idx + 1) * row_h + (row_h - 13) / 2
            d.add(String(12, y + 3, cat, fontName='Helvetica', fontSize=7.5, fillColor=colors.HexColor('#334155')))
            bar_w = max(4, (abs(val) / max_val) * 280)
            d.add(Rect(110, y, bar_w, 13, fillColor=col, strokeColor=None, rx=3, ry=3))
            val_txt = f"{val:,.1f} ({pct})" if pct else f"{val:,.1f}"
            d.add(String(110 + bar_w + 6, y + 3, val_txt, fontName='Helvetica-Bold', fontSize=7.5, fillColor=colors.HexColor('#0F172A')))

    else:
        # Column / Histogram / Clustered / Stacked / Line / Area
        avail_items = items[:9]
        plot_x = 42
        plot_y = 22
        plot_w = width - 58
        plot_h = height - 58
        for gi in range(4):
            gy = plot_y + gi * (plot_h / 3)
            d.add(Line(plot_x, gy, plot_x + plot_w, gy, strokeColor=colors.HexColor('#F1F5F9'), strokeWidth=0.75))
            gval = max_val * (gi / 3)
            d.add(String(plot_x - 4, gy - 2.5, f"{gval:,.0f}", textAnchor='end', fontName='Helvetica', fontSize=6.5, fillColor=colors.HexColor('#94A3B8')))

        slot_w = plot_w / len(avail_items)
        bar_w = min(34, slot_w * 0.65)
        for idx, it in enumerate(avail_items):
            col = REPORTLAB_PALETTE[idx % len(REPORTLAB_PALETTE)]
            val = float(it.get('value') or 0)
            cat = str(it.get('category') or '(Blank)')[:11]
            bx = plot_x + idx * slot_w + (slot_w - bar_w) / 2
            bh = max(3, (abs(val) / max_val) * (plot_h - 10))
            d.add(Rect(bx, plot_y, bar_w, bh, fillColor=col, strokeColor=None, rx=2, ry=2))
            d.add(String(bx + bar_w / 2, plot_y + bh + 3, f"{val:,.1f}" if val < 100 else f"{val:,.0f}", textAnchor='middle', fontName='Helvetica-Bold', fontSize=7, fillColor=colors.HexColor('#0F172A')))
            d.add(String(bx + bar_w / 2, plot_y - 10, cat, textAnchor='middle', fontName='Helvetica', fontSize=7, fillColor=colors.HexColor('#475569')))

    return d


def export_dashboard_pdf(payload: Dict[str, Any], output_path: str) -> str:
    """
    Builds a vector, multi-page PDF document using reportlab:
      - Header & title block
      - Executive KPI scorecard cards
      - Authentic vector charts (Column, Bar, Donut, Pie, Line, Histogram)
      - Summary tables with styled headers
      - Lineage and audit information
    """
    title = payload.get("title") or "Executive Dashboard"
    dataset_name = payload.get("dataset_name") or payload.get("datasetName") or "Dataset"
    kpis = payload.get("kpis") or []
    visuals = payload.get("visuals") or []
    rows = payload.get("rows") or []
    steps = payload.get("steps") or []
    filtered_count = payload.get("filtered_row_count") or payload.get("filteredRowCount") or len(rows)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#185C37"),
        spaceAfter=4,
    )
    sub_style = ParagraphStyle(
        "DocSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=14,
    )
    sec_style = ParagraphStyle(
        "SecHeader",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#185C37"),
        spaceBefore=14,
        spaceAfter=8,
    )
    cell_bold = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#0F172A"),
    )
    cell_norm = ParagraphStyle(
        "CellNorm",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#334155"),
    )

    story = []

    # Title & Subtitle
    story.append(Paragraph(f"StepSheet Executive BI Dashboard: {title}", title_style))
    story.append(
        Paragraph(
            f"Dataset: <b>{dataset_name}</b> &bull; Active Records: <b>{filtered_count}</b> &bull; Date: {datetime.now().strftime('%B %d, %Y')}",
            sub_style,
        )
    )
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#185C37"), spaceAfter=14))

    # SECTION 1: KPIS
    story.append(Paragraph("EXECUTIVE KEY PERFORMANCE INDICATORS (KPIs)", sec_style))
    if kpis:
        kpi_table_data = [["KPI Title", "Metric Value", "Calculation", "Target Column", "Context Subtitle"]]
        for k in kpis:
            kpi_table_data.append([
                Paragraph(str(k.get("title") or "Metric"), cell_bold),
                Paragraph(f"<b><font color='#185C37' size='11'>{str(k.get('formattedValue') or k.get('formatted_value') or k.get('value') or '0')}</font></b>", cell_bold),
                Paragraph(str(k.get("aggFunc") or k.get("agg_func") or "sum").upper(), cell_norm),
                Paragraph(str(k.get("column") or ""), cell_norm),
                Paragraph(str(k.get("subtitle") or ""), cell_norm),
            ])

        t_kpi = Table(kpi_table_data, colWidths=[135, 90, 80, 100, 135])
        t_kpi.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#185C37")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("TOPPADDING", (0, 0), (-1, 0), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(t_kpi)
    else:
        story.append(Paragraph("No KPI cards configured.", sub_style))

    story.append(Spacer(1, 14))

    # SECTION 2: VISUALIZATIONS & GRAPHICAL CHARTS
    story.append(Paragraph("DASHBOARD VISUALIZATIONS & GRAPHICAL CHARTS", sec_style))
    for v in visuals:
        v_title = str(v.get("title") or "Visual")
        v_type = str(v.get("type") or "bar").upper()
        v_cat = str(v.get("categoryCol") or v.get("category_col") or "")
        v_val = str(v.get("valueCol") or v.get("value_col") or "")
        v_agg = str(v.get("aggFunc") or v.get("agg_func") or "sum")
        items = v.get("items") or []

        story.append(Paragraph(f"<b>{v_title}</b> [{v_type}] &bull; <i>{v_cat} by {v_agg}({v_val})</i>", cell_bold))
        story.append(Spacer(1, 4))

        # Real vector graphical chart
        chart_drawing = render_pdf_chart_drawing(v_title, v_type, items, width=540, height=170)
        story.append(chart_drawing)
        story.append(Spacer(1, 6))

        # Compact breakdown table
        v_table_data = [["Category Dimension", "Metric Value", "Contribution %", "Record Count"]]
        for it in items[:12]:
            v_table_data.append([
                Paragraph(str(it.get("category") or "(Blank)"), cell_norm),
                Paragraph(str(it.get("value") or 0), cell_bold),
                Paragraph(str(it.get("percentage") or ""), cell_norm),
                Paragraph(str(it.get("count") or 0), cell_norm),
            ])

        t_v = Table(v_table_data, colWidths=[240, 100, 100, 100])
        t_v.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#217346")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8.5),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
            ("TOPPADDING", (0, 0), (-1, 0), 4),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(t_v)
        story.append(Spacer(1, 14))

    doc.build(story)
    return output_path


def generate_sswb_html(payload: Dict[str, Any]) -> str:
    title = payload.get("title") or "Executive Dashboard"
    dataset_name = payload.get("dataset_name") or payload.get("datasetName") or "Dataset"
    kpis = payload.get("kpis") or []
    visuals = payload.get("visuals") or []
    rows = payload.get("rows") or []
    columns = payload.get("columns") or (list(rows[0].keys()) if rows else [])
    steps = payload.get("steps") or []
    filtered_count = payload.get("filtered_row_count") or payload.get("filteredRowCount") or len(rows)
    total_count = payload.get("total_row_count") or payload.get("totalRowCount") or len(rows)

    safe_data_json = json.dumps({
        "title": title,
        "datasetName": dataset_name,
        "kpis": kpis,
        "visuals": visuals,
        "rows": rows[:10000],
        "columns": columns,
        "steps": steps,
        "filteredRowCount": filtered_count,
        "totalRowCount": total_count,
        "exportedAt": datetime.now().isoformat(),
    }, ensure_ascii=False)

    e_title = html.escape(title)
    e_dataset = html.escape(dataset_name)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{e_title} — StepSheet Packaged Workbook</title>
  <style>
    :root {{
      --primary: #185C37;
      --primary-dark: #124629;
      --primary-light: #E6F2EB;
      --accent: #217346;
      --bg: #F4F6F8;
      --card-bg: #FFFFFF;
      --text-main: #1E293B;
      --text-muted: #64748B;
      --border: #E2E8F0;
      --border-dark: #CBD5E1;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Aptos, Calibri, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }}
    .topbar {{
      background: var(--primary);
      color: white;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      position: sticky;
      top: 0;
      z-index: 100;
    }}
    .brand-section {{
      display: flex;
      align-items: center;
      gap: 12px;
    }}
    .brand-icon {{
      width: 32px;
      height: 32px;
      background: rgba(255,255,255,0.2);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 16px;
      border: 1px solid rgba(255,255,255,0.3);
    }}
    .brand-title {{
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }}
    .brand-badge {{
      background: #10B981;
      color: #064E3B;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    .topbar-meta {{
      font-size: 12px;
      opacity: 0.9;
    }}
    .topbar-actions {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .btn {{
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      text-decoration: none;
    }}
    .btn-light {{
      background: white;
      color: var(--primary);
      border-color: rgba(255,255,255,0.8);
    }}
    .btn-light:hover {{
      background: #F1F5F9;
    }}
    .btn-outline {{
      background: rgba(255,255,255,0.12);
      color: white;
      border-color: rgba(255,255,255,0.25);
    }}
    .btn-outline:hover {{
      background: rgba(255,255,255,0.2);
    }}

    .nav-tabs {{
      background: white;
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      display: flex;
      gap: 8px;
    }}
    .nav-tab {{
      padding: 12px 18px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
    }}
    .nav-tab:hover {{
      color: var(--text-main);
    }}
    .nav-tab.active {{
      color: var(--primary);
      border-bottom-color: var(--primary);
    }}

    .container {{
      max-width: 1480px;
      width: 100%;
      margin: 0 auto;
      padding: 20px 24px 48px;
      flex: 1;
    }}

    .slicer-card {{
      background: white;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }}
    .slicer-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }}
    .slicer-title {{
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-muted);
    }}
    .slicer-clear {{
      font-size: 11px;
      font-weight: 700;
      color: var(--primary);
      background: none;
      border: none;
      cursor: pointer;
    }}
    .slicer-clear:hover {{
      text-decoration: underline;
    }}
    .slicer-chips {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-height: 90px;
      overflow-y: auto;
    }}
    .chip {{
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      background: #F1F5F9;
      color: #334155;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }}
    .chip:hover {{
      background: #E2E8F0;
    }}
    .chip.selected {{
      background: var(--primary);
      color: white;
      border-color: var(--primary-dark);
    }}
    .chip-count {{
      font-size: 9px;
      opacity: 0.75;
    }}

    .kpi-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }}
    .kpi-card {{
      background: white;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
      position: relative;
      overflow: hidden;
      border-left: 5px solid var(--accent);
    }}
    .kpi-title {{
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.5px;
    }}
    .kpi-value {{
      font-size: 28px;
      font-weight: 800;
      color: var(--text-main);
      margin: 8px 0 4px;
      font-family: monospace;
    }}
    .kpi-sub {{
      font-size: 11px;
      color: var(--text-muted);
    }}

    .visuals-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 20px;
    }}
    .visual-card {{
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
    }}
    .visual-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid #F1F5F9;
    }}
    .visual-title {{
      font-size: 14px;
      font-weight: 700;
      color: #0F172A;
    }}
    .visual-badge {{
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      background: var(--primary-light);
      color: var(--primary);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid rgba(24,92,55,0.2);
    }}
    .chart-container {{
      flex: 1;
      min-height: 240px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }}

    svg.chart-svg {{
      width: 100%;
      height: 240px;
      overflow: visible;
    }}
    .bar-rect {{
      fill: var(--accent);
      transition: fill 0.2s;
    }}
    .bar-rect:hover {{
      fill: var(--primary-dark);
    }}
    .axis-text {{
      font-size: 10px;
      fill: #64748B;
    }}
    .val-text {{
      font-size: 10px;
      font-weight: bold;
      fill: #1E293B;
    }}

    .table-card {{
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    }}
    .table-toolbar {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }}
    .search-input {{
      padding: 8px 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 13px;
      min-width: 280px;
      outline: none;
    }}
    .search-input:focus {{
      border-color: var(--primary);
    }}
    .table-responsive {{
      overflow-x: auto;
      max-height: 600px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }}
    table.data-table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: left;
    }}
    table.data-table th {{
      background: #F8FAFC;
      color: #334155;
      padding: 10px 14px;
      font-weight: 700;
      border-bottom: 2px solid var(--border);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      position: sticky;
      top: 0;
      z-index: 10;
    }}
    table.data-table th:hover {{
      background: #F1F5F9;
    }}
    table.data-table td {{
      padding: 8px 14px;
      border-bottom: 1px solid #F1F5F9;
      white-space: nowrap;
    }}
    table.data-table tr:hover td {{
      background: #F8FAFC;
    }}
    .pagination {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 14px;
      font-size: 12px;
      color: var(--text-muted);
    }}

    .lineage-list {{
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}
    .lineage-item {{
      background: white;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 14px;
    }}
    .lineage-idx {{
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--primary-light);
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 12px;
    }}

    #chart-tooltip {{
      position: fixed;
      display: none;
      background: rgba(15, 23, 42, 0.95);
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }}

    @media print {{
      .topbar-actions, .nav-tabs, .slicer-card, .btn {{ display: none !important; }}
      body {{ background: white !important; }}
      .visual-card {{ break-inside: avoid; border: 1px solid #CCC !important; box-shadow: none !important; }}
    }}
  </style>
</head>
<body>
  <!-- Embedded StepSheet Workbook Data Island -->
  <script id="stepsheet-packaged-data" type="application/json">
{safe_data_json}
  </script>

  <!-- Top Navigation Header -->
  <div class="topbar">
    <div class="brand-section">
      <div class="brand-icon">S</div>
      <div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="brand-title">{e_title}</span>
          <span class="brand-badge">.SSWB Universal Workbook</span>
        </div>
        <div class="topbar-meta">Dataset: <strong>{e_dataset}</strong> &bull; <span id="hdr-row-count">{filtered_count}</span> rows packaged &bull; Generated: {datetime.now().strftime('%B %d, %Y')}</div>
      </div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-outline" id="btn-fullscreen" onclick="toggleFullScreen()">⛶ Full Screen</button>
      <button class="btn btn-outline" onclick="window.print()">🖨️ Print / PDF</button>
      <button class="btn btn-light" onclick="exportDataCsv()">📥 Export CSV</button>
      <button class="btn btn-light" onclick="exportRawSswb()">💾 Save .sswb</button>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="nav-tabs">
    <div class="nav-tab active" id="tab-btn-dash" onclick="switchTab('dash')">📊 Visual Dashboard</div>
    <div class="nav-tab" id="tab-btn-data" onclick="switchTab('data')">📋 Packaged Data Table</div>
    <div class="nav-tab" id="tab-btn-lineage" onclick="switchTab('lineage')">⚡ Pipeline Lineage ({len(steps)})</div>
  </div>

  <!-- Main Container -->
  <div class="container">
    <!-- VIEW 1: DASHBOARD -->
    <div id="view-dash">
      <!-- Slicer Bar -->
      <div class="slicer-card" id="slicer-container">
        <div class="slicer-header">
          <div class="slicer-title">Interactive Dimension Slicers (Click to Filter Dashboard)</div>
          <button class="slicer-clear" id="slicer-clear-btn" onclick="clearFilters()" style="display:none;">Clear All Filters</button>
        </div>
        <div class="slicer-chips" id="slicer-chips-area"></div>
      </div>

      <!-- KPI Scorecards -->
      <div class="kpi-grid" id="kpi-cards-grid"></div>

      <!-- Visual Charts Grid -->
      <div class="visuals-grid" id="visuals-grid"></div>
    </div>

    <!-- VIEW 2: DATA TABLE -->
    <div id="view-data" style="display:none;">
      <div class="table-card">
        <div class="table-toolbar">
          <input type="text" class="search-input" id="table-search" placeholder="Search across all columns..." oninput="handleTableSearch(this.value)" />
          <div style="font-size:12px; color:var(--text-muted);" id="table-record-info">Loading...</div>
        </div>
        <div class="table-responsive">
          <table class="data-table" id="raw-data-table">
            <thead>
              <tr id="table-header-row"></tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <button class="btn btn-light" onclick="changePage(-1)">&larr; Previous</button>
          <span id="page-indicator">Page 1 of 1</span>
          <button class="btn btn-light" onclick="changePage(1)">Next &rarr;</button>
        </div>
      </div>
    </div>

    <!-- VIEW 3: LINEAGE -->
    <div id="view-lineage" style="display:none;">
      <div class="table-card">
        <h3 style="margin-bottom:14px; font-size:16px;">Pipeline Lineage &amp; Applied Transformations</h3>
        <div class="lineage-list" id="lineage-list-container"></div>
      </div>
    </div>
  </div>

  <div id="chart-tooltip"></div>

  <!-- Client-side Interactive Engine -->
  <script>
    const PACKAGE = JSON.parse(document.getElementById('stepsheet-packaged-data').textContent);
    let allRows = PACKAGE.rows || [];
    let activeFilters = new Map();
    let activeTab = 'dash';

    let searchQ = '';
    let sortCol = null;
    let sortAsc = true;
    let currentPage = 1;
    const pageSize = 50;

    const PALETTE = ['#217346', '#2563EB', '#D97706', '#9333EA', '#059669', '#DC2626', '#0284C7', '#7C3AED'];

    function init() {{
      buildSlicers();
      renderDashboard();
      renderLineage();
      renderTable();
    }}

    function switchTab(tab) {{
      activeTab = tab;
      document.getElementById('view-dash').style.display = tab === 'dash' ? 'block' : 'none';
      document.getElementById('view-data').style.display = tab === 'data' ? 'block' : 'none';
      document.getElementById('view-lineage').style.display = tab === 'lineage' ? 'block' : 'none';

      document.getElementById('tab-btn-dash').className = 'nav-tab' + (tab === 'dash' ? ' active' : '');
      document.getElementById('tab-btn-data').className = 'nav-tab' + (tab === 'data' ? ' active' : '');
      document.getElementById('tab-btn-lineage').className = 'nav-tab' + (tab === 'lineage' ? ' active' : '');
    }}

    function getFilteredRows() {{
      if (activeFilters.size === 0) return allRows;
      return allRows.filter(r => {{
        for (const [col, valSet] of activeFilters.entries()) {{
          const rowVal = String(r[col] ?? '(Blank)');
          if (!valSet.has(rowVal)) return false;
        }}
        return true;
      }});
    }}

    function buildSlicers() {{
      const container = document.getElementById('slicer-chips-area');
      container.innerHTML = '';

      const catCols = new Set();
      (PACKAGE.visuals || []).forEach(v => {{
        if (v.categoryCol && v.type !== 'histogram') catCols.add(v.categoryCol);
      }});

      if (catCols.size === 0 && PACKAGE.columns) {{
        PACKAGE.columns.slice(0, 3).forEach(c => catCols.add(c));
      }}

      catCols.forEach(col => {{
        const valCounts = new Map();
        allRows.forEach(r => {{
          const v = String(r[col] ?? '(Blank)');
          valCounts.set(v, (valCounts.get(v) || 0) + 1);
        }});

        const sorted = Array.from(valCounts.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10);
        sorted.forEach(([val, cnt]) => {{
          const chip = document.createElement('button');
          chip.className = 'chip';
          chip.innerHTML = `<strong>${{escapeHtml(col)}}:</strong> ${{escapeHtml(val)}} <span class="chip-count">(${{cnt}})</span>`;
          chip.onclick = () => toggleFilter(col, val);
          chip.dataset.col = col;
          chip.dataset.val = val;
          container.appendChild(chip);
        }});
      }});
    }}

    function toggleFilter(col, val) {{
      if (!activeFilters.has(col)) {{
        activeFilters.set(col, new Set());
      }}
      const s = activeFilters.get(col);
      if (s.has(val)) {{
        s.delete(val);
        if (s.size === 0) activeFilters.delete(col);
      }} else {{
        s.add(val);
      }}

      document.querySelectorAll('.chip').forEach(c => {{
        const cCol = c.dataset.col;
        const cVal = c.dataset.val;
        const isSel = activeFilters.has(cCol) && activeFilters.get(cCol).has(cVal);
        c.className = 'chip' + (isSel ? ' selected' : '');
      }});

      document.getElementById('slicer-clear-btn').style.display = activeFilters.size > 0 ? 'inline' : 'none';
      renderDashboard();
      renderTable();
    }}

    function clearFilters() {{
      activeFilters.clear();
      document.querySelectorAll('.chip').forEach(c => c.className = 'chip');
      document.getElementById('slicer-clear-btn').style.display = 'none';
      renderDashboard();
      renderTable();
    }}

    function renderDashboard() {{
      const filtered = getFilteredRows();
      document.getElementById('hdr-row-count').textContent = filtered.length.toLocaleString();

      const kpiContainer = document.getElementById('kpi-cards-grid');
      kpiContainer.innerHTML = '';
      (PACKAGE.kpis || []).forEach((k, idx) => {{
        let metricVal = 0;
        const col = k.column;
        const agg = (k.aggFunc || 'sum').toLowerCase();

        if (agg === 'count') {{
          metricVal = filtered.length;
        }} else if (agg === 'distinct') {{
          metricVal = new Set(filtered.map(r => r[col])).size;
        }} else {{
          const nums = filtered.map(r => Number(r[col])).filter(n => !isNaN(n));
          if (agg === 'sum') metricVal = nums.reduce((a,b) => a + b, 0);
          else if (agg === 'avg') metricVal = nums.length ? nums.reduce((a,b) => a + b, 0) / nums.length : 0;
          else if (agg === 'min') metricVal = nums.length ? Math.min(...nums) : 0;
          else if (agg === 'max') metricVal = nums.length ? Math.max(...nums) : 0;
        }}

        const formatted = metricVal >= 1e6 ? (metricVal/1e6).toFixed(2) + 'M' : metricVal >= 1e3 ? (metricVal/1e3).toFixed(1) + 'K' : Number(metricVal.toFixed(1)).toLocaleString();

        const card = document.createElement('div');
        card.className = 'kpi-card';
        card.style.borderLeftColor = PALETTE[idx % PALETTE.length];
        card.innerHTML = `
          <div class="kpi-title">${{escapeHtml(k.title)}}</div>
          <div class="kpi-value">${{formatted}}</div>
          <div class="kpi-sub">${{escapeHtml(agg.toUpperCase())}} of ${{escapeHtml(col)}} &bull; ${{escapeHtml(k.subtitle || 'Active Filtered Rows')}}</div>
        `;
        kpiContainer.appendChild(card);
      }});

      const visualsContainer = document.getElementById('visuals-grid');
      visualsContainer.innerHTML = '';

      (PACKAGE.visuals || []).forEach((v, vIdx) => {{
        const card = document.createElement('div');
        card.className = 'visual-card';

        const catMap = new Map();
        filtered.forEach(r => {{
          const cat = String(r[v.categoryCol] ?? '(Blank)');
          if (!catMap.has(cat)) catMap.set(cat, []);
          catMap.get(cat).push(r);
        }});

        const agg = (v.aggFunc || 'sum').toLowerCase();
        let items = Array.from(catMap.entries()).map(([cat, gRows]) => {{
          let val = 0;
          if (agg === 'count') val = gRows.length;
          else {{
            const nums = gRows.map(r => Number(r[v.valueCol])).filter(n => !isNaN(n));
            if (agg === 'sum') val = nums.reduce((a,b) => a + b, 0);
            else if (agg === 'avg') val = nums.length ? nums.reduce((a,b) => a + b, 0) / nums.length : 0;
            else if (agg === 'min') val = nums.length ? Math.min(...nums) : 0;
            else if (agg === 'max') val = nums.length ? Math.max(...nums) : 0;
          }}
          return {{ category: cat, value: val, count: gRows.length }};
        }});

        items.sort((a,b) => b.value - a.value);
        items = items.slice(0, 8);
        const totalVal = items.reduce((a,b) => a + Math.max(0, b.value), 0) || 1;
        items.forEach(it => it.pct = ((Math.max(0, it.value) / totalVal) * 100).toFixed(1) + '%');

        const vType = (v.type || 'bar').toLowerCase();
        let chartHtml = '';

        if (vType === 'pie' || vType === 'donut') {{
          chartHtml = renderSvgDonut(items, vType === 'donut');
        }} else if (vType === 'column' || vType === 'histogram' || vType === 'stacked_column' || vType === 'clustered_column') {{
          chartHtml = renderSvgColumn(items);
        }} else {{
          chartHtml = renderSvgBar(items);
        }}

        card.innerHTML = `
          <div class="visual-header">
            <div>
              <div class="visual-title">${{escapeHtml(v.title)}}</div>
              <div style="font-size:11px; color:#64748B;">${{escapeHtml(v.categoryCol)}} &bull; ${{escapeHtml(v.aggFunc)}}(${{escapeHtml(v.valueCol)}})</div>
            </div>
            <div class="visual-badge">${{escapeHtml(v.type)}}</div>
          </div>
          <div class="chart-container">
            ${{chartHtml}}
          </div>
        `;
        visualsContainer.appendChild(card);
      }});
    }}

    function renderSvgBar(items) {{
      const maxVal = Math.max(1, ...items.map(x => Math.abs(x.value)));
      const rows = items.map((it, idx) => {{
        const pct = Math.max(2, Math.round((Math.abs(it.value) / maxVal) * 100));
        const color = PALETTE[idx % PALETTE.length];
        return `
          <div style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px;">
              <span style="font-weight:600; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${{escapeHtml(it.category)}}</span>
              <span style="font-weight:700; color:#334155;">${{Number(it.value).toLocaleString()}} <span style="font-size:10px; color:#64748B;">(${{it.pct}})</span></span>
            </div>
            <div style="height:14px; background:#F1F5F9; border-radius:4px; overflow:hidden;">
              <div style="height:100%; width:${{pct}}%; background:${{color}}; border-radius:4px; transition:width 0.3s ease;"></div>
            </div>
          </div>
        `;
      }}).join('');
      return `<div>${{rows}}</div>`;
    }}

    function renderSvgColumn(items) {{
      const maxVal = Math.max(1, ...items.map(x => Math.abs(x.value)));
      const w = 460;
      const h = 200;
      const padL = 30;
      const padB = 40;
      const colW = Math.max(16, (w - padL) / (items.length || 1) - 12);

      const cols = items.map((it, idx) => {{
        const barH = Math.max(4, (Math.abs(it.value) / maxVal) * (h - padB - 20));
        const x = padL + idx * (colW + 12);
        const y = h - padB - barH;
        const color = PALETTE[idx % PALETTE.length];
        return `
          <rect x="${{x}}" y="${{y}}" width="${{colW}}" height="${{barH}}" rx="3" fill="${{color}}" class="bar-rect" onmousemove="showTip(event, '${{escapeHtml(it.category)}}: ${{Number(it.value).toLocaleString()}} (${{it.pct}})')" onmouseout="hideTip()"></rect>
          <text x="${{x + colW/2}}" y="${{h - padB + 16}}" text-anchor="middle" class="axis-text">${{escapeHtml(it.category.slice(0, 8))}}</text>
          <text x="${{x + colW/2}}" y="${{y - 4}}" text-anchor="middle" class="val-text">${{Number(it.value).toLocaleString()}}</text>
        `;
      }}).join('');

      return `<svg viewBox="0 0 ${{w}} ${{h}}" class="chart-svg">${{cols}}</svg>`;
    }}

    function renderSvgDonut(items, isDonut) {{
      const size = 200;
      const r = 80;
      const cx = 100;
      const cy = 100;
      let curAngle = -Math.PI / 2;

      const paths = items.map((it, idx) => {{
        const slicePct = Math.max(0.001, parseFloat(it.pct) / 100);
        const nextAngle = curAngle + slicePct * 2 * Math.PI;
        const x1 = cx + r * Math.cos(curAngle);
        const y1 = cy + r * Math.sin(curAngle);
        const x2 = cx + r * Math.cos(nextAngle);
        const y2 = cy + r * Math.sin(nextAngle);
        const largeArc = slicePct > 0.5 ? 1 : 0;
        const color = PALETTE[idx % PALETTE.length];
        const pathData = `M ${{cx}} ${{cy}} L ${{x1}} ${{y1}} A ${{r}} ${{r}} 0 ${{largeArc}} 1 ${{x2}} ${{y2}} Z`;
        curAngle = nextAngle;

        return `<path d="${{pathData}}" fill="${{color}}" onmousemove="showTip(event, '${{escapeHtml(it.category)}}: ${{Number(it.value).toLocaleString()}} (${{it.pct}})')" onmouseout="hideTip()"></path>`;
      }}).join('');

      const cutout = isDonut ? `<circle cx="${{cx}}" cy="${{cy}}" r="${{r * 0.55}}" fill="white"></circle>` : '';

      const legend = items.map((it, idx) => {{
        const color = PALETTE[idx % PALETTE.length];
        return `
          <div style="display:flex; align-items:center; gap:6px; font-size:11px; margin-bottom:4px;">
            <div style="width:10px; height:10px; background:${{color}}; border-radius:2px; shrink-0;"></div>
            <span style="font-weight:600; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${{escapeHtml(it.category)}}</span>
            <span style="color:#64748B;">(${{it.pct}})</span>
          </div>
        `;
      }}).join('');

      return `
        <div style="display:flex; align-items:center; justify-content:space-around; gap:16px;">
          <svg viewBox="0 0 200 200" style="width:160px; height:160px;">${{paths}}${{cutout}}</svg>
          <div style="max-height:180px; overflow-y:auto;">${{legend}}</div>
        </div>
      `;
    }}

    function renderTable() {{
      const filtered = getFilteredRows();
      const cols = PACKAGE.columns || (filtered.length ? Object.keys(filtered[0]) : []);

      let viewRows = filtered;
      if (searchQ) {{
        const q = searchQ.toLowerCase();
        viewRows = viewRows.filter(r => cols.some(c => String(r[c] ?? '').toLowerCase().includes(q)));
      }}

      if (sortCol) {{
        viewRows = [...viewRows].sort((a,b) => {{
          const va = a[sortCol];
          const vb = b[sortCol];
          if (typeof va === 'number' && typeof vb === 'number') {{
            return sortAsc ? va - vb : vb - va;
          }}
          return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        }});
      }}

      const totalPages = Math.max(1, Math.ceil(viewRows.length / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;

      document.getElementById('table-record-info').textContent = `Showing ${{viewRows.length.toLocaleString()}} rows (Page ${{currentPage}} of ${{totalPages}})`;
      document.getElementById('page-indicator').textContent = `Page ${{currentPage}} of ${{totalPages}}`;

      const thead = document.getElementById('table-header-row');
      thead.innerHTML = cols.map(c => {{
        const isCur = sortCol === c;
        const arrow = isCur ? (sortAsc ? ' ▲' : ' ▼') : '';
        return `<th onclick="sortTable('${{escapeHtml(c)}}')">${{escapeHtml(c)}}${{arrow}}</th>`;
      }}).join('');

      const tbody = document.getElementById('table-body');
      const start = (currentPage - 1) * pageSize;
      const pageData = viewRows.slice(start, start + pageSize);

      tbody.innerHTML = pageData.map(r => `
        <tr>${{cols.map(c => `<td>${{escapeHtml(r[c] ?? '')}}</td>`).join('')}}</tr>
      `).join('');
    }}

    function handleTableSearch(val) {{
      searchQ = val;
      currentPage = 1;
      renderTable();
    }}

    function sortTable(col) {{
      if (sortCol === col) sortAsc = !sortAsc;
      else {{ sortCol = col; sortAsc = true; }}
      renderTable();
    }}

    function changePage(delta) {{
      currentPage += delta;
      renderTable();
    }}

    function renderLineage() {{
      const container = document.getElementById('lineage-list-container');
      const steps = PACKAGE.steps || [];
      if (!steps.length) {{
        container.innerHTML = '<div style="color:#64748B; font-size:13px;">No pipeline transformation steps recorded for this workbook.</div>';
        return;
      }}
      container.innerHTML = steps.map((s, idx) => `
        <div class="lineage-item">
          <div class="lineage-idx">${{idx + 1}}</div>
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; font-size:13px;">${{escapeHtml(s.label || s.id || 'Step')}}</span>
              <span style="font-size:10px; font-weight:800; background:#F1F5F9; padding:2px 6px; border-radius:4px; text-transform:uppercase;">${{escapeHtml(s.type || '')}}</span>
            </div>
            <div style="font-size:11px; color:#64748B; margin-top:2px;">${{escapeHtml(JSON.stringify(s.params || {{}}))}}</div>
          </div>
        </div>
      `).join('');
    }}

    function exportDataCsv() {{
      const rows = getFilteredRows();
      const cols = PACKAGE.columns || (rows.length ? Object.keys(rows[0]) : []);
      const csv = [
        cols.join(','),
        ...rows.map(r => cols.map(c => {{
          const val = String(r[c] ?? '');
          return val.includes(',') || val.includes('"') || val.includes('\\n') ? `"${{val.replace(/"/g, '""')}}"` : val;
        }}).join(','))
      ].join('\\n');

      const blob = new Blob([csv], {{ type: 'text/csv' }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${{PACKAGE.title || 'StepSheet'}}_data.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }}

    function exportRawSswb() {{
      const blob = new Blob([JSON.stringify(PACKAGE, null, 2)], {{ type: 'application/json' }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${{PACKAGE.title || 'StepSheet'}}_packaged_workbook.sswb`;
      a.click();
      URL.revokeObjectURL(url);
    }}

    function toggleFullScreen() {{
      if (!document.fullscreenElement) {{
        document.documentElement.requestFullscreen().catch(() => {{}});
      }} else {{
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {{}});
      }}
    }}

    function showTip(e, text) {{
      const tip = document.getElementById('chart-tooltip');
      tip.textContent = text;
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
    }}

    function hideTip() {{
      document.getElementById('chart-tooltip').style.display = 'none';
    }}

    function escapeHtml(s) {{
      if (s === null || s === undefined) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }}

    window.onload = init;
  </script>
</body>
</html>"""


def export_dashboard_sswb_html(payload: Dict[str, Any], output_path: str) -> str:
    html_content = generate_sswb_html(payload)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    return output_path


def export_dashboard_sswb(payload: Dict[str, Any], output_path: str) -> str:
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    return output_path

