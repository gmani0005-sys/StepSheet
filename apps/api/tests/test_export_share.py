import io
import time
import pytest
import openpyxl


def upload_test_csv(client, content: str, name: str):
    files = {"file": (name, content.encode("utf-8"), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["id"]


def test_create_export_job_and_poll_completion(client):
    csv_data = "id,name,amount,notes\n1,Alpha,150,=calc_danger\n2,Beta,250,+sum_warning\n3,Gamma,350,@cmd_danger\n"
    ds_id = upload_test_csv(client, csv_data, "test_job_orders.csv")

    req_payload = {
        "dataset_id": ds_id,
        "formats": ["csv", "json", "parquet", "xlsx"],
        "content_blocks": ["data", "steps"],
        "row_scope": "all",
        "excluded_columns": ["notes"],
        "csv_delimiter": ",",
        "csv_encoding": "utf-8",
        "steps": [],
    }

    create_res = client.post("/api/v1/exports", json=req_payload)
    assert create_res.status_code == 201
    job_data = create_res.json()
    job_id = job_data["id"]
    assert job_data["status"] in ("pending", "processing", "completed")

    # Poll for completion (in-process thread finishes within 1-2 seconds)
    completed = False
    for _ in range(10):
        poll_res = client.get(f"/api/v1/exports/{job_id}")
        assert poll_res.status_code == 200
        poll_data = poll_res.json()
        if poll_data["status"] == "completed":
            completed = True
            break
        elif poll_data["status"] == "failed":
            pytest.fail(f"Job failed: {poll_data.get('error_message')}")
        time.sleep(0.3)

    assert completed, "Export job did not complete in time"
    assert len(poll_data["files"]) == 4

    # Verify column exclusion: 'notes' must NOT be in CSV
    csv_file_meta = next(f for f in poll_data["files"] if f["format"] == "csv")
    download_res = client.get(f"/api/v1/exports/{job_id}/files/{csv_file_meta['file_id']}")
    assert download_res.status_code == 200
    csv_content = download_res.text
    assert "notes" not in csv_content
    assert "Alpha" in csv_content
    assert "Beta" in csv_content

    # Verify JSON file
    json_file_meta = next(f for f in poll_data["files"] if f["format"] == "json")
    json_res = client.get(f"/api/v1/exports/{job_id}/files/{json_file_meta['file_id']}")
    assert json_res.status_code == 200
    assert "Alpha" in json_res.text

    # Verify XLSX values file with openpyxl
    xlsx_file_meta = next(f for f in poll_data["files"] if f["format"] == "xlsx")
    xlsx_res = client.get(f"/api/v1/exports/{job_id}/files/{xlsx_file_meta['file_id']}")
    assert xlsx_res.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_res.content))
    assert "Data" in wb.sheetnames
    ws = wb["Data"]
    headers = [c.value for c in ws[1]]
    assert "notes" not in headers
    assert "name" in headers


def test_formula_injection_escaping_in_csv(client):
    csv_data = "id,desc\n1,=HYPERLINK('http://malicious.com')\n2,+CMD|' /C calc'!A0\n3,@SUM(A1:A5)\n"
    ds_id = upload_test_csv(client, csv_data, "formula_injection_test.csv")

    req_payload = {
        "dataset_id": ds_id,
        "formats": ["csv"],
        "content_blocks": ["data"],
        "row_scope": "all",
        "excluded_columns": [],
    }

    create_res = client.post("/api/v1/exports", json=req_payload)
    assert create_res.status_code == 201
    job_id = create_res.json()["id"]

    for _ in range(10):
        poll_res = client.get(f"/api/v1/exports/{job_id}")
        poll_data = poll_res.json()
        if poll_data["status"] == "completed":
            break
        time.sleep(0.3)

    csv_file_meta = poll_data["files"][0]
    download_res = client.get(f"/api/v1/exports/{job_id}/files/{csv_file_meta['file_id']}")
    assert download_res.status_code == 200
    text = download_res.text
    # Cell values beginning with =, +, @ must be safely prefixed with apostrophe '
    assert "'=HYPERLINK" in text
    assert "'+CMD" in text
    assert "'@SUM" in text


