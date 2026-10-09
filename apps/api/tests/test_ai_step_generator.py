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
