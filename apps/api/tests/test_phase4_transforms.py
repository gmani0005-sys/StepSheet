import pytest


def upload_test_csv(client, content: str, name: str):
    files = {"file": (name, content.encode("utf-8"), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["id"]


def test_step_conditional_ifs(client):
    csv = "id,score\n1,95\n2,82\n3,65\n4,40\n"
    ds_id = upload_test_csv(client, csv, "cond_test.csv")

    steps = [
        {
            "id": "s1",
            "type": "conditional",
            "label": "Grade tiers",
            "enabled": True,
            "params": {
                "new_column": "grade",
                "rules": [
                    {"column": "score", "operator": "gte", "value": "90", "result": "A"},
                    {"column": "score", "operator": "gte", "value": "80", "result": "B"},
                    {"column": "score", "operator": "gte", "value": "60", "result": "C"},
                ],
                "else_value": "F",
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    grades = [r["grade"] for r in data["rows"]]
    assert grades == ["A", "B", "C", "F"]


def test_step_group_by_and_aggregations(client):
    csv = "category,item,amount\nElectronics,Laptop,1000\nElectronics,Phone,500\nFurniture,Chair,150\nFurniture,Desk,350\n"
    ds_id = upload_test_csv(client, csv, "groupby_test.csv")

    steps = [
        {
            "id": "s1",
            "type": "group_by",
            "label": "Summarize by category",
            "enabled": True,
            "params": {
                "group_by_columns": ["category"],
                "aggregations": [
                    {"column": "amount", "agg_func": "sum", "output_column": "total_amount"},
                    {"column": "item", "agg_func": "count", "output_column": "item_count"},
                    {"column": "amount", "agg_func": "avg", "output_column": "avg_amount"},
                ],
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 2
    by_cat = {r["category"]: r for r in data["rows"]}
    assert by_cat["Electronics"]["total_amount"] == 1500
    assert by_cat["Electronics"]["item_count"] == 2
    assert by_cat["Furniture"]["total_amount"] == 500


def test_step_window_calc_running_total_and_rank(client):
    csv = "salesperson,sales\nBob,100\nAlice,300\nCharlie,200\n"
    ds_id = upload_test_csv(client, csv, "window_test.csv")

    steps = [
        {
            "id": "s1",
            "type": "sort_rows",
            "label": "Sort sales desc",
            "enabled": True,
            "params": {"column": "sales", "direction": "desc"},
        },
        {
            "id": "s2",
            "type": "window_calc",
            "label": "Cumulative sales",
            "enabled": True,
            "params": {
                "calc_type": "running_total",
                "target_column": "sales",
                "output_column": "cumulative_sales",
                "order_by": "sales",
                "order_direction": "desc",
            },
        },
        {
            "id": "s3",
            "type": "window_calc",
            "label": "Rank sales",
            "enabled": True,
            "params": {
                "calc_type": "rank",
                "target_column": "sales",
                "output_column": "sales_rank",
                "order_by": "sales",
                "order_direction": "desc",
            },
        },
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    # 300 (rank 1, cum 300), 200 (rank 2, cum 500), 100 (rank 3, cum 600)
    assert data["rows"][0]["cumulative_sales"] == 300
    assert data["rows"][0]["sales_rank"] == 1
    assert data["rows"][1]["cumulative_sales"] == 500
    assert data["rows"][2]["cumulative_sales"] == 600


def test_step_text_transforms(client):
    csv = "raw_text\n  alice wonderland  \n  BOB BUILDER  \n"
    ds_id = upload_test_csv(client, csv, "text_test.csv")

    steps = [
        {
            "id": "s1",
            "type": "text_transform",
            "label": "Trim spaces",
            "enabled": True,
            "params": {"column": "raw_text", "operation": "trim", "output_column": "trimmed"},
        },
        {
            "id": "s2",
            "type": "text_transform",
            "label": "Upper text",
            "enabled": True,
            "params": {"column": "trimmed", "operation": "upper", "output_column": "upper_text"},
        },
        {
            "id": "s3",
            "type": "text_transform",
            "label": "Left 5 chars",
            "enabled": True,
            "params": {"column": "upper_text", "operation": "left", "length": 5, "output_column": "first_5"},
        },
        {
            "id": "s4",
            "type": "text_transform",
            "label": "Length of text",
            "enabled": True,
            "params": {"column": "trimmed", "operation": "length", "output_column": "char_len"},
        },
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    r1 = data["rows"][0]
    assert r1["trimmed"] == "alice wonderland"
    assert r1["upper_text"] == "ALICE WONDERLAND"
    assert r1["first_5"] == "ALICE"
    assert r1["char_len"] == 16


def test_step_date_transforms(client):
    csv = "order_date,ship_date\n2024-01-15,2024-01-20\n2024-02-10,2024-03-01\n"
    ds_id = upload_test_csv(client, csv, "date_test.csv")

    steps = [
        {
            "id": "s1",
            "type": "date_transform",
            "label": "Extract Year",
            "enabled": True,
            "params": {"column": "order_date", "operation": "extract_part", "date_part": "year", "output_column": "order_year"},
        },
        {
            "id": "s2",
            "type": "date_transform",
            "label": "End of Month",
            "enabled": True,
            "params": {"column": "order_date", "operation": "eomonth", "output_column": "eom_date"},
        },
        {
            "id": "s3",
            "type": "date_transform",
            "label": "Days between order and ship",
            "enabled": True,
            "params": {"column": "order_date", "operation": "datedif", "second_column": "ship_date", "unit": "day", "output_column": "days_to_ship"},
        },
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    r1 = data["rows"][0]
    assert r1["order_year"] == 2024
    assert str(r1["eom_date"]).startswith("2024-01-31")
    assert r1["days_to_ship"] == 5


def test_step_math_transforms_and_binning(client):
    csv = "cost,price\n10,15\n20,25\n50,120\n"
    ds_id = upload_test_csv(client, csv, "math_test.csv")

    steps = [
        {
            "id": "s1",
            "type": "math_transform",
            "label": "Profit = Price - Cost",
            "enabled": True,
            "params": {"column1": "price", "column2": "cost", "operation": "arithmetic", "math_operator": "-", "output_column": "profit"},
        },
        {
            "id": "s2",
            "type": "math_transform",
            "label": "Margin Percent",
            "enabled": True,
            "params": {"column1": "cost", "column2": "price", "operation": "percent_change", "decimals": 1, "output_column": "pct_markup"},
        },
        {
            "id": "s3",
            "type": "math_transform",
            "label": "Price Bins",
            "enabled": True,
            "params": {
                "column1": "price",
                "operation": "bin",
                "output_column": "price_bracket",
                "bins": [{"max": 20, "label": "Budget"}, {"max": 50, "label": "Mid"}],
                "bin_other": "Premium",
            },
        },
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    r1 = data["rows"][0]
    assert r1["profit"] == 5.0
    assert r1["pct_markup"] == 50.0
    assert r1["price_bracket"] == "Budget"

    r3 = data["rows"][2]
    assert r3["profit"] == 70.0
    assert r3["price_bracket"] == "Premium"


def test_step_pivot_and_unpivot(client):
    csv = "rep,quarter,revenue\nAlice,Q1,100\nAlice,Q2,150\nBob,Q1,200\nBob,Q2,250\n"
    ds_id = upload_test_csv(client, csv, "pivot_test.csv")

    steps = [
        {
            "id": "s1",
            "type": "pivot",
            "label": "Pivot revenue by quarter",
            "enabled": True,
            "params": {
                "index_columns": ["rep"],
                "pivot_column": "quarter",
                "value_column": "revenue",
                "agg_func": "sum",
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 2
    col_names = [c["name"] for c in data["columns"]]
    assert "rep" in col_names
    assert "Q1" in col_names
    assert "Q2" in col_names