def test_packaged_workbook_multi_tab_export(client):
    csv_data = "item_id,item_name,qty,unit_price\n101,Widget,5,20.0\n102,Gadget,3,45.5\n103,Doodad,10,12.0\n"
    ds_id = upload_test_csv(client, csv_data, "packaged_inventory.csv")

    math_step = {
        "id": "step-calc-rev",
        "type": "math_transform",
        "label": "Calculate Total Revenue",
        "enabled": True,
        "params": {
            "output_column": "total_revenue",
            "operation": "arithmetic",
            "column1": "qty",
            "column2": "unit_price",
            "math_operator": "*",
        },
    }

    req_payload = {
        "dataset_id": ds_id,
        "format": "packaged_workbook",
        "content_blocks": ["data", "steps", "lineage", "quality", "dictionary"],
        "include_formulas": True,
        "include_lineage": True,
        "include_quality": True,
        "include_dictionary": True,
        "steps": [math_step],
    }

    create_res = client.post("/api/v1/exports", json=req_payload)
    assert create_res.status_code == 201
    job_id = create_res.json()["id"]

    completed = False
    for _ in range(12):
        poll_res = client.get(f"/api/v1/exports/{job_id}")
        assert poll_res.status_code == 200
        poll_data = poll_res.json()
        if poll_data["status"] == "completed":
            completed = True
            break
        elif poll_data["status"] == "failed":
            pytest.fail(f"Packaged workbook job failed: {poll_data.get('error_message')}")
        time.sleep(0.3)

    assert completed, "Packaged workbook export job did not complete in time"
    assert len(poll_data["files"]) == 1
    xlsx_meta = poll_data["files"][0]
    assert xlsx_meta["format"] == "xlsx"
    assert "packaged_workbook.xlsx" in xlsx_meta["filename"]

    # Download file and inspect with openpyxl
    dl_res = client.get(f"/api/v1/exports/{job_id}/files/{xlsx_meta['file_id']}")
    assert dl_res.status_code == 200
    assert len(dl_res.content) > 1000

    wb = openpyxl.load_workbook(io.BytesIO(dl_res.content), data_only=False)
    sheet_names = wb.sheetnames
    assert "Output Data" in sheet_names
    assert "Formula Lineage" in sheet_names
    assert "Data Quality" in sheet_names
    assert "Data Dictionary" in sheet_names

    # Check Output Data sheet
    ws_data = wb["Output Data"]
    headers = [cell.value for cell in ws_data[1]]
    assert "item_id" in headers
    assert "item_name" in headers
    assert "qty" in headers
    assert "unit_price" in headers
    assert "total_revenue" in headers

    # Verify live formula was written to total_revenue column
    rev_col_idx = headers.index("total_revenue") + 1
    cell_formula = ws_data.cell(row=2, column=rev_col_idx).value
    assert isinstance(cell_formula, str) and cell_formula.startswith("=")
    assert "*" in cell_formula

    # Check Formula Lineage sheet
    ws_lineage = wb["Formula Lineage"]
    assert "Pipeline Lineage" in ws_lineage["A1"].value
    # Find step label in table
    step_labels = [row[1].value for row in ws_lineage.iter_rows(min_row=13) if row[1].value]
    assert "Calculate Total Revenue" in step_labels

    # Check Data Quality sheet
    ws_quality = wb["Data Quality"]
    assert "Data Quality" in ws_quality["A1"].value
    assert "Health Score" in ws_quality["A4"].value

    # Check Data Dictionary sheet
    ws_dict = wb["Data Dictionary"]
    assert "Data Dictionary" in ws_dict["A1"].value
    dict_cols = [row[1].value for row in ws_dict.iter_rows(min_row=5) if row[1].value]
    assert "item_id" in dict_cols
    assert "item_name" in dict_cols


