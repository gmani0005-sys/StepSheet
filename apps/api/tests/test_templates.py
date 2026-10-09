import pytest


def upload_test_csv(client, content: str, name: str):
    files = {"file": (name, content.encode("utf-8"), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["id"]


def test_list_templates_and_builtin_catalog(client):
    res = client.get("/api/v1/templates")
    assert res.status_code == 200
    templates = res.json()
    assert len(templates) >= 4

    rev_tpl = next((t for t in templates if t["id"] == "builtin-rev-margin"), None)
    assert rev_tpl is not None
    assert rev_tpl["name"] == "Revenue & Net Profit Margin"
    assert len(rev_tpl["required_columns"]) == 3
    assert len(rev_tpl["steps"]) == 3


def test_suggest_column_mapping_fuzzy(client):
    csv = "sales_gross,discounts,cogs_cost,region\n1000,50,400,East\n2000,100,800,West\n"
    ds_id = upload_test_csv(client, csv, "tpl_suggest_test.csv")

    res = client.post(
        "/api/v1/templates/builtin-rev-margin/suggest-mapping",
        json={"dataset_id": ds_id},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["template_id"] == "builtin-rev-margin"
    assert data["dataset_id"] == ds_id

    suggestions = {s["template_column"]: s for s in data["suggestions"]}
    assert "gross_revenue" in suggestions
    assert suggestions["gross_revenue"]["suggested_column"] == "sales_gross"
    assert suggestions["discounts"]["suggested_column"] == "discounts"
    assert suggestions["cogs"]["suggested_column"] == "cogs_cost"


def test_apply_template_and_preview_execution(client):
    csv = "sales_gross,discount_val,cogs_cost\n1000,100,500\n500,50,200\n"
    ds_id = upload_test_csv(client, csv, "tpl_apply_test.csv")

    mapping = {
        "gross_revenue": "sales_gross",
        "discounts": "discount_val",
        "cogs": "cogs_cost",
    }

    res = client.post(
        "/api/v1/templates/builtin-rev-margin/apply",
        json={"dataset_id": ds_id, "column_mapping": mapping},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["applied_count"] == 3
    rewritten_steps = data["rewritten_steps"]

    # Verify column1 and column2 were rewritten to target columns
    step1 = rewritten_steps[0]
    assert step1["params"]["column1"] == "sales_gross"
    assert step1["params"]["column2"] == "discount_val"

    step2 = rewritten_steps[1]
    assert step2["params"]["column1"] == "net_revenue"  # internal intermediate column
    assert step2["params"]["column2"] == "cogs_cost"

    # Verify that the rewritten steps execute cleanly in DuckDB preview
    preview_res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": rewritten_steps, "offset": 0, "limit": 10},
    )
    assert preview_res.status_code == 200
    pdata = preview_res.json()
    assert len(pdata["rows"]) == 2
    row0 = pdata["rows"][0]
    # net_revenue = 1000 - 100 = 900
    assert row0["net_revenue"] == 900
    # gross_profit = 900 - 500 = 400
    assert row0["gross_profit"] == 400
    # net_revenue_rounded = 900.0
    assert row0["net_revenue_rounded"] == 900.0
