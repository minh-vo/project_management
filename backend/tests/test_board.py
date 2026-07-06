import copy

import pytest
from fastapi.testclient import TestClient

from app.db import SEED_BOARD
from app.main import app


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))


def make_client(logged_in: bool = True) -> TestClient:
    client = TestClient(app)
    client.__enter__()  # run lifespan (creates and seeds the database)
    if logged_in:
        client.post("/api/login", json={"username": "user", "password": "password"})
    return client


def test_board_requires_auth():
    client = make_client(logged_in=False)
    assert client.get("/api/board").status_code == 401
    assert client.put("/api/board", json=SEED_BOARD).status_code == 401


def test_get_returns_seeded_board():
    client = make_client()
    response = client.get("/api/board")
    assert response.status_code == 200
    board = response.json()
    assert [c["id"] for c in board["columns"]] == [
        "col-backlog",
        "col-discovery",
        "col-progress",
        "col-review",
        "col-done",
    ]
    assert len(board["cards"]) == 8


def test_put_then_get_reflects_changes():
    client = make_client()
    board = copy.deepcopy(SEED_BOARD)
    board["columns"][0]["title"] = "Icebox"
    # Move card-1 from backlog to done.
    board["columns"][0]["cardIds"] = ["card-2"]
    board["columns"][4]["cardIds"] = ["card-7", "card-8", "card-1"]

    assert client.put("/api/board", json=board).status_code == 200
    fetched = client.get("/api/board").json()
    assert fetched["columns"][0]["title"] == "Icebox"
    assert fetched["columns"][4]["cardIds"] == ["card-7", "card-8", "card-1"]


def test_changes_persist_across_app_restarts():
    client = make_client()
    board = copy.deepcopy(SEED_BOARD)
    board["cards"]["card-9"] = {"id": "card-9", "title": "New", "details": ""}
    board["columns"][1]["cardIds"] = ["card-3", "card-9"]
    assert client.put("/api/board", json=board).status_code == 200

    fresh_client = make_client()
    fetched = fresh_client.get("/api/board").json()
    assert "card-9" in fetched["cards"]


def test_rejects_missing_fields():
    client = make_client()
    assert client.put("/api/board", json={"columns": []}).status_code == 422


def test_rejects_wrong_column_ids():
    client = make_client()
    board = copy.deepcopy(SEED_BOARD)
    board["columns"][0]["id"] = "col-icebox"
    assert client.put("/api/board", json=board).status_code == 422


def test_rejects_reference_to_missing_card():
    client = make_client()
    board = copy.deepcopy(SEED_BOARD)
    board["columns"][0]["cardIds"].append("card-ghost")
    assert client.put("/api/board", json=board).status_code == 422


def test_rejects_card_in_two_columns():
    client = make_client()
    board = copy.deepcopy(SEED_BOARD)
    board["columns"][1]["cardIds"].append("card-1")
    assert client.put("/api/board", json=board).status_code == 422


def test_rejects_unreferenced_card():
    client = make_client()
    board = copy.deepcopy(SEED_BOARD)
    board["cards"]["card-orphan"] = {"id": "card-orphan", "title": "x", "details": ""}
    assert client.put("/api/board", json=board).status_code == 422


def test_rejects_mismatched_card_key():
    client = make_client()
    board = copy.deepcopy(SEED_BOARD)
    board["cards"]["card-1"] = {"id": "card-99", "title": "x", "details": ""}
    assert client.put("/api/board", json=board).status_code == 422
