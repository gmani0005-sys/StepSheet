def test_dataset_column_profiling(client):
    csv_content = """age,country,score
25,USA,85.5
30,Canada,92.0
25,USA,
40,,78.0
,UK,88.5
"""
    files = {"file": ("profile_test.csv", csv_content.encode("utf-8"), "text/csv")}
    upload_res = client.post("/api/v1/datasets/upload", files=files)
    dataset_id = upload_res.json()["id"]

    prof_res = client.get(f"/api/v1/profiling/{dataset_id}")
    assert prof_res.status_code == 200
    data = prof_res.json()
    assert data["total_rows"] == 5
    assert data["total_columns"] == 3

    # Check profiles for each column
    profiles_by_name = {c["column_name"]: c for c in data["columns"]}

    # Age column checks
    age_prof = profiles_by_name["age"]
    assert age_prof["total_count"] == 5
    assert age_prof["null_count"] == 1
    assert age_prof["null_percentage"] == 20.0
    assert age_prof["min_value"] == 25
    assert age_prof["max_value"] == 40
    assert age_prof["data_type"] in ["integer", "float"]

    # Country column checks
    country_prof = profiles_by_name["country"]
    assert country_prof["null_count"] == 1
    assert country_prof["null_percentage"] == 20.0
    # Top values should have USA at top
    top_vals = [tv["value"] for tv in country_prof["top_values"]]
    assert "USA" in top_vals


def test_single_column_profile(client):
    csv_content = "val\n10\n20\n30\n40\n50\n"
    files = {"file": ("col_test.csv", csv_content.encode("utf-8"), "text/csv")}
    upload_res = client.post("/api/v1/datasets/upload", files=files)
    dataset_id = upload_res.json()["id"]

    col_res = client.get(f"/api/v1/profiling/{dataset_id}/column/val")
    assert col_res.status_code == 200
    col_data = col_res.json()
    assert col_data["column_name"] == "val"
    assert col_data["null_count"] == 0
    assert col_data["distinct_count"] == 5
    assert col_data["min_value"] == 10
    assert col_data["max_value"] == 50
    assert col_data["mean_value"] == 30.0
    assert col_data["histogram"] is not None
    assert len(col_data["histogram"]) == 10
