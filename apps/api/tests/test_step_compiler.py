import pytest


def upload_test_dataset(client, csv_content: str, name: str = "test.csv"):
    files = {"file": (name, csv_content.encode("utf-8"), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["id"]


def test_step_change_type(client):
    csv = "id,val\n1,100\n2,200\n3,300\n"
    ds_id = upload_test_dataset(client, csv)

    steps = [
        {
            "id": "s1",
            "type": "change_type",
            "label": "Change val to integer",
            "enabled": True,
            "params": {"column": "val", "target_type": "integer"},
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 3
    col = next(c for c in data["columns"] if c["name"] == "val")
    assert col["data_type"] == "integer"


def test_step_rename_column(client):
    csv = "id,old_title\n1,Alpha\n2,Beta\n"
    ds_id = upload_test_dataset(client, csv)

    steps = [
        {
            "id": "s1",
            "type": "rename_column",
            "label": "Rename column",
            "enabled": True,
            "params": {"column": "old_title", "new_name": "new_title"},
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    col_names = [c["name"] for c in data["columns"]]
    assert "new_title" in col_names
    assert "old_title" not in col_names
    assert data["rows"][0]["new_title"] == "Alpha"


def test_step_filter_rows(client):
    csv = "category,qty\nA,5\nB,15\nA,20\nC,8\n"
    ds_id = upload_test_dataset(client, csv)

    steps = [
        {
            "id": "s1",
            "type": "filter_rows",
            "label": "Filter qty > 10",
            "enabled": True,
            "params": {"column": "qty", "operator": "gt", "value": 10},
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 2
    assert all(r["qty"] > 10 for r in data["rows"])


def test_step_sort_rows(client):
    csv = "item,priority\nX,2\nY,1\nZ,3\n"
    ds_id = upload_test_dataset(client, csv)

    steps = [
        {
            "id": "s1",
            "type": "sort_rows",
            "label": "Sort by priority desc",
            "enabled": True,
            "params": {"column": "priority", "direction": "desc"},
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["rows"][0]["item"] == "Z"
    assert data["rows"][1]["item"] == "X"
    assert data["rows"][2]["item"] == "Y"


def test_step_remove_duplicates(client):
    csv = "user,score\nAlice,10\nBob,20\nAlice,30\n"
    ds_id = upload_test_dataset(client, csv)

    steps = [
        {
            "id": "s1",
            "type": "remove_duplicates",
            "label": "Deduplicate by user keep first",
            "enabled": True,
            "params": {"columns": ["user"], "keep": "first"},
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 2
    alice_row = next(r for r in data["rows"] if r["user"] == "Alice")
    assert alice_row["score"] == 10  # kept first


def test_step_fill_down(client):
    csv = "dept,employee\nEngineering,Alice\n,Bob\n,Charlie\nSales,David\n"
    ds_id = upload_test_dataset(client, csv)

    steps = [
        {
            "id": "s1",
            "type": "fill_down",
            "label": "Fill down dept",
            "enabled": True,
            "params": {"column": "dept", "direction": "down"},
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["rows"][0]["dept"] == "Engineering"
    assert data["rows"][1]["dept"] == "Engineering"
    assert data["rows"][2]["dept"] == "Engineering"
    assert data["rows"][3]["dept"] == "Sales"


def test_step_replace_values(client):
    csv = "status,code\nActive,1\nPending,2\nActive,1\n"
    ds_id = upload_test_dataset(client, csv)

    steps = [
        {
            "id": "s1",
            "type": "replace_values",
            "label": "Replace Active with Live",
            "enabled": True,
            "params": {
                "column": "status",
                "search_value": "Active",
                "replace_value": "Live",
                "match_type": "exact",
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["rows"][0]["status"] == "Live"
    assert data["rows"][1]["status"] == "Pending"
    assert data["rows"][2]["status"] == "Live"


def test_step_split_column(client):
    csv = "full_name\nJohn Doe\nJane Smith\n"
    ds_id = upload_test_dataset(client, csv)

    steps = [
        {
            "id": "s1",
            "type": "split_column",
            "label": "Split full_name",
            "enabled": True,
            "params": {
                "column": "full_name",
                "delimiter": " ",
                "new_column_names": ["first_name", "last_name"],
                "keep_original": False,
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    col_names = [c["name"] for c in data["columns"]]
    assert "first_name" in col_names
    assert "last_name" in col_names
    assert data["rows"][0]["first_name"] == "John"
    assert data["rows"][0]["last_name"] == "Doe"


def test_chained_pipeline_with_disabled_step(client):
    csv = "id,name,amount\n1,Alice,100\n2,Bob,50\n3,Charlie,200\n"
    ds_id = upload_test_dataset(client, csv)

    steps = [
        {
            "id": "s1",
            "type": "filter_rows",
            "label": "Filter amount > 60",
            "enabled": True,
            "params": {"column": "amount", "operator": "gt", "value": 60},
        },
        {
            "id": "s2",
            "type": "rename_column",
            "label": "Rename name to customer",
            "enabled": False,  # disabled step should be skipped!
            "params": {"column": "name", "new_name": "customer"},
        },
        {
            "id": "s3",
            "type": "sort_rows",
            "label": "Sort amount desc",
            "enabled": True,
            "params": {"column": "amount", "direction": "desc"},
        },
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": ds_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 2
    # s2 was disabled so column is still "name"
    assert "name" in [c["name"] for c in data["columns"]]
    # s3 sorted desc so Charlie (200) comes first, then Alice (100)
    assert data["rows"][0]["name"] == "Charlie"
    assert data["rows"][1]["name"] == "Alice"