def test_pdf_and_pptx_export_jobs(client):
    from pptx import Presentation
    from pptx.util import Inches

    csv_data = "metric_id,metric_name,value,target\n1,ARR,1250000,1000000\n2,CAC,4200,5000\n3,LTV,32000,25000\n4,NPS,72,65\n"
    ds_id = upload_test_csv(client, csv_data, "executive_kpis.csv")

    req_payload = {
        "dataset_id": ds_id,
        "formats": ["pdf", "pptx"],
        "content_blocks": ["data", "steps", "lineage", "quality"],
        "watermark": "CONFIDENTIAL",
        "confidentiality_notice": "Strictly Internal Leadership Review",
        "steps": [],
    }

    create_res = client.post("/api/v1/exports", json=req_payload)
    assert create_res.status_code == 201
    job_id = create_res.json()["id"]

    completed = False
    for _ in range(12):
        poll_res = client.get(f"/api/v1/exports/{job_id}")
        assert poll_res.status_code == 200
        poll_data = poll_res.json()
        if poll_data["status"] == "completed":
            completed = True
            break
        elif poll_data["status"] == "failed":
            pytest.fail(f"PDF/PPTX job failed: {poll_data.get('error_message')}")
        time.sleep(0.3)

    assert completed, "PDF/PPTX export job did not complete in time"
    assert len(poll_data["files"]) == 2

    # 1. Verify PDF File
    pdf_meta = next(f for f in poll_data["files"] if f["format"] == "pdf")
    pdf_res = client.get(f"/api/v1/exports/{job_id}/files/{pdf_meta['file_id']}")
    assert pdf_res.status_code == 200
    assert pdf_res.content.startswith(b"%PDF-")
    assert len(pdf_res.content) > 3000

    # 2. Verify PPTX File
    pptx_meta = next(f for f in poll_data["files"] if f["format"] == "pptx")
    pptx_res = client.get(f"/api/v1/exports/{job_id}/files/{pptx_meta['file_id']}")
    assert pptx_res.status_code == 200

    prs = Presentation(io.BytesIO(pptx_res.content))
    # Confirm 16:9 widescreen dimensions
    assert abs(prs.slide_width - Inches(13.333)) < Inches(0.01)
    assert abs(prs.slide_height - Inches(7.5)) < Inches(0.01)

    # Confirm slide count (Title, Executive Overview, Data Grid, Lineage, Quality)
    assert len(prs.slides) == 5


def test_starter_packs_and_share_pack_export(client):
    import zipfile

    csv_data = "sku,product,qty,price\nS1,Chair,10,85.0\nS2,Desk,4,220.0\nS3,Lamp,15,35.0\n"
    ds_id = upload_test_csv(client, csv_data, "starter_pack_products.csv")

    req_payload = {
        "dataset_id": ds_id,
        "formats": ["powerbi_starter", "code", "share_pack"],
        "content_blocks": ["data", "steps", "lineage", "quality"],
        "steps": [],
    }

    create_res = client.post("/api/v1/exports", json=req_payload)
    assert create_res.status_code == 201
    job_id = create_res.json()["id"]

    completed = False
    for _ in range(12):
        poll_res = client.get(f"/api/v1/exports/{job_id}")
        assert poll_res.status_code == 200
        poll_data = poll_res.json()
        if poll_data["status"] == "completed":
            completed = True
            break
        elif poll_data["status"] == "failed":
            pytest.fail(f"Starter packs job failed: {poll_data.get('error_message')}")
        time.sleep(0.3)

    assert completed, "Starter pack export job did not complete in time"
    assert len(poll_data["files"]) == 3

    # 1. Verify Power BI Starter Pack ZIP
    pbi_meta = next(f for f in poll_data["files"] if "powerbi_starter_pack.zip" in f["filename"])
    pbi_res = client.get(f"/api/v1/exports/{job_id}/files/{pbi_meta['file_id']}")
    assert pbi_res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(pbi_res.content)) as zf:
        pbi_names = zf.namelist()
        assert "data.csv" in pbi_names
        assert "pipeline_transformations.m" in pbi_names
        assert "schema_dictionary.txt" in pbi_names
        assert "README.md" in pbi_names
        assert "metadata.json" in pbi_names

    # 2. Verify Code Bundle ZIP
    code_meta = next(f for f in poll_data["files"] if "pipeline_code_bundle.zip" in f["filename"])
    code_res = client.get(f"/api/v1/exports/{job_id}/files/{code_meta['file_id']}")
    assert code_res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(code_res.content)) as zf:
        code_names = zf.namelist()
        assert "pipeline_query.sql" in code_names
        assert "pipeline_polars.py" in code_names
        assert "pipeline_transformations.m" in code_names
        assert "excel_formulas.txt" in code_names

    # 3. Verify Share Pack ZIP
    share_meta = next(f for f in poll_data["files"] if "share_pack.zip" in f["filename"])
    share_res = client.get(f"/api/v1/exports/{job_id}/files/{share_meta['file_id']}")
    assert share_res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(share_res.content)) as zf:
        share_names = zf.namelist()
        assert "README.txt" in share_names
        assert any(n.endswith(".xlsx") for n in share_names)
        assert any(n.endswith(".pdf") for n in share_names)
        assert any(n.endswith(".pptx") for n in share_names)
        assert any(n.endswith(".csv") for n in share_names)


