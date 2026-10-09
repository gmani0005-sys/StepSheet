import io
import pytest
import openpyxl


def upload_test_csv(client, content: str, name: str):
    files = {"file": (name, content.encode("utf-8"), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["id"]


def test_export_excel_with_live_formulas_and_documentation(client):
    csv = "order_id,amount,discount\n1,100,10\n2,200,30\n"
    ds_id = upload_test_csv(client, csv, "export_orders.csv")

    step = {
        "id": "s1",
        "type": "math_transform",
        "label": "Calculate discounted = amount - discount",
        "enabled": True,
        "params": {
            "operation": "arithmetic",
            "column1": "amount",
            "column2": "discount",
            "math_operator": "-",
            "output_column": "discounted",
        },
    }

    res = client.post(
        "/api/v1/export/excel",
        json={
            "dataset_id": ds_id,
            "steps": [step],
            "include_formulas": True,
            "include_documentation": True,
        },
    )
    assert res.status_code == 200
    assert "spreadsheetml" in res.headers["content-type"]

    # Verify the generated workbook using openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(res.content), data_only=False)
    assert "Data" in wb.sheetnames
    assert "Documentation" in wb.sheetnames

    ws_data = wb["Data"]
    # Check headers
    headers = [cell.value for cell in ws_data[1]]
    assert "order_id" in headers
    assert "amount" in headers
    assert "discount" in headers
    assert "discounted" in headers

    # Check cell formula in discounted column (column D, row 2)
    disc_col_idx = headers.index("discounted") + 1
    cell_formula = ws_data.cell(row=2, column=disc_col_idx).value
    # Formula should be '=B2 - C2'
    assert str(cell_formula).startswith("=")
    assert "-" in str(cell_formula)

    # Check Documentation sheet
    ws_doc = wb["Documentation"]
    assert "StepSheet Pipeline Transformation Audit Trail" in ws_doc["A1"].value
    assert "Calculate discounted = amount - discount" in ws_doc["B5"].value


def test_export_csv_and_parquet_and_json(client):
    csv = "id,val\n1,hello\n2,world\n"
    ds_id = upload_test_csv(client, csv, "export_formats.csv")

    # CSV Export
    res_csv = client.post("/api/v1/export/csv", json={"dataset_id": ds_id, "steps": []})
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert "hello" in res_csv.content.decode("utf-8")

    # Parquet Export
    res_parquet = client.post("/api/v1/export/parquet", json={"dataset_id": ds_id, "steps": []})
    assert res_parquet.status_code == 200
    assert len(res_parquet.content) > 0

    # JSON Export
    res_json = client.post("/api/v1/export/json", json={"dataset_id": ds_id, "steps": []})
    assert res_json.status_code == 200
    json_data = res_json.json()
    assert len(json_data) == 2
    assert json_data[0]["val"] == "hello"


def test_export_code_bundle(client):
    csv = "id,price,qty\n1,10,2\n"
    ds_id = upload_test_csv(client, csv, "export_code.csv")

    step = {
        "id": "s1",
        "type": "math_transform",
        "label": "Total = price * qty",
        "enabled": True,
        "params": {
            "operation": "arithmetic",
            "column1": "price",
            "column2": "qty",
            "math_operator": "*",
            "output_column": "total",
        },
    }

    res = client.post("/api/v1/export/code", json={"dataset_id": ds_id, "steps": [step]})
    assert res.status_code == 200
    bundle = res.json()
    assert "sql" in bundle and "SELECT" in bundle["sql"]
    assert "power_query_m" in bundle and "let" in bundle["power_query_m"]
    assert "polars" in bundle and "import polars as pl" in bundle["polars"]


def test_run_full_pipeline(client):
    csv = "id,val\n1,10\n2,20\n3,30\n"
    ds_id = upload_test_csv(client, csv, "export_run_full.csv")

    res = client.post("/api/v1/export/run-full", json={"dataset_id": ds_id, "steps": []})
    assert res.status_code == 200
    data = res.json()
    assert data["total_rows"] == 3
    assert data["status"] == "success"
    assert data["execution_time_ms"] >= 0
