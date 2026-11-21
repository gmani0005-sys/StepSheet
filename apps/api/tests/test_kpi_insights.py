"""Insight-grade AI dashboards: KPI change, direction, format, rates and definitions."""
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import Base, engine
from app.schemas.ai_dashboard import DashboardKpiPlan
from app.services.kpi_insights import (
    detect_currency_symbol,
    enrich_kpi,
    infer_good_direction,
    suggest_ratio_kpi,
)

client = TestClient(app)


def test_good_direction_from_column_name():
    assert infer_good_direction("revenue") == "up"
    assert infer_good_direction("discount") == "down"
    assert infer_good_direction("churned_subs") == "down"
    assert infer_good_direction("failed_runs") == "down"
    assert infer_good_direction("amount", "max") == "neutral"


def test_currency_only_when_the_data_has_a_symbol():
    assert detect_currency_symbol([{"amount": "₹1,200"}, {"amount": "₹950"}], "amount") == "₹"
    # A "revenue" column of plain numbers is not assumed to be dollars.
    assert detect_currency_symbol([{"revenue": 1200}, {"revenue": 950}], "revenue") is None


def test_ratio_kpis_are_suggested_from_column_pairs():
    r = suggest_ratio_kpi(["amount", "discount", "quantity"])
    assert r is not None and r.kind == "ratio"
    assert (r.numeratorCol, r.denominatorCol) == ("discount", "amount")
    assert r.format == "percent" and r.goodDirection == "down"

    r2 = suggest_ratio_kpi(["trials_started", "trial_conversions"])
    assert (r2.numeratorCol, r2.denominatorCol) == ("trial_conversions", "trials_started")
    assert r2.goodDirection == "up"

    r3 = suggest_ratio_kpi(["runs", "failed_runs"])
    assert (r3.numeratorCol, r3.denominatorCol) == ("failed_runs", "runs")
    assert r3.goodDirection == "down"

    assert suggest_ratio_kpi(["amount", "quantity"]) is None


def test_enrich_keeps_set_fields_and_fills_the_rest():
    k = DashboardKpiPlan(id="k1", title="Total Amount", column="amount", aggFunc="sum", goodDirection="down")
    e = enrich_kpi(k, "order_date", [{"amount": "₹10"}, {"amount": "₹12"}])
    assert e.goodDirection == "down"  # kept
    assert e.dateCol == "order_date" and e.compare == "previous_period"
    assert e.format == "currency" and e.currencySymbol == "₹"
    assert e.definition and "amount" in e.definition

    no_date = enrich_kpi(DashboardKpiPlan(id="k2", title="Rows", column="x", aggFunc="count"), None, [])
    assert no_date.compare == "none" and no_date.format == "number"


def test_generated_plan_carries_insight_fields():
    Base.metadata.create_all(bind=engine)
    rows = [
        {"order_date": f"2025-{m:02d}-{d:02d}", "region": reg, "product": "Lamp", "amount": 100 + m + d, "discount": 5, "quantity": 1}
        for m in (10, 11, 12)
        for d in (3, 10, 17)
        for reg in ("North", "South")
    ]
    req = {
        "dataset_id": "client-kpi-insights",
        "dataset_name": "orders",
        "columns": [
            {"name": "order_date", "data_type": "date"},
            {"name": "region", "data_type": "text"},
            {"name": "product", "data_type": "text"},
            {"name": "amount", "data_type": "float"},
            {"name": "discount", "data_type": "float"},
            {"name": "quantity", "data_type": "integer"},
        ],
        "sample_rows": rows,
    }
    resp = client.post("/api/v1/ai/generate-dashboard", json=req)
    assert resp.status_code == 200, resp.text
    plan = resp.json()["plan"]
    kpis = plan["kpis"]
    assert all(k["dateCol"] == "order_date" and k["compare"] == "previous_period" for k in kpis)
    assert all(k["definition"] for k in kpis)
    rate = [k for k in kpis if k.get("kind") == "ratio"]
    assert rate and rate[0]["numeratorCol"] == "discount" and rate[0]["denominatorCol"] == "amount"
    assert rate[0]["goodDirection"] == "down" and rate[0]["format"] == "percent"
    assert "Automated executive glassmorphic" not in plan["narrative_summary"]

    # The fields survive a conversational patch round trip.
    patch = client.post(
        "/api/v1/ai/patch-dashboard",
        json={**{k: req[k] for k in ("dataset_id", "dataset_name", "columns", "sample_rows")}, "prompt": "Change the title to Orders Review", "current_dashboard": plan},
    )
    assert patch.status_code == 200, patch.text
    updated = patch.json()["updated_dashboard"]
    assert any(k.get("kind") == "ratio" for k in updated["kpis"])
    assert all(k.get("compare") == "previous_period" for k in updated["kpis"])


def test_rank_measures_leads_with_logged_effort_and_puts_percentages_last():
    from app.services.kpi_insights import rank_measures
    cols = ["Location Weekly Hours", "IDS % (Whole Number)", "Expected Per Day", "Daily Actual Hours", "Daily Expected Hours", "Daily IDS %"]
    ranked = rank_measures(cols)
    assert ranked[:2] == ["Daily Actual Hours", "Daily Expected Hours"]
    assert set(ranked[-2:]) == {"IDS % (Whole Number)", "Daily IDS %"}
    assert rank_measures(["quantity", "amount"])[0] == "amount"  # sales data unchanged


def test_utilisation_rate_pairs_actual_with_expected_at_the_same_grain():
    r = suggest_ratio_kpi(["Expected Per Day", "Weekly Actual Hours", "Weekly Expected Hours", "Weekly IDS %"])
    assert r is not None and r.kind == "ratio"
    assert (r.numeratorCol, r.denominatorCol) == ("Weekly Actual Hours", "Weekly Expected Hours")
    assert r.goodDirection == "neutral" and r.format == "percent"
    assert r.title == "Utilization (Actual ÷ Expected)"
    s = suggest_ratio_kpi(["sales", "sales_target"])
    assert s is None or s.numeratorCol != "sales_target"


def test_sales_fact_ranking_matches_web():
    from app.services.kpi_insights import rank_measures, suggest_ratio_kpi, name_words
    cols = ['LineNo', 'Qty', 'UnitPriceLocal', 'DiscountPct', 'UnitCostUSD', 'RateToUSD', 'ReturnQty', 'QtyClean', 'ReturnQtyClean',
            'GrossLocal', 'NetLocal', 'NetUSD', 'COGSUSD', 'ReturnedUSD', 'NetAfterReturnsUSD', 'MarginUSD', 'Year', 'MonthNum']
    assert name_words('NetAfterReturnsUSD') == 'net after returns usd'
    ranked = rank_measures(cols)
    assert ranked[:3] == ['NetAfterReturnsUSD', 'NetUSD', 'MarginUSD']
    r = suggest_ratio_kpi(ranked)
    assert r.title == 'Profit Margin' and r.numeratorCol == 'MarginUSD' and r.denominatorCol == 'NetAfterReturnsUSD'
