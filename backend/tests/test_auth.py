from fastapi.testclient import TestClient

from app.main import app


def make_client() -> TestClient:
    return TestClient(app)


def test_login_success_sets_cookie():
    client = make_client()
    response = client.post(
        "/api/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "session" in response.cookies


def test_login_wrong_password():
    client = make_client()
    response = client.post(
        "/api/login", json={"username": "user", "password": "wrong"}
    )
    assert response.status_code == 401
    assert "session" not in response.cookies


def test_login_wrong_username():
    client = make_client()
    response = client.post(
        "/api/login", json={"username": "admin", "password": "password"}
    )
    assert response.status_code == 401


def test_me_requires_auth():
    client = make_client()
    assert client.get("/api/me").status_code == 401


def test_me_after_login():
    client = make_client()
    client.post("/api/login", json={"username": "user", "password": "password"})
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_tampered_cookie_rejected():
    client = make_client()
    client.cookies.set("session", "forged-value")
    assert client.get("/api/me").status_code == 401


def test_logout_clears_session():
    client = make_client()
    client.post("/api/login", json={"username": "user", "password": "password"})
    assert client.get("/api/me").status_code == 200
    response = client.post("/api/logout")
    assert response.status_code == 200
    assert client.get("/api/me").status_code == 401
