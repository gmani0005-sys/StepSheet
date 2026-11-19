"""
KPI insight planning -- the server twin of apps/web/src/engine/kpiInsights.ts.

The planner decides WHICH metrics a dashboard shows; these helpers add what the
dashboard needs to explain them: the date column to compare months on, whether a
rise is good news, how to format the value, a plain-words definition, and rate
KPIs (one measure divided by another). The numbers themselves are computed in
the browser from the rows in view, so slicers move them; keep the rules here in
step with the TypeScript file so the server and offline planners agree.
"""
import re
from typing import Any, Dict, List, Optional

from app.schemas.ai_dashboard import DashboardKpiPlan

LOWER_IS_BETTER = re.compile(
    r"cost|discount|churn|fail|error|return|refund|cancel|complaint|defect|delay|latency|expense|loss|bounce|overdue|backlog|downtime|days_to|lead_time|wait",
    re.I,
)

AGG_LABEL = {
    "sum": "Sum",
    "avg": "Average",
    "min": "Minimum",
    "max": "Maximum",
    "count": "Count of rows",
    "distinct_count": "Distinct count",
}


def humanize(name: str) -> str:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", re.sub(r"[_-]+", " ", name or "")).strip()
    return " ".join(w[:1].upper() + w[1:].lower() for w in spaced.split())


def infer_good_direction(column: str, agg: Optional[str] = None) -> str:
    if (agg or "").lower() in ("min", "max"):
        return "neutral"
    return "down" if LOWER_IS_BETTER.search(column or "") else "up"


def detect_currency_symbol(sample_rows: Optional[List[Dict[str, Any]]], column: str) -> Optional[str]:
    """A symbol only when the data carries one -- never guessed from the column name."""
    counts: Dict[str, int] = {}
    seen = 0
    for r in (sample_rows or [])[:200]:
        v = r.get(column) if isinstance(r, dict) else None
        if v is None or isinstance(v, (int, float)):
            continue
        seen += 1
        m = re.search(r"[₹$€£¥]", str(v))
        if m:
            counts[m.group(0)] = counts.get(m.group(0), 0) + 1
    if not counts or seen == 0:
        return None
    sym, n = max(counts.items(), key=lambda kv: kv[1])
    return sym if n / seen >= 0.5 else None


_RATIO_PATTERNS = [
    (r"convert|conversion|won|paid|success|completed|closed_won", r"trial|lead|started|visit|session|opportunit|attempt|signup|run|total", "rate", "up"),
    (r"fail|error|reject|return|refund|cancel|churn", r"run|order|attempt|request|subscriber|total|sold|shipped|quantity|qty", "rate", "down"),
    (r"discount", r"amount|revenue|sales|gross|price|total", "Discount Rate", "down"),
    (r"profit|margin", r"revenue|sales|amount|gross|total", "Profit Margin", "up"),
    (r"cost|expense|spend", r"revenue|sales|amount|income", "to_revenue", "down"),
]


def suggest_ratio_kpi(measures: List[str]) -> Optional[DashboardKpiPlan]:
    """A meaningful rate between two numeric columns, if their names suggest one."""
    for num_re, den_re, title, direction in _RATIO_PATTERNS:
        num = next((m for m in measures if re.search(num_re, m, re.I)), None)
        if not num:
            continue
        den = next((m for m in measures if m != num and re.search(den_re, m, re.I) and not re.search(num_re, m, re.I)), None)
        if not den:
            continue
        if title == "rate":
            label = f"{humanize(num)} Rate (÷ {humanize(den)})"
        elif title == "to_revenue":
            label = f"{humanize(num)} to Revenue"
        else:
            label = title
        slug = re.sub(r"\s+", "_", num.lower())
        return DashboardKpiPlan(
            id=f"kpi_rate_{slug}",
            title=label,
            column=num,
            aggFunc="sum",
            subtitle=f"{humanize(num)} ÷ {humanize(den)}",
            accentColor="#0284C7",
            kind="ratio",
            numeratorCol=num,
            numeratorAgg="sum",
            denominatorCol=den,
            denominatorAgg="sum",
            format="percent",
            goodDirection=direction,
        )
    return None


def describe_kpi(k: DashboardKpiPlan) -> str:
    direction = {"down": " Lower is better.", "up": " Higher is better."}.get(k.goodDirection or "", "")
    if k.kind == "ratio" and k.numeratorCol and k.denominatorCol:
        num_l = AGG_LABEL.get(k.numeratorAgg or "sum", "Sum")
        den_l = AGG_LABEL.get(k.denominatorAgg or "sum", "Sum").lower()
        return f"{num_l} of {k.numeratorCol} ÷ {den_l} of {k.denominatorCol}, for the rows in view.{direction}"
    f = (k.aggFunc or "sum").lower()
    if f == "count":
        return f"Number of rows in view.{direction}"
    if f == "distinct_count":
        return f"Number of different {k.column} values in view.{direction}"
    return f"{AGG_LABEL.get(f, humanize(f))} of {k.column} across the rows in view.{direction}"


def enrich_kpi(
    k: DashboardKpiPlan,
    date_col: Optional[str],
    sample_rows: Optional[List[Dict[str, Any]]] = None,
) -> DashboardKpiPlan:
    """Fill in the insight fields a plan left out; fields already set are kept."""
    data = k.model_dump() if hasattr(k, "model_dump") else k.dict()
    if not data.get("kind"):
        data["kind"] = "ratio" if data.get("numeratorCol") and data.get("denominatorCol") else "aggregate"
    if not data.get("goodDirection"):
        col = data.get("numeratorCol") if data["kind"] == "ratio" else data.get("column")
        data["goodDirection"] = infer_good_direction(col or "", None if data["kind"] == "ratio" else data.get("aggFunc"))
    if not data.get("format"):
        if data["kind"] == "ratio":
            data["format"] = "percent"
        else:
            sym = None
            if (data.get("aggFunc") or "").lower() not in ("count", "distinct_count"):
                sym = detect_currency_symbol(sample_rows, data.get("column") or "")
            data["format"] = "currency" if sym else "number"
            if sym and not data.get("currencySymbol"):
                data["currencySymbol"] = sym
    if not data.get("dateCol") and date_col:
        data["dateCol"] = date_col
    if not data.get("compare"):
        data["compare"] = "previous_period" if data.get("dateCol") else "none"
    enriched = DashboardKpiPlan(**data)
    if not enriched.definition:
        enriched.definition = describe_kpi(enriched)
    return enriched
