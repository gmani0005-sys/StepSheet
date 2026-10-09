import pytest


def upload_test_csv(client, content: str, name: str):
    files = {"file": (name, content.encode("utf-8"), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["id"]


def test_ai_status_endpoint(client):
    res = client.get("/api/v1/ai/status")
    assert res.status_code == 200
    data = res.json()
    assert "provider" in data
    assert "model" in data


def test_ai_generate_filter_step(client):
    csv = "order_id,amount\n1,100\n2,20\n"
    ds_id = upload_test_csv(client, csv, "ai_orders.csv")

    res = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "filter where amount is greater than 50"},
    )
    assert res.status_code == 200
    data = res.json()
    step = data["step"]
    assert step["type"] == "filter_rows"
    assert step["params"]["column"] == "amount"
    assert step["params"]["operator"] in ["gt", "gte"]
    assert step["params"]["value"] == "50"
    assert data["confidence"] > 0.8


def test_ai_generate_sort_step(client):
    csv = "order_id,amount\n1,100\n2,20\n"
    ds_id = upload_test_csv(client, csv, "ai_sort.csv")

    res = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "sort by amount descending"},
    )
    assert res.status_code == 200
    data = res.json()
    step = data["step"]
    assert step["type"] == "sort_rows"
    assert step["params"]["column"] == "amount"
    assert step["params"]["direction"] == "desc"


def test_ai_generate_running_total_step(client):
    csv = "order_date,amount\n2024-01-01,100\n2024-01-02,200\n"
    ds_id = upload_test_csv(client, csv, "ai_window.csv")

    res = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "calculate running total of amount"},
    )
    assert res.status_code == 200
    data = res.json()
    step = data["step"]
    assert step["type"] == "window_calc"
    assert step["params"]["calc_type"] == "running_total"
    assert step["params"]["target_column"] == "amount"


def test_ai_generate_group_by_step(client):
    csv = "category,amount\nFood,10\nTech,50\n"
    ds_id = upload_test_csv(client, csv, "ai_group.csv")

    res = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "group by category and sum amount"},
    )
    assert res.status_code == 200
    data = res.json()
    step = data["step"]
    assert step["type"] == "group_by"
    assert step["params"]["group_by_columns"] == ["category"]


def test_ai_generate_change_type_step(client):
    csv = "id,str_val\n1,123\n2,456\n"
    ds_id = upload_test_csv(client, csv, "ai_type.csv")

    res = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "change str_val to integer"},
    )
    assert res.status_code == 200
    data = res.json()
    step = data["step"]
    assert step["type"] == "change_type"
    assert step["params"]["column"] == "str_val"
    assert step["params"]["target_type"] == "integer"


def test_ai_generate_formula_user_prompt_discounted(client):
    """Verifies the exact user prompt: 'create discounted column = amount - discount'"""
    csv = "order_id,amount,discount\n1,100,10\n2,200,30\n"
    ds_id = upload_test_csv(client, csv, "ai_discounted.csv")

    res = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "create discounted column = amount - discount"},
    )
    assert res.status_code == 200
    data = res.json()
    step = data["step"]
    assert step["type"] == "math_transform"
    assert step["params"]["operation"] == "arithmetic"
    assert step["params"]["column1"] == "amount"
    assert step["params"]["column2"] == "discount"
    assert step["params"]["math_operator"] == "-"
    assert step["params"]["output_column"] == "discounted"
    assert "discounted" in step["label"].lower()

    # Now verify this generated step can be executed via pipeline preview
    preview_res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": [step], "offset": 0, "limit": 10},
    )
    assert preview_res.status_code == 200
    pdata = preview_res.json()
    assert any(c["name"] == "discounted" for c in pdata["columns"])
    # 100 - 10 = 90.0, 200 - 30 = 170.0
    assert pdata["rows"][0]["discounted"] == 90.0
    assert pdata["rows"][1]["discounted"] == 170.0


def test_ai_generate_formula_assignment_variants(client):
    csv = "revenue,cost,price,quantity\n500,300,50,4\n"
    ds_id = upload_test_csv(client, csv, "ai_formulas.csv")

    # profit = revenue - cost
    res1 = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "profit = revenue - cost"},
    )
    assert res1.status_code == 200
    s1 = res1.json()["step"]
    assert s1["type"] == "math_transform"
    assert s1["params"]["column1"] == "revenue"
    assert s1["params"]["column2"] == "cost"
    assert s1["params"]["math_operator"] == "-"
    assert s1["params"]["output_column"] == "profit"

    # total = price * quantity
    res2 = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "total = price * quantity"},
    )
    assert res2.status_code == 200
    s2 = res2.json()["step"]
    assert s2["type"] == "math_transform"
    assert s2["params"]["column1"] == "price"
    assert s2["params"]["column2"] == "quantity"
    assert s2["params"]["math_operator"] == "*"
    assert s2["params"]["output_column"] == "total"

    # calculate discounted as revenue - cost
    res3 = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "calculate net_profit as revenue - cost"},
    )
    assert res3.status_code == 200
    s3 = res3.json()["step"]
    assert s3["type"] == "math_transform"
    assert s3["params"]["output_column"] == "net_profit"

    # subtract cost from revenue as profit
    res4 = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "subtract cost from revenue as profit"},
    )
    assert res4.status_code == 200
    s4 = res4.json()["step"]
    assert s4["type"] == "math_transform"
    assert s4["params"]["column1"] == "revenue"
    assert s4["params"]["column2"] == "cost"
    assert s4["params"]["math_operator"] == "-"
    assert s4["params"]["output_column"] == "profit"


def test_ai_generate_conditional_step(client):
    csv = "status,amount\nactive,150\ninactive,50\n"
    ds_id = upload_test_csv(client, csv, "ai_cond.csv")

    res = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "if amount > 100 then 'High' else 'Low'"},
    )
    assert res.status_code == 200
    data = res.json()
    step = data["step"]
    assert step["type"] == "conditional"
    assert step["params"]["rules"][0]["column"] == "amount"
    assert step["params"]["rules"][0]["operator"] == "gt"
    assert step["params"]["rules"][0]["result"] == "High"
    assert step["params"]["else_value"] == "Low"


def test_ai_generate_date_extract_step(client):
    csv = "order_date,amount\n2024-05-12,100\n"
    ds_id = upload_test_csv(client, csv, "ai_date.csv")

    res = client.post(
        "/api/v1/ai/generate-step",
        json={"dataset_id": ds_id, "prompt": "extract year from order_date"},
    )
    assert res.status_code == 200
    data = res.json()
    step = data["step"]
    assert step["type"] == "date_transform"
    assert step["params"]["column"] == "order_date"
    assert step["params"]["operation"] == "extract_part"
    assert step["params"]["date_part"] == "year"
