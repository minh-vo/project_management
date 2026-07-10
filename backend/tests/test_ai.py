import copy
import json

import httpx
import respx
from httpx import Response

from app.ai import MODEL, OPENROUTER_URL, finalize_reply
from app.db import SEED_BOARD
from conftest import expected_seed_board, make_client
from test_board import first_board_id


def structured_reply(reply: str, board_update: dict | None = None) -> Response:
    content = json.dumps({"reply": reply, "board_update": board_update})
    return Response(200, json={"choices": [{"message": {"content": content}}]})


def test_chat_requires_auth():
    client = make_client(logged_in=False)
    assert client.get("/api/boards/1/chat").status_code == 401
    assert client.post("/api/boards/1/chat", json={"message": "hi"}).status_code == 401


@respx.mock
def test_chat_reply_without_board_update(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    route = respx.post(OPENROUTER_URL).mock(
        return_value=structured_reply("Hello! How can I help with your board?")
    )
    client = make_client()
    board_id = first_board_id(client)

    response = client.post(f"/api/boards/{board_id}/chat", json={"message": "hi there"})

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Hello! How can I help with your board?",
        "board_updated": False,
    }
    assert client.get(f"/api/boards/{board_id}").json() == expected_seed_board()

    body = json.loads(route.calls.last.request.content)
    assert body["model"] == MODEL
    assert body["response_format"]["type"] == "json_schema"
    assert body["messages"][-1] == {"role": "user", "content": "hi there"}


@respx.mock
def test_chat_reply_with_board_update_saves_board(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = copy.deepcopy(SEED_BOARD)
    board["cards"]["card-9"] = {"id": "card-9", "title": "New task", "details": "From AI"}
    board["columns"][0]["cardIds"].append("card-9")
    respx.post(OPENROUTER_URL).mock(
        return_value=structured_reply("Added the card to Backlog.", board)
    )
    client = make_client()
    board_id = first_board_id(client)

    response = client.post(
        f"/api/boards/{board_id}/chat",
        json={"message": "add a card called New task to Backlog"},
    )

    assert response.status_code == 200
    assert response.json()["board_updated"] is True
    fetched = client.get(f"/api/boards/{board_id}").json()
    assert "card-9" in fetched["cards"]
    assert "card-9" in fetched["columns"][0]["cardIds"]


@respx.mock
def test_chat_invalid_board_update_rejected_without_corrupting_board(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    bad_board = copy.deepcopy(SEED_BOARD)
    bad_board["columns"][0]["id"] = "col-icebox"
    respx.post(OPENROUTER_URL).mock(
        return_value=structured_reply("Updated the board.", bad_board)
    )
    client = make_client()
    board_id = first_board_id(client)

    response = client.post(f"/api/boards/{board_id}/chat", json={"message": "rename backlog column"})

    assert response.status_code == 200
    assert response.json() == {"reply": "Updated the board.", "board_updated": False}
    assert client.get(f"/api/boards/{board_id}").json() == expected_seed_board()


@respx.mock
def test_chat_history_persisted_and_returned_in_order(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    respx.post(OPENROUTER_URL).mock(
        side_effect=[
            structured_reply("First reply"),
            structured_reply("Second reply"),
        ]
    )
    client = make_client()
    board_id = first_board_id(client)

    client.post(f"/api/boards/{board_id}/chat", json={"message": "first"})
    client.post(f"/api/boards/{board_id}/chat", json={"message": "second"})

    history = client.get(f"/api/boards/{board_id}/chat").json()["messages"]
    assert [m["role"] for m in history] == ["user", "assistant", "user", "assistant"]
    assert [m["content"] for m in history] == [
        "first",
        "First reply",
        "second",
        "Second reply",
    ]
    assert all(m["created_at"] for m in history)


def test_chat_missing_api_key_returns_502(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    client = make_client()
    board_id = first_board_id(client)

    response = client.post(f"/api/boards/{board_id}/chat", json={"message": "hi"})

    assert response.status_code == 502
    assert "not configured" in response.json()["detail"]


@respx.mock
def test_chat_openrouter_error_status_returns_502(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    respx.post(OPENROUTER_URL).mock(return_value=Response(500, json={"error": "boom"}))
    client = make_client()
    board_id = first_board_id(client)

    response = client.post(f"/api/boards/{board_id}/chat", json={"message": "hi"})

    assert response.status_code == 502
    assert "unavailable" in response.json()["detail"]
    # A failed AI call should not corrupt the board or history.
    assert client.get(f"/api/boards/{board_id}").json() == expected_seed_board()
    assert client.get(f"/api/boards/{board_id}/chat").json()["messages"] == []


@respx.mock
def test_chat_network_error_returns_502(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    respx.post(OPENROUTER_URL).mock(side_effect=httpx.ConnectError("connection refused"))
    client = make_client()
    board_id = first_board_id(client)

    response = client.post(f"/api/boards/{board_id}/chat", json={"message": "hi"})

    assert response.status_code == 502
    assert "unavailable" in response.json()["detail"]


def test_finalize_reply_replaces_ellipsis_placeholder():
    assert finalize_reply("...", board_updated=True) == "Done — I've updated your board."
    assert finalize_reply("…", board_updated=False) == (
        "I couldn't finish that response. Please try again."
    )


def test_finalize_reply_replaces_incomplete_trailing_ellipsis():
    assert finalize_reply("I moved the card to Done and...", board_updated=True) == (
        "Done — I've updated your board."
    )


def test_finalize_reply_preserves_complete_sentences():
    assert finalize_reply("Added the card to Backlog.", board_updated=True) == (
        "Added the card to Backlog."
    )


@respx.mock
def test_chat_replaces_ellipsis_reply_when_board_updates(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board = copy.deepcopy(SEED_BOARD)
    board["cards"]["card-9"] = {"id": "card-9", "title": "New task", "details": "From AI"}
    board["columns"][0]["cardIds"].append("card-9")
    respx.post(OPENROUTER_URL).mock(
        return_value=structured_reply("...", board)
    )
    client = make_client()
    board_id = first_board_id(client)

    response = client.post(
        f"/api/boards/{board_id}/chat",
        json={"message": "add a card called New task to Backlog"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Done — I've updated your board.",
        "board_updated": True,
    }
