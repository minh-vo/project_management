from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_serves_static_index():
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def test_unknown_path_falls_back_to_index():
    response = client.get("/some/client/route")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert response.text == client.get("/").text