def test_share_links_with_passcode_and_expiration(client):
    proj_res = client.post(
        "/api/v1/projects",
        json={"title": "Passcode Collab Project", "description": "Passcode link test"},
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    # 1. Create standard link (no passcode, 7 days)
    standard_res = client.post(
        f"/api/v1/projects/{proj_id}/shares",
        json={"role": "viewer", "expires_in_days": 7},
    )
    assert standard_res.status_code == 201
    std_data = standard_res.json()
    assert std_data["has_passcode"] is False
    assert std_data["expires_at"] is not None

    # Check access without passcode
    std_access = client.get(f"/api/v1/share/{std_data['token']}")
    assert std_access.status_code == 200
    assert std_access.json()["valid"] is True
    assert std_access.json()["requires_passcode"] is False

    # 2. Create passcode-protected link with never expires (expires_in_days=None)
    protected_res = client.post(
        f"/api/v1/projects/{proj_id}/shares",
        json={"role": "editor", "passcode": "SuperSecretPasscode!123"},
    )
    assert protected_res.status_code == 201
    prot_data = protected_res.json()
    assert prot_data["has_passcode"] is True
    assert prot_data["expires_at"] is None
    prot_token = prot_data["token"]

    # 3. Access without passcode -> signals requires_passcode
    no_pass_res = client.get(f"/api/v1/share/{prot_token}")
    assert no_pass_res.status_code == 200
    assert no_pass_res.json()["valid"] is False
    assert no_pass_res.json()["requires_passcode"] is True
    assert no_pass_res.json()["has_passcode"] is True

    # 4. Access with wrong passcode via query param -> 401
    wrong_query_res = client.get(f"/api/v1/share/{prot_token}?passcode=WrongPass123")
    assert wrong_query_res.status_code == 401

    # 5. Access with correct passcode via query param -> valid
    correct_query_res = client.get(f"/api/v1/share/{prot_token}?passcode=SuperSecretPasscode!123")
    assert correct_query_res.status_code == 200
    cq_data = correct_query_res.json()
    assert cq_data["valid"] is True
    assert cq_data["requires_passcode"] is False
    assert cq_data["can_edit"] is True  # editor role

    # 6. Verify via POST endpoint
    verify_bad = client.post(
        f"/api/v1/share/{prot_token}/verify",
        json={"passcode": "IncorrectPasscode"},
    )
    assert verify_bad.status_code == 401

    verify_good = client.post(
        f"/api/v1/share/{prot_token}/verify",
        json={"passcode": "SuperSecretPasscode!123"},
    )
    assert verify_good.status_code == 200
    vg_data = verify_good.json()
    assert vg_data["valid"] is True
    assert vg_data["requires_passcode"] is False
    assert vg_data["can_edit"] is True



