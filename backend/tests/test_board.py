import copy
import json

from app.db import SEED_BOARD, connect
from conftest import make_client


def first_board_id(client) -> int:
    return client.get("/api/boards").json()[0]["id"]


def test_board_requires_auth():
    client = make_client(logged_in=False)
    assert client.get("/api/boards/1").status_code == 401
    assert client.put("/api/boards/1", json=SEED_BOARD).status_code == 401


def test_get_returns_seeded_board():
    client = make_client()
    board_id = first_board_id(client)
    response = client.get(f"/api/boards/{board_id}")
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
    board_id = first_board_id(client)
    board = copy.deepcopy(SEED_BOARD)
    board["columns"][0]["title"] = "Icebox"
    # Move card-1 from backlog to done.
    board["columns"][0]["cardIds"] = ["card-2"]
    board["columns"][4]["cardIds"] = ["card-7", "card-8", "card-1"]

    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 200
    fetched = client.get(f"/api/boards/{board_id}").json()
    assert fetched["columns"][0]["title"] == "Icebox"
    assert fetched["columns"][4]["cardIds"] == ["card-7", "card-8", "card-1"]


def test_changes_persist_across_app_restarts():
    client = make_client()
    board_id = first_board_id(client)
    board = copy.deepcopy(SEED_BOARD)
    board["cards"]["card-9"] = {"id": "card-9", "title": "New", "details": ""}
    board["columns"][1]["cardIds"] = ["card-3", "card-9"]
    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 200

    fresh_client = make_client()
    fetched = fresh_client.get(f"/api/boards/{board_id}").json()
    assert "card-9" in fetched["cards"]


def test_rejects_missing_fields():
    client = make_client()
    board_id = first_board_id(client)
    assert client.put(f"/api/boards/{board_id}", json={"columns": []}).status_code == 422


def test_rejects_wrong_column_ids():
    client = make_client()
    board_id = first_board_id(client)
    board = copy.deepcopy(SEED_BOARD)
    board["columns"][0]["id"] = "col-icebox"
    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_reference_to_missing_card():
    client = make_client()
    board_id = first_board_id(client)
    board = copy.deepcopy(SEED_BOARD)
    board["columns"][0]["cardIds"].append("card-ghost")
    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_card_in_two_columns():
    client = make_client()
    board_id = first_board_id(client)
    board = copy.deepcopy(SEED_BOARD)
    board["columns"][1]["cardIds"].append("card-1")
    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_unreferenced_card():
    client = make_client()
    board_id = first_board_id(client)
    board = copy.deepcopy(SEED_BOARD)
    board["cards"]["card-orphan"] = {"id": "card-orphan", "title": "x", "details": ""}
    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_mismatched_card_key():
    client = make_client()
    board_id = first_board_id(client)
    board = copy.deepcopy(SEED_BOARD)
    board["cards"]["card-1"] = {"id": "card-99", "title": "x", "details": ""}
    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_card_metadata_round_trips():
    client = make_client()
    board_id = first_board_id(client)
    board = copy.deepcopy(SEED_BOARD)
    board["cards"]["card-1"]["dueDate"] = "2026-08-01"
    board["cards"]["card-1"]["labels"] = ["urgent", "backend"]
    board["cards"]["card-1"]["priority"] = "high"
    board["cards"]["card-1"]["assigneeId"] = 1

    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 200
    fetched = client.get(f"/api/boards/{board_id}").json()["cards"]["card-1"]
    assert fetched["dueDate"] == "2026-08-01"
    assert fetched["labels"] == ["urgent", "backend"]
    assert fetched["priority"] == "high"
    assert fetched["assigneeId"] == 1


def test_card_without_metadata_gets_defaults():
    client = make_client()
    board_id = first_board_id(client)
    fetched = client.get(f"/api/boards/{board_id}").json()["cards"]["card-1"]
    assert fetched["dueDate"] is None
    assert fetched["labels"] == []
    assert fetched["priority"] is None
    assert fetched["assigneeId"] is None


def test_legacy_card_json_without_metadata_keys_deserializes_with_defaults():
    """A board row written before card metadata existed (no dueDate/labels/priority/
    assigneeId keys at all, not just null) must still load, with defaults filled in."""
    client = make_client()
    board_id = first_board_id(client)

    legacy_board = copy.deepcopy(SEED_BOARD)  # SEED_BOARD cards have no metadata keys
    conn = connect()
    with conn:
        conn.execute(
            "UPDATE boards SET data = ? WHERE id = ?",
            (json.dumps(legacy_board), board_id),
        )
    conn.close()

    fetched = client.get(f"/api/boards/{board_id}").json()["cards"]["card-1"]
    assert fetched["dueDate"] is None
    assert fetched["labels"] == []
    assert fetched["priority"] is None
    assert fetched["assigneeId"] is None
