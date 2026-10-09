import pytest


def upload_test_csv(client, content: str, name: str):
    files = {"file": (name, content.encode("utf-8"), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["id"]


def test_pre_join_health_check_cardinality(client):
    # Left: orders with duplicate customer IDs (many-to-one)
    orders_csv = "order_id,cust_id,amount\nO1,C1,100\nO2,C1,150\nO3,C2,200\nO4,C3,50\n"
    # Right: customers with unique IDs
    cust_csv = "cust_id,name\nC1,Alice\nC2,Bob\nC4,Charlie\n"

    left_id = upload_test_csv(client, orders_csv, "orders_health.csv")
    right_id = upload_test_csv(client, cust_csv, "cust_health.csv")

    health_res = client.post(
        "/api/v1/joins/health-check",
        json={
            "left_dataset_id": left_id,
            "right_dataset_id": right_id,
            "key_pairs": [{"left_col": "cust_id", "right_col": "cust_id"}],
            "join_type": "left",
        },
    )
    assert health_res.status_code == 200
    data = health_res.json()
    assert data["left_row_count"] == 4
    assert data["right_row_count"] == 3
    # Many-to-one verdict
    assert data["cardinality"] == "many-to-one"
    assert data["estimated_match_rate"] > 0


def test_pre_join_fanout_warning_many_to_many(client):
    # Left has duplicates on key
    left_csv = "k,val_l\n1,A\n1,B\n2,C\n"
    # Right also has duplicates on key
    right_csv = "k,val_r\n1,X\n1,Y\n3,Z\n"

    left_id = upload_test_csv(client, left_csv, "m2m_left.csv")
    right_id = upload_test_csv(client, right_csv, "m2m_right.csv")

    health_res = client.post(
        "/api/v1/joins/health-check",
        json={
            "left_dataset_id": left_id,
            "right_dataset_id": right_id,
            "key_pairs": [{"left_col": "k", "right_col": "k"}],
            "join_type": "left",
        },
    )
    assert health_res.status_code == 200
    data = health_res.json()
    assert data["cardinality"] == "many-to-many"
    assert data["fanout_warning"] is not None
    assert "Fan-out Warning" in data["fanout_warning"]


def test_step_xlookup(client):
    orders_csv = "order_id,cust_id\nO1,C10\nO2,C20\nO3,C99\n"
    cust_csv = "id,name,city\nC10,Acme Corp,New York\nC20,Globex,London\n"

    orders_id = upload_test_csv(client, orders_csv, "orders_xlookup.csv")
    cust_id = upload_test_csv(client, cust_csv, "cust_xlookup.csv")

    steps = [
        {
            "id": "s1",
            "type": "xlookup",
            "label": "Bring Name from Customers",
            "enabled": True,
            "params": {
                "lookup_dataset_id": cust_id,
                "left_key_col": "cust_id",
                "right_key_col": "id",
                "return_columns": ["name", "city"],
                "if_not_found": "Unknown",
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": orders_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 3
    # Check returned values
    r1 = data["rows"][0]
    assert r1["name"] == "Acme Corp"
    assert r1["city"] == "New York"
    # Unmatched C99 row should have fallback value
    r3 = data["rows"][2]
    assert r3["name"] == "Unknown"
    assert r3["city"] == "Unknown"


def test_step_append_union(client):
    t1_csv = "id,name\n1,Alice\n2,Bob\n"
    t2_csv = "id,name\n3,Charlie\n4,David\n"

    t1_id = upload_test_csv(client, t1_csv, "t1_append.csv")
    t2_id = upload_test_csv(client, t2_csv, "t2_append.csv")

    steps = [
        {
            "id": "s1",
            "type": "append",
            "label": "Stack tables",
            "enabled": True,
            "params": {"append_dataset_id": t2_id, "union_type": "all"},
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": t1_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 4
    names = [r["name"] for r in data["rows"]]
    assert names == ["Alice", "Bob", "Charlie", "David"]


def test_step_join_inner(client):
    l_csv = "id,dept\n1,Sales\n2,Eng\n3,HR\n"
    r_csv = "id,mgr\n1,Alice\n2,Bob\n4,David\n"

    l_id = upload_test_csv(client, l_csv, "l_inner.csv")
    r_id = upload_test_csv(client, r_csv, "r_inner.csv")

    steps = [
        {
            "id": "s1",
            "type": "join",
            "label": "Inner Join",
            "enabled": True,
            "params": {
                "right_dataset_id": r_id,
                "join_type": "inner",
                "key_pairs": [{"left_col": "id", "right_col": "id"}],
                "selected_right_columns": ["mgr"],
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": l_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 2  # IDs 1 and 2 match
    assert "mgr" in [c["name"] for c in data["columns"]]


def test_step_join_left(client):
    l_csv = "id,dept\n1,Sales\n2,Eng\n3,HR\n"
    r_csv = "id,mgr\n1,Alice\n2,Bob\n"

    l_id = upload_test_csv(client, l_csv, "l_left.csv")
    r_id = upload_test_csv(client, r_csv, "r_left.csv")

    steps = [
        {
            "id": "s1",
            "type": "join",
            "label": "Left Join",
            "enabled": True,
            "params": {
                "right_dataset_id": r_id,
                "join_type": "left",
                "key_pairs": [{"left_col": "id", "right_col": "id"}],
                "selected_right_columns": ["mgr"],
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": l_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 3  # all 3 left rows preserved
    assert data["rows"][2]["mgr"] is None  # HR has null mgr


def test_step_join_left_anti(client):
    l_csv = "id,item\n101,Book\n102,Pen\n103,Ruler\n"
    r_csv = "id,sold\n101,true\n103,true\n"

    l_id = upload_test_csv(client, l_csv, "l_anti.csv")
    r_id = upload_test_csv(client, r_csv, "r_anti.csv")

    steps = [
        {
            "id": "s1",
            "type": "join",
            "label": "Left Anti (Missing records)",
            "enabled": True,
            "params": {
                "right_dataset_id": r_id,
                "join_type": "left_anti",
                "key_pairs": [{"left_col": "id", "right_col": "id"}],
                "selected_right_columns": [],
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": l_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 1
    assert data["rows"][0]["item"] == "Pen"  # only Pen (102) was not sold!


def test_step_join_left_semi(client):
    l_csv = "id,product\n1,Apple\n2,Banana\n3,Cherry\n"
    r_csv = "id,inventory\n1,100\n3,50\n"

    l_id = upload_test_csv(client, l_csv, "l_semi.csv")
    r_id = upload_test_csv(client, r_csv, "r_semi.csv")

    steps = [
        {
            "id": "s1",
            "type": "join",
            "label": "Left Semi Join",
            "enabled": True,
            "params": {
                "right_dataset_id": r_id,
                "join_type": "left_semi",
                "key_pairs": [{"left_col": "id", "right_col": "id"}],
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": l_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 2  # Apple and Cherry kept
    col_names = [c["name"] for c in data["columns"]]
    # Semi join does NOT add right columns
    assert "inventory" not in col_names


def test_step_join_cross(client):
    l_csv = "size\nS\nM\n"
    r_csv = "color\nRed\nBlue\nGreen\n"

    l_id = upload_test_csv(client, l_csv, "l_cross.csv")
    r_id = upload_test_csv(client, r_csv, "r_cross.csv")

    steps = [
        {
            "id": "s1",
            "type": "join",
            "label": "Cross Join",
            "enabled": True,
            "params": {
                "right_dataset_id": r_id,
                "join_type": "cross",
                "selected_right_columns": ["color"],
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": l_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    # 2 sizes * 3 colors = 6 rows
    assert data["filtered_rows"] == 6


def test_step_append_union_by_name_mismatched_columns(client):
    t1_csv = "id,name,role\n1,Alice,Admin\n2,Bob,User\n"
    t2_csv = "id,name,department\n3,Charlie,Engineering\n4,David,Sales\n"

    t1_id = upload_test_csv(client, t1_csv, "t1_mismatch.csv")
    t2_id = upload_test_csv(client, t2_csv, "t2_mismatch.csv")

    steps = [
        {
            "id": "s1",
            "type": "append",
            "label": "Stack tables with name alignment",
            "enabled": True,
            "params": {
                "append_dataset_id": t2_id,
                "union_type": "all",
                "alignment_mode": "by_name",
            },
        }
    ]

    res = client.post(
        "/api/v1/pipelines/preview",
        json={"dataset_id": t1_id, "steps": steps, "offset": 0, "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filtered_rows"] == 4
    col_names = [c["name"] for c in data["columns"]]
    assert "role" in col_names
    assert "department" in col_names
    # Rows 1 and 2 should have department as None
    assert data["rows"][0]["department"] is None
    # Rows 3 and 4 should have role as None
    assert data["rows"][2]["role"] is None
    assert data["rows"][2]["department"] == "Engineering"
