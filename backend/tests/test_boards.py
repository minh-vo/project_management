import sqlite3

import respx
from httpx import Response

from app.ai import OPENROUTER_URL
from app.db import EMPTY_BOARD, init_db
from conftest import make_client


def structured_reply(reply: str, board_update: dict | None = None) -> Response:
    import json

    content = json.dumps({"reply": reply, "board_update": board_update})
    return Response(200, json={"choices": [{"message": {"content": content}}]})


def test_list_boards_shows_the_seeded_first_board():
    client = make_client()
    boards = client.get("/api/boards").json()
    assert len(boards) == 1
    assert boards[0]["name"] == "My Board"


def test_create_board_adds_an_empty_board():
    client = make_client()
    response = client.post("/api/boards", json={"name": "Second Board"})
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Second Board"

    boards = client.get("/api/boards").json()
    assert len(boards) == 2
    assert {b["name"] for b in boards} == {"My Board", "Second Board"}

    fetched = client.get(f"/api/boards/{created['id']}").json()
    assert fetched["cards"] == {}
    assert [c["id"] for c in fetched["columns"]] == [c["id"] for c in EMPTY_BOARD["columns"]]


def test_rename_board():
    client = make_client()
    board_id = client.get("/api/boards").json()[0]["id"]
    response = client.patch(f"/api/boards/{board_id}", json={"name": "Renamed"})
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert client.get("/api/boards").json()[0]["name"] == "Renamed"


def test_delete_board():
    client = make_client()
    created = client.post("/api/boards", json={"name": "Second Board"}).json()
    response = client.delete(f"/api/boards/{created['id']}")
    assert response.status_code == 204
    assert len(client.get("/api/boards").json()) == 1


def test_cannot_delete_last_remaining_board():
    client = make_client()
    board_id = client.get("/api/boards").json()[0]["id"]
    response = client.delete(f"/api/boards/{board_id}")
    assert response.status_code == 409
    assert len(client.get("/api/boards").json()) == 1


def test_operations_on_missing_board_404():
    client = make_client()
    assert client.get("/api/boards/999999").status_code == 404
    assert client.put("/api/boards/999999", json=EMPTY_BOARD).status_code == 404
    assert client.patch("/api/boards/999999", json={"name": "x"}).status_code == 404
    assert client.delete("/api/boards/999999").status_code == 404


def test_users_cannot_access_each_others_boards(monkeypatch):
    monkeypatch.setenv("SEED_USERS", "alice:pw1,bob:pw2")
    alice = make_client(username="alice", password="pw1")
    bob = make_client(username="bob", password="pw2")

    alice_board_id = alice.get("/api/boards").json()[0]["id"]

    assert bob.get(f"/api/boards/{alice_board_id}").status_code == 404
    assert bob.put(f"/api/boards/{alice_board_id}", json=EMPTY_BOARD).status_code == 404
    assert bob.patch(f"/api/boards/{alice_board_id}", json={"name": "hijacked"}).status_code == 404
    assert bob.delete(f"/api/boards/{alice_board_id}").status_code == 404

    # Alice's board is untouched and still hers.
    assert alice.get(f"/api/boards/{alice_board_id}").status_code == 200


@respx.mock
def test_chat_history_is_scoped_per_board(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    respx.post(OPENROUTER_URL).mock(
        side_effect=[
            structured_reply("Reply for board one"),
            structured_reply("Reply for board two"),
        ]
    )
    client = make_client()
    board_one_id = client.get("/api/boards").json()[0]["id"]
    board_two_id = client.post("/api/boards", json={"name": "Second"}).json()["id"]

    client.post(f"/api/boards/{board_one_id}/chat", json={"message": "hello board one"})
    client.post(f"/api/boards/{board_two_id}/chat", json={"message": "hello board two"})

    history_one = client.get(f"/api/boards/{board_one_id}/chat").json()["messages"]
    history_two = client.get(f"/api/boards/{board_two_id}/chat").json()["messages"]

    assert [m["content"] for m in history_one] == ["hello board one", "Reply for board one"]
    assert [m["content"] for m in history_two] == ["hello board two", "Reply for board two"]


def test_migration_preserves_boards_and_backfills_chat_board_id(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    # Build a database using the pre-multi-board schema (UNIQUE boards.user_id,
    # no boards.name, no chat_messages.board_id).
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE boards (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE chat_messages (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """
    )
    conn.execute("INSERT INTO users (id, username) VALUES (1, 'user')")
    conn.execute(
        "INSERT INTO boards (id, user_id, data) VALUES (1, 1, ?)",
        ('{"columns": [], "cards": {}}',),
    )
    conn.execute(
        "INSERT INTO chat_messages (id, user_id, role, content) VALUES (1, 1, 'user', 'hi')"
    )
    conn.commit()
    conn.close()

    init_db()

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    board = conn.execute("SELECT * FROM boards WHERE id = 1").fetchone()
    assert board["name"] == "My Board"
    assert board["data"] == '{"columns": [], "cards": {}}'
    assert conn.execute("SELECT COUNT(*) AS n FROM boards").fetchone()["n"] == 1

    message = conn.execute("SELECT * FROM chat_messages WHERE id = 1").fetchone()
    assert message["board_id"] == 1
    conn.close()

    # Idempotent: running init_db() again against the now-migrated database
    # must not fail or create a second board for the existing user.
    init_db()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    assert conn.execute("SELECT COUNT(*) AS n FROM boards").fetchone()["n"] == 1
    conn.close()
