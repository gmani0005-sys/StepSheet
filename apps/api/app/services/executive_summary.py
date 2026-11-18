"""
Executive summary for Chat with Data -- the server twin of the "Top Executive
Findings" answer in apps/web/src/api/localEngine.ts.

Asked for "an executive summary of this data" (or key findings, an overview,
highlights...), the planner used to fall through to "SUM of <first measure>":
one number, which also read as wrong. This computes the same findings as the
in-browser engine, in DuckDB over the full dataset:

- total and average of the main measure;
- the leading value of region, product, customer, status and category
  columns, with its share -- never an identifier column (order_id, a value on
  almost every row), which is not a category;
- the date range.

No currency symbol is guessed from a column name: one is shown only when the
measure's own values carry it.
"""
import re
from typing import Any, Dict, List, Optional, Tuple

from app.schemas.chat_query import ChatChartConfig, ChatQueryPlan, ChatSelectField
from app.services.sql_safe import number_parse_sql, quote_ident

FINDINGS_PATTERNS = [
    r"\b(findings?|top findings?|key findings?|main findings?)\b",
    r"\b(key|top|main)\s+(insights?|takeaways?|highlights?)\b",
    r"\bexecutive\s+summary\b",
    r"\b(overview|summary)\s+of\s+(?:the|this)\s+(?:data|dataset|table|records)\b",
    r"^(?:what\s+are\s+the\s+)?(?:top\s+)?findings?\b",
    r"^(summary|insights|overview|findings|key findings|top findings)$",
]

_ID_NAME = re.compile(r"(^|[_\s-])(id|uuid|guid|key|code|no|num|number)$|^id$|_id$|Id$", re.I)


def is_findings_query(prompt: str) -> bool:
    p = (prompt or "").lower().strip()
    return any(re.search(rx, p, re.I) for rx in FINDINGS_PATTERNS)


def _label(col: str) -> str:
    return " ".join(w[:1].upper() + w[1:] for w in col.replace("_", " ").split())


def _pick_measure(num_cols: List[str]) -> Optional[str]:
    exact = next((c for c in num_cols if re.fullmatch(r"revenue|sales|amount|total_amount|total|turnover", c, re.I)), None)
    if exact:
        return exact
    named = next((c for c in num_cols if re.search(r"revenue|sales|amount|total|turnover|profit|spend|price|cost|qty|quantity", c, re.I)), None)
    return named or (num_cols[0] if num_cols else None)


