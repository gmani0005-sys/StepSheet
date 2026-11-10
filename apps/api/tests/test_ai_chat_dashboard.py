import pytest
import os
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.user import User
from app.services.duckdb_engine import DuckDBEngine
from app.services.credit_ledger import credit_ledger

client = TestClient(app)


@pytest.fixture(scope="module")
def setup_test_dataset():
    db = SessionLocal()
    engine_duck = DuckDBEngine()

    user = db.query(User).first()
    if not user:
        user = User(id="test-ai-user-1", email="ai_user@example.com", hashed_password="pw")
        db.add(user)
        db.commit()

    csv_data = """Region,Category,Sales,Profit,OrderDate
North,Electronics,1000,200,2026-01-01
North,Furniture,500,50,2026-01-02
South,Electronics,1200,250,2026-01-03
South,Furniture,800,100,2026-01-04
West,Electronics,1500,300,2026-01-05
"""
    os.makedirs("storage/test", exist_ok=True)
    csv_path = "storage/test/test_ai_data.csv"
    parquet_path = "storage/test/test_ai_data.parquet"
    with open(csv_path, "w") as f:
        f.write(csv_data)

    row_count, col_count, cols = engine_duck.ingest_file_to_parquet(csv_path, parquet_path, "csv")

    dataset_id = "test-ai-ds-" + str(uuid.uuid4())[:8]
    ds = Dataset(
        id=dataset_id,
        name="AI Test Sales",
        original_filename="test_ai_data.csv",
        file_format="csv",
        file_path=csv_path,
        parquet_path=parquet_path,
        owner_id=user.id,
        row_count=row_count,
        column_count=col_count,
        schema_metadata=[c.model_dump() for c in cols],
    )
    db.add(ds)
    db.commit()
    db.close()

    yield dataset_id


def test_local_ai_system_check():
    response = client.get("/api/v1/ai/local/system-check")
    assert response.status_code == 200
    data = response.json()
    assert "hardware" in data
    assert "total_ram_gb" in data["hardware"]
    assert "cpu_cores" in data["hardware"]
    assert "ollama_installed" in data
    assert "ollama_running" in data


def test_models_catalog():
    response = client.get("/api/v1/ai/local/models-catalog")
    assert response.status_code == 200
    catalog = response.json()
    assert len(catalog) >= 5
    tags = [m["tag"] for m in catalog]
    assert "llama3.2:3b" in tags
    assert "qwen2.5:1.5b" in tags


def test_credit_ledger_entitlements():
    response = client.get("/api/v1/ai/local/entitlements?provider=ollama")
    assert response.status_code == 200
    ent = response.json()
    assert ent["is_unlimited"] is True
    assert ent["credits_remaining"] == 999999
    assert ent["can_execute"] is True


def test_chat_query_aggregation(setup_test_dataset):
    dataset_id = setup_test_dataset
    req = {
        "dataset_id": dataset_id,
        "prompt": "What are the sales by region?",
    }
    response = client.post("/api/v1/ai/chat-query", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["row_count"] > 0
    assert "Region" in data["columns"]
    assert any("Sales" in col for col in data["columns"])
    assert len(data["rows"]) == 3
    assert data["query_trace"].startswith("SELECT ")


def test_chat_query_trend(setup_test_dataset):
    dataset_id = setup_test_dataset
    req = {
        "dataset_id": dataset_id,
        "prompt": "Show sales trend over time",
    }
    response = client.post("/api/v1/ai/chat-query", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["plan"]["intent"] == "trend"
    assert data["chart"]["type"] == "line"
    assert len(data["rows"]) == 5


def test_generate_interactive_dashboard(setup_test_dataset):
    dataset_id = setup_test_dataset
    req = {
        "dataset_id": dataset_id,
        "prompt": "Build me a complete dashboard for this dataset",
    }
    response = client.post("/api/v1/ai/generate-dashboard", json=req)
    assert response.status_code == 200
    data = response.json()
    plan = data["plan"]
    assert len(plan["kpis"]) >= 2
    assert len(plan["visuals"]) >= 3
    assert len(plan["slicer_columns"]) >= 1
    assert "Region" in plan["slicer_columns"] or "Category" in plan["slicer_columns"]


def test_patch_dashboard_operations(setup_test_dataset):
    dataset_id = setup_test_dataset
    # Generate initial dashboard
    gen_resp = client.post(
        "/api/v1/ai/generate-dashboard",
        json={"dataset_id": dataset_id, "prompt": "Build dashboard"},
    )
    initial_plan = gen_resp.json()["plan"]
    initial_vis_count = len(initial_plan["visuals"])

    # Patch 1: Add trend chart
    patch1 = client.post(
        "/api/v1/ai/patch-dashboard",
        json={
            "dataset_id": dataset_id,
            "prompt": "Add a trend chart over OrderDate",
            "current_dashboard": initial_plan,
        },
    )
    assert patch1.status_code == 200
    p1_data = patch1.json()
    assert p1_data["patch"]["operation"] == "add_visual"
    assert len(p1_data["updated_dashboard"]["visuals"]) == initial_vis_count + 1

    # Patch 2: Add slicer
    patch2 = client.post(
        "/api/v1/ai/patch-dashboard",
        json={
            "dataset_id": dataset_id,
            "prompt": "Add OrderDate slicer",
            "current_dashboard": p1_data["updated_dashboard"],
        },
    )
    assert patch2.status_code == 200
    p2_data = patch2.json()
    assert p2_data["patch"]["operation"] == "add_slicer"
    assert "OrderDate" in p2_data["updated_dashboard"]["slicer_columns"]


def test_client_side_dataset_generate_dashboard():
    # Tests dataset that does not pre-exist in backend database
    req = {
        "dataset_id": "client-local-orders-123",
        "prompt": "Create an executive revenue dashboard",
        "dataset_name": "Local Orders",
        "columns": [
            {"name": "Region", "data_type": "text"},
            {"name": "Product", "data_type": "text"},
            {"name": "Revenue", "data_type": "float"},
            {"name": "OrderDate", "data_type": "date"},
        ],
        "sample_rows": [
            {"Region": "North", "Product": "Apples", "Revenue": 1500, "OrderDate": "2026-01-01"},
            {"Region": "South", "Product": "Bananas", "Revenue": 2200, "OrderDate": "2026-01-02"},
        ],
    }
    resp = client.post("/api/v1/ai/generate-dashboard", json=req)
    assert resp.status_code == 200
    plan = resp.json()["plan"]
    assert plan["dataset_id"] == "client-local-orders-123"
    assert len(plan["kpis"]) >= 2
    assert len(plan["visuals"]) >= 3


def test_client_side_dataset_chat_query():
    # Tests chat query against client-side sample rows in DuckDB
    req = {
        "dataset_id": "client-local-orders-123",
        "prompt": "What are the sales by region?",
        "dataset_name": "Local Orders",
        "columns": [
            {"name": "Region", "data_type": "text"},
            {"name": "Revenue", "data_type": "float"},
        ],
        "sample_rows": [
            {"Region": "North", "Revenue": 1500},
            {"Region": "South", "Revenue": 2200},
        ],
    }
    resp = client.post("/api/v1/ai/chat-query", json=req)
    assert resp.status_code == 200
    data = resp.json()
    assert data["row_count"] == 2
    assert "columns" in data
    assert "rows" in data

