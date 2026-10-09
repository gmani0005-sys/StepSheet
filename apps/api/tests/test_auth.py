def test_register_user(client):
    response = client.post(
        "/api/v1/auth/join",
        json={"email": "newanalyst@example.com", "password": "Password123!", "full_name": "New Analyst"},
    )
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "newanalyst@example.com"
    assert data["user"]["full_name"] == "New Analyst"


def test_register_duplicate_email(client):
    client.post(
        "/api/v1/auth/join",
        json={"email": "dup@example.com", "password": "Password123!", "full_name": "First User"},
    )
    response = client.post(
        "/api/v1/auth/join",
        json={"email": "dup@example.com", "password": "Password456!", "full_name": "Second User"},
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_login_successful(client):
    client.post(
        "/api/v1/auth/join",
        json={"email": "loginuser@example.com", "password": "SecretPassword1!", "full_name": "Login User"},
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "loginuser@example.com", "password": "SecretPassword1!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "loginuser@example.com"


def test_login_invalid_password(client):
    client.post(
        "/api/v1/auth/join",
        json={"email": "badpass@example.com", "password": "RightPassword1!"},
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "badpass@example.com", "password": "WrongPassword!"},
    )
    assert response.status_code == 401


def test_refresh_token(client):
    join_res = client.post(
        "/api/v1/auth/join",
        json={"email": "refresh@example.com", "password": "Password123!"},
    )
    refresh_token = join_res.json()["refresh_token"]

    refresh_res = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_res.status_code == 200
    assert "access_token" in refresh_res.json()