def build_executive_summary(
    conn: Any,
    from_source: str,
    columns: List[Dict[str, Any]],
    dataset_name: str,
    dataset_id: str,
) -> Tuple[ChatQueryPlan, str, List[str], List[Dict[str, Any]], str]:
    """Returns (plan, explanation, result columns, result rows, SQL trace)."""
    num_cols = [c["name"] for c in columns if c.get("data_type") in ("integer", "float")]
    date_cols = [c["name"] for c in columns if c.get("data_type") == "date"]
    text_cols = [c["name"] for c in columns if c.get("data_type") not in ("integer", "float", "date", "boolean")]
    measure = _pick_measure(num_cols)
    trace: List[str] = []

    total_rows = conn.execute(f"SELECT COUNT(*) FROM {from_source}").fetchone()[0] or 0

    # Currency only when the data carries one.
    currency = ""
    if measure:
        sample = [
            r[0]
            for r in conn.execute(
                f"SELECT CAST({quote_ident(measure)} AS VARCHAR) FROM {from_source} WHERE {quote_ident(measure)} IS NOT NULL LIMIT 200"
            ).fetchall()
        ]
        hits: Dict[str, int] = {}
        for v in sample:
            m = re.search(r"[₹$€£¥]", str(v))
            if m:
                hits[m.group(0)] = hits.get(m.group(0), 0) + 1
        if hits and sample:
            sym, n = max(hits.items(), key=lambda kv: kv[1])
            if n / len(sample) >= 0.5:
                currency = sym

    def fmt(n: float) -> str:
        a = abs(n)
        sign = "-" if n < 0 else ""
        if a >= 1e9:
            body = f"{a / 1e9:.2f}B"
        elif a >= 1e6:
            body = f"{a / 1e6:.2f}M"
        elif a >= 1e3:
            body = f"{a / 1e3:.1f}K"
        else:
            body = f"{a:,.2f}".rstrip("0").rstrip(".")
        return f"{sign}{currency}{body}"

    num_expr = number_parse_sql(quote_ident(measure)) if measure else None
    total = avg = 0.0
    if measure:
        sql = f"SELECT SUM({num_expr}), AVG({num_expr}) FROM {from_source}"
        trace.append(sql)
        t, a = conn.execute(sql).fetchone()
        total, avg = float(t or 0), float(a or 0)

    # Profile text columns: distinct share tells identifiers from categories.
    share: Dict[str, float] = {}
    for c in text_cols:
        d, n = conn.execute(
            f"SELECT COUNT(DISTINCT {quote_ident(c)}), COUNT({quote_ident(c)}) FROM {from_source}"
        ).fetchone()
        share[c] = (d / n) if n else 1.0
    groupable = [c for c in text_cols if not _ID_NAME.search(c) and share[c] <= 0.5]

    def first(pattern: str, pool: List[str], exclude=()) -> Optional[str]:
        return next((c for c in pool if re.search(pattern, c, re.I) and c not in exclude), None)

    geo = first(r"region|territor|country|state|city|market|zone|location", groupable)
    prod = first(r"product|item|sku|title|model|goods", groupable)
    cust = next((c for c in text_cols if re.search(r"customer|client|account|buyer|company|user", c, re.I) and share[c] <= 0.5), None)
    status = first(r"status|stage|phase", groupable, exclude=(geo,))
    used = {x for x in (geo, prod, cust, status) if x}
    cat = first(r"categor|segment|dept|department|type|genre|class", groupable, exclude=used) or next(
        (c for c in groupable if c not in used and share[c] <= 0.2), None
    )

    def top_of(col: Optional[str]):
        if not col:
            return None
        q = quote_ident(col)
        if measure:
            sql = (
                f"SELECT CAST({q} AS VARCHAR) AS v, COALESCE(SUM({num_expr}), 0) AS t, COUNT(*) AS n, "
                f"COUNT(*) OVER () AS k FROM {from_source} WHERE {q} IS NOT NULL AND TRIM(CAST({q} AS VARCHAR)) <> '' "
                f"GROUP BY 1 ORDER BY t DESC, v LIMIT 1"
            )
        else:
            sql = (
                f"SELECT CAST({q} AS VARCHAR) AS v, COUNT(*) AS t, COUNT(*) AS n, COUNT(*) OVER () AS k "
                f"FROM {from_source} WHERE {q} IS NOT NULL AND TRIM(CAST({q} AS VARCHAR)) <> '' GROUP BY 1 ORDER BY t DESC, v LIMIT 1"
            )
        trace.append(sql)
        row = conn.execute(sql).fetchone()
        if not row:
            return None
        v, t, n, k = row
        base = total if measure and total else total_rows
        pct = round(float(t) / base * 100, 1) if base else 0.0
        return {"col": col, "label": _label(col), "name": v, "total": float(t), "count": int(n), "distinct": int(k), "pct": pct}

    top_cat, top_geo, top_prod, top_cust, top_status = (top_of(c) for c in (cat, geo, prod, cust, status))

    date_range = None
    if date_cols:
        dq = quote_ident(date_cols[0])
        sql = f"SELECT MIN(TRY_CAST({dq} AS DATE)), MAX(TRY_CAST({dq} AS DATE)), COUNT(TRY_CAST({dq} AS DATE)) FROM {from_source}"
        trace.append(sql)
        lo, hi, n = conn.execute(sql).fetchone()
        if lo and hi:
            date_range = (str(lo)[:10], str(hi)[:10], int(n))

    m_label = _label(measure) if measure else "Records"
    rows: List[Dict[str, Any]] = []
    bullets: List[str] = []
    if measure:
        rows.append({"Key Dimension / Metric": f"Total {m_label}", "Top Finding": fmt(total), "Share (%)": 100,
                     "Details & Volume": f"{total_rows:,} records • Avg {fmt(avg)} / row"})
        bullets.append(f"- 💰 **Total {m_label}**: **{fmt(total)}** across **{total_rows:,} records** (average **{fmt(avg)}** per record).")
    if top_cat:
        rows.append({"Key Dimension / Metric": f"Top Category ({top_cat['label']})", "Top Finding": top_cat["name"], "Share (%)": top_cat["pct"],
                     "Details & Volume": f"{fmt(top_cat['total']) if measure else top_cat['count']} ({top_cat['count']:,} rows across {top_cat['distinct']} categories)"})
        bullets.append(f"- 🏆 **Top {top_cat['label']}**: **{top_cat['name']}** with **{fmt(top_cat['total']) if measure else top_cat['count']}** (**{top_cat['pct']}%** of the total).")
    if top_geo:
        rows.append({"Key Dimension / Metric": f"Top Region ({top_geo['label']})", "Top Finding": top_geo["name"], "Share (%)": top_geo["pct"],
                     "Details & Volume": f"{fmt(top_geo['total']) if measure else top_geo['count']} ({top_geo['count']:,} rows across {top_geo['distinct']} regions)"})
        bullets.append(f"- 🌍 **Top {top_geo['label']}**: **{top_geo['name']}** with **{fmt(top_geo['total']) if measure else top_geo['count']}** (**{top_geo['pct']}%** share).")
    if top_prod:
        rows.append({"Key Dimension / Metric": f"Leading Product ({top_prod['label']})", "Top Finding": top_prod["name"], "Share (%)": top_prod["pct"],
                     "Details & Volume": f"{fmt(top_prod['total']) if measure else top_prod['count']} ({top_prod['count']:,} rows)"})
        bullets.append(f"- 📦 **Leading {top_prod['label']}**: **{top_prod['name']}** with **{fmt(top_prod['total']) if measure else top_prod['count']}**.")
    if top_cust:
        rows.append({"Key Dimension / Metric": f"Top Customer ({top_cust['label']})", "Top Finding": top_cust["name"], "Share (%)": top_cust["pct"],
                     "Details & Volume": f"{fmt(top_cust['total']) if measure else top_cust['count']} in total"})
        bullets.append(f"- 👑 **Top {top_cust['label']}**: **{top_cust['name']}** contributing **{fmt(top_cust['total']) if measure else top_cust['count']}**.")
    if top_status:
        rows.append({"Key Dimension / Metric": f"Primary Status ({top_status['label']})", "Top Finding": top_status["name"], "Share (%)": top_status["pct"],
                     "Details & Volume": f"{top_status['count']:,} of {total_rows:,} records"})
        bullets.append(f"- ⚡ **Most common {top_status['label']}**: **{top_status['name']}** ({top_status['count']:,} rows).")
    if date_range:
        rows.append({"Key Dimension / Metric": "Timeline Horizon", "Top Finding": f"{date_range[0]} to {date_range[1]}", "Share (%)": 100,
                     "Details & Volume": f"{date_range[2]:,} dated records"})
        bullets.append(f"- ⏱️ **Time span**: **{date_range[0]} to {date_range[1]}**.")

    explanation = (
        f"### 📊 Executive summary of **{dataset_name}**\n\n"
        f"Computed across all **{total_rows:,} records**:\n\n" + "\n".join(bullets)
    )
    first_dim = next((t["col"] for t in (top_cat, top_geo, top_prod) if t), None)
    plan = ChatQueryPlan(
        intent="summary",
        dataset_id=dataset_id,
        select=[ChatSelectField(column=measure, aggregation="sum", alias=f"Total {m_label}")] if measure else [],
        group_by=[first_dim] if first_dim else [],
        limit=max(1, len(rows)),
        chart=ChatChartConfig(type="table", x="Top Finding", y="Share (%)"),
        explanation=f"Executive summary across {total_rows:,} records.",
    )
    cols = ["Key Dimension / Metric", "Top Finding", "Share (%)", "Details & Volume"]
    return plan, explanation, cols, rows, ";\n".join(trace) + ";"
