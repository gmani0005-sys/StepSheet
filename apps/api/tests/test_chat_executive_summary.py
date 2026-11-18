"""Chat with Data: "executive summary" answers with findings over every row."""
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import Base, engine
from app.services.executive_summary import is_findings_query

client = TestClient(app)

COLS = [
    {"name": "order_id", "data_type": "text"},
    {"name": "customer_id", "data_type": "text"},
    {"name": "order_date", "data_type": "date"},
    {"name": "region", "data_type": "text"},
    {"name": "product", "data_type": "text"},
    {"name": "amount", "data_type": "float"},
]


def _rows(n=300, amount=lambda i: 10 + i % 7):
    regions = ["North", "South", "East", "West"]
    products = ["Desk", "Lamp", "Chair"]
    return [
        {
            "order_id": f"ORD-{i:05d}",
            "customer_id": f"CUST-{i % 20:03d}",
            "order_date": f"2025-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}",
            "region": regions[i % 4],
            "product": products[i % 3],
            "amount": amount(i),
        }
        for i in range(n)
    ]


def _ask(prompt, rows, cols=COLS):
    Base.metadata.create_all(bind=engine)
    res = client.post(
        "/api/v1/ai/chat-query",
        json={"dataset_id": "local-ds-exec", "prompt": prompt, "columns": cols, "sample_rows": rows, "dataset_name": "orders"},
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_recognises_summary_questions():
    for p in ["executive summary of this data", "Give me the executive summary", "key findings", "overview of this dataset", "top insights"]:
        assert is_findings_query(p), p
    assert not is_findings_query("total amount by region")


def test_executive_summary_uses_every_row_and_skips_identifier_columns():
    rows = _rows()
    body = _ask("give me the executive summary of this data", rows)
    assert body["plan"]["intent"] == "summary"
    true_total = sum(r["amount"] for r in rows)
    first = body["rows"][0]
    assert first["Key Dimension / Metric"] == "Total Amount"
    assert first["Details & Volume"].startswith("300 records")
    assert f"{true_total / 1e3:.1f}K" == first["Top Finding"]
    found_cols = " ".join(r["Key Dimension / Metric"] for r in body["rows"])
    assert "Order Id" not in found_cols  # an identifier is not a category
    assert "ORD-" not in body["explanation"]
    assert "Region" in found_cols and "Product" in found_cols
    assert "$" not in body["explanation"]  # no currency guessed from "amount"
    assert "###" in body["explanation"]  # markdown, rendered by the chat


def test_currency_shown_and_parsed_when_the_data_has_it():
    rows = _rows(40, amount=lambda i: f"₹{1000 + i:,}")
    body = _ask("executive summary", rows)
    total = sum(1000 + i for i in range(40))
    assert body["rows"][0]["Top Finding"] == f"₹{total / 1e3:.1f}K"


def test_rupee_amounts_are_summed_not_zeroed():
    rows = [{"region": "North", "amount": "₹1,200"}, {"region": "North", "amount": "₹800"}, {"region": "South", "amount": ""}]
    cols = [{"name": "region", "data_type": "text"}, {"name": "amount", "data_type": "float"}]
    body = _ask("total amount by region", rows, cols)
    by_region = {r["region"]: list(r.values())[1] for r in body["rows"]}
    assert by_region["North"] == 2000


def test_total_of_a_measure_by_group_is_a_sum_not_a_row_count():
    rows = [{"region": "North", "amount": 1200.0}, {"region": "North", "amount": 800.0}, {"region": "South", "amount": 5.0}]
    cols = [{"name": "region", "data_type": "text"}, {"name": "amount", "data_type": "float"}]
    body = _ask("total amount by region", rows, cols)
    by_region = {r["region"]: list(r.values())[1] for r in body["rows"]}
    assert by_region == {"North": 2000.0, "South": 5.0}
