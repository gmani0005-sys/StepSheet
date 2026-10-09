import pytest


def test_project_versioning_and_step_diff(client):
    # 1. Create a project
    proj_res = client.post(
        "/api/v1/projects",
        json={"title": "Test Pipeline Versioning", "description": "Project for version tests"},
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    # 2. Save Version 1
    step_v1 = {
        "id": "step-1",
        "type": "math_transform",
        "label": "Net Price",
        "enabled": True,
        "params": {"operation": "custom_formula", "target_column": "net", "formula": "{amt} - {disc}"},
    }
    v1_res = client.post(
        f"/api/v1/projects/{proj_id}/versions",
        json={"message": "Initial release", "steps": [step_v1]},
    )
    assert v1_res.status_code == 201
    v1_data = v1_res.json()
    assert v1_data["version_number"] == 1
    assert len(v1_data["steps_snapshot"]) == 1

    # 3. Save Version 2 (modified step-1, added step-2)
    step_v1_mod = {
        "id": "step-1",
        "type": "math_transform",
        "label": "Net Price Updated",
        "enabled": True,
        "params": {"operation": "custom_formula", "target_column": "net_price", "formula": "{amt} - {disc}"},
    }
    step_v2_add = {
        "id": "step-2",
        "type": "filter_rows",
        "label": "Filter > 0",
        "enabled": True,
        "params": {"column": "net_price", "operator": "gt", "value": "0"},
    }
    v2_res = client.post(
        f"/api/v1/projects/{proj_id}/versions",
        json={"message": "Added filter and updated target column", "steps": [step_v1_mod, step_v2_add]},
    )
    assert v2_res.status_code == 201
    assert v2_res.json()["version_number"] == 2

    # 4. Compute Diff between v1 and v2
    diff_res = client.get(
        f"/api/v1/projects/{proj_id}/versions/diff?from_version=1&to_version=2"
    )
    assert diff_res.status_code == 200
    diff_data = diff_res.json()
    assert diff_data["from_version"] == 1
    assert diff_data["to_version"] == 2
    assert diff_data["added_count"] == 1
    assert diff_data["modified_count"] == 1
    assert diff_data["removed_count"] == 0

    added_item = next(d for d in diff_data["diff_steps"] if d["change_type"] == "added")
    assert added_item["step_id"] == "step-2"

    mod_item = next(d for d in diff_data["diff_steps"] if d["change_type"] == "modified")
    assert mod_item["step_id"] == "step-1"
    param_keys = [p["param_key"] for p in mod_item["param_diffs"]]
    assert "target_column" in param_keys or "label" in param_keys

    # 5. Restore back to Version 1
    restore_res = client.post(
        f"/api/v1/projects/{proj_id}/versions/{v1_data['id']}/restore"
    )
    assert restore_res.status_code == 200
    rdata = restore_res.json()
    assert rdata["restored_version"] == 3  # milestone v3 represents rollback to v1
    assert rdata["steps_count"] == 1


def test_sharing_and_access_roles(client):
    proj_res = client.post(
        "/api/v1/projects",
        json={"title": "Shared Collab Project", "description": "Sharing test"},
    )
    proj_id = proj_res.json()["id"]

    # 1. Create Share Link as viewer
    share_res = client.post(
        f"/api/v1/projects/{proj_id}/shares",
        json={"role": "viewer", "expires_in_days": 7},
    )
    assert share_res.status_code == 201
    sdata = share_res.json()
    token = sdata["token"]
    share_id = sdata["id"]
    assert sdata["role"] == "viewer"
    assert sdata["share_url"].startswith("/share/")

    # 2. Access via share token
    access_res = client.get(f"/api/v1/share/{token}")
    assert access_res.status_code == 200
    acc_data = access_res.json()
    assert acc_data["valid"] is True
    assert acc_data["project_id"] == proj_id
    assert acc_data["role"] == "viewer"
    assert acc_data["can_edit"] is False

    # 3. Revoke share link
    del_res = client.delete(f"/api/v1/projects/{proj_id}/shares/{share_id}")
    assert del_res.status_code == 204

    # 4. Access revoked token
    rev_res = client.get(f"/api/v1/share/{token}")
    assert rev_res.status_code == 404


def test_audit_trail_logging(client):
    proj_res = client.post(
        "/api/v1/projects",
        json={"title": "Audited Project", "description": "Audit trail test"},
    )
    proj_id = proj_res.json()["id"]

    # Create a version (generates audit log entry)
    client.post(
        f"/api/v1/projects/{proj_id}/versions",
        json={"message": "Audit milestone test", "steps": []},
    )

    # Fetch audit logs
    audit_res = client.get(f"/api/v1/projects/{proj_id}/audit")
    assert audit_res.status_code == 200
    adata = audit_res.json()
    assert adata["total"] >= 1
    actions = [item["action"] for item in adata["items"]]
    assert "version_created" in actions
