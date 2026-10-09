import os
from pathlib import Path


def test_upload_csv_dataset(client):
    csv_content = "id,name,amount,active\n1,Alice,100.5,true\n2,Bob,250.0,false\n3,Charlie,75.25,true\n"
    files = {"file": ("test_data.csv", csv_content.encode("utf-8"), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 201
    data = response.json()
    assert data["row_count"] == 3
    assert data["column_count"] == 4
    assert data["name"] == "test_data"
    assert data["file_format"] == "csv"
    assert len(data["schema_metadata"]) == 4

    # Verify column types
    col_names = [c["name"] for c in data["schema_metadata"]]
    assert "id" in col_names
    assert "name" in col_names
    assert "amount" in col_names
    assert "active" in col_names


def test_get_dataset_rows_paginated(client):
    csv_content = "id,name,amount\n" + "\n".join([f"{i},User{i},{i*10.5}" for i in range(1, 51)])
    files = {"file": ("pagination.csv", csv_content.encode("utf-8"), "text/csv")}
    upload_res = client.post("/api/v1/datasets/upload", files=files)
    dataset_id = upload_res.json()["id"]

    # Request window of 10 rows
    rows_res = client.post(
        f"/api/v1/datasets/{dataset_id}/rows",
        json={"offset": 10, "limit": 10},
    )
    assert rows_res.status_code == 200
    data = rows_res.json()
    assert data["total_rows"] == 50
    assert data["filtered_rows"] == 50
    assert len(data["rows"]) == 10
    assert data["rows"][0]["id"] == 11


def test_filter_and_sort_dataset_rows(client):
    csv_content = "category,price\nFruit,5\nVeg,3\nFruit,12\nDairy,8\nFruit,2\n"
    files = {"file": ("groceries.csv", csv_content.encode("utf-8"), "text/csv")}
    upload_res = client.post("/api/v1/datasets/upload", files=files)
    dataset_id = upload_res.json()["id"]

    # Filter category == 'Fruit' and sort price DESC
    rows_res = client.post(
        f"/api/v1/datasets/{dataset_id}/rows",
        json={
            "offset": 0,
            "limit": 10,
            "filters": [{"column": "category", "operator": "eq", "value": "Fruit"}],
            "sort": [{"column": "price", "direction": "desc"}],
        },
    )
    assert rows_res.status_code == 200
    data = rows_res.json()
    assert data["filtered_rows"] == 3
    assert len(data["rows"]) == 3
    assert data["rows"][0]["price"] == 12
    assert data["rows"][1]["price"] == 5
    assert data["rows"][2]["price"] == 2


def test_upload_xlsx_dataset(client):
    import io
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sales"
    ws.append(["Region", "Sales", "Rep"])
    ws.append(["North", 1500, "Alice"])
    ws.append(["South", 2300, "Bob"])
    ws.append(["East", 950, "Charlie"])

    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)

    files = {"file": ("test_sales.xlsx", bio.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 201
    data = response.json()
    assert data["row_count"] == 3
    assert data["column_count"] == 3
    assert data["file_format"] == "xlsx"

