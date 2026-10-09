import pytest


def upload_test_csv(client, content: str, name: str):
    files = {"file": (name, content.encode("utf-8"), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["id"]


def test_quality_not_null_and_unique_rules(client):
    csv = "order_id,amount\n1,100\n2,200\n2,\n"
    ds_id = upload_test_csv(client, csv, "quality_test1.csv")

    rules = [
        {
            "id": "r1",
            "rule_type": "not_null",
            "column": "amount",
            "label": "amount not null",
            "severity": "error",
        },
        {
            "id": "r2",
            "rule_type": "unique",
            "column": "order_id",
            "label": "order_id unique",
            "severity": "error",
        },
    ]

    res = client.post(
        "/api/v1/quality/check",
        json={"dataset_id": ds_id, "rules": rules},
    )
    assert res.status_code == 200
    report = res.json()
    assert report["total_rules"] == 2
    assert report["failed_count"] == 2
    assert report["health_score"] == 0.0

    r1_res = next(r for r in report["results"] if r["rule_id"] == "r1")
    assert r1_res["status"] == "fail"
    assert r1_res["failed_rows_count"] == 1

    r2_res = next(r for r in report["results"] if r["rule_id"] == "r2")
    assert r2_res["status"] == "fail"
    assert r2_res["failed_rows_count"] == 2


def test_quality_range_and_allowed_values(client):
    csv = "status,amount\nactive,150\npending,45\nrejected,-10\ninvalid_status,90\n"
    ds_id = upload_test_csv(client, csv, "quality_test2.csv")

    rules = [
        {
            "id": "r_range",
            "rule_type": "range",
            "column": "amount",
            "label": "amount >= 0",
            "severity": "warning",
            "params": {"min": 0},
        },
        {
            "id": "r_allowed",
            "rule_type": "allowed_values",
            "column": "status",
            "label": "valid status values",
            "severity": "error",
            "params": {"allowed_values": ["active", "pending", "rejected"]},
        },
    ]

    res = client.post(
        "/api/v1/quality/check",
        json={"dataset_id": ds_id, "rules": rules},
    )
    assert res.status_code == 200
    report = res.json()
    assert report["failed_count"] == 2
    # r_range fails on -10
    r_range = next(r for r in report["results"] if r["rule_id"] == "r_range")
    assert r_range["status"] == "fail"
    assert r_range["failed_rows_count"] == 1
    # r_allowed fails on invalid_status
    r_allowed = next(r for r in report["results"] if r["rule_id"] == "r_allowed")
    assert r_allowed["status"] == "fail"
    assert r_allowed["failed_rows_count"] == 1


def test_quality_quick_audit(client):
    csv = "order_id,customer_email,amount\n101,a@example.com,50\n102,b@example.com,75\n"
    ds_id = upload_test_csv(client, csv, "quality_quick.csv")

    res = client.post(f"/api/v1/quality/quick-audit/{ds_id}")
    assert res.status_code == 200
    report = res.json()
    assert report["total_rules"] >= 2
    assert report["health_score"] == 100.0
    assert report["passed_count"] == report["total_rules"]


def test_export_failing_rows_csv(client):
    csv = "id,score\n1,50\n2,-5\n3,80\n"
    ds_id = upload_test_csv(client, csv, "quality_fail_export.csv")

    rule = {
        "id": "r1",
        "rule_type": "range",
        "column": "score",
        "label": "score must be >= 0",
        "params": {"min": 0},
    }

    res = client.post(
        "/api/v1/quality/export-failing-rows",
        json={"dataset_id": ds_id, "rules": [rule]},
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    csv_text = res.content.decode("utf-8")
    assert "-5" in csv_text
