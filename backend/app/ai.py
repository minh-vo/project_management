import json
import os
from contextlib import closing
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ValidationError

from app.auth import CurrentUser
from app.board import BoardData, load_user_board, save_user_board
from app.db import connect, ensure_user_board

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """You are a helpful project management assistant for a Kanban board app.

The board has exactly five columns with these fixed ids (in order): col-backlog, col-discovery, col-progress, col-review, col-done. Only column titles may change.

When the user asks you to change the board (create, edit, move, or delete cards), set board_update to the complete updated board state. For conversational replies with no board change, set board_update to null.

When board_update is not null, keep reply to one or two short, complete sentences summarizing what changed. Never use ellipsis (...) or placeholder text in reply.

Each card needs a unique id, title, and details. Include every card in exactly one column's cardIds list."""

COMPLETION_MAX_TOKENS = 8192
BOARD_UPDATE_FALLBACK = "Done — I've updated your board."
INCOMPLETE_REPLY_FALLBACK = "I couldn't finish that response. Please try again."
INCOMPLETE_TAIL_WORDS = frozenset(
    {"a", "an", "and", "are", "for", "from", "in", "into", "is", "it", "on", "that", "the", "to", "was", "were", "with"}
)

router = APIRouter(prefix="/api")


class ChatRequest(BaseModel):
    message: str


class ChatMessageOut(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class ChatHistoryOut(BaseModel):
    messages: list[ChatMessageOut]


class ChatResponse(BaseModel):
    reply: str
    board_update: BoardData | None = None


class PostChatOut(BaseModel):
    reply: str
    board_updated: bool


CHAT_RESPONSE_SCHEMA = ChatResponse.model_json_schema()


def finalize_reply(
    reply: str,
    *,
    board_updated: bool,
    finish_reason: str | None = None,
) -> str:
    """Normalize model replies that were truncated to ellipsis placeholders."""
    text = reply.strip()
    if not text:
        return BOARD_UPDATE_FALLBACK if board_updated else INCOMPLETE_REPLY_FALLBACK

    placeholder = text in {"...", "…", ".."}
    truncated = text.endswith("...") or text.endswith("…")
    if placeholder or (finish_reason == "length" and truncated):
        return BOARD_UPDATE_FALLBACK if board_updated else INCOMPLETE_REPLY_FALLBACK

    if truncated:
        core = text.removesuffix("...").removesuffix("…").rstrip()
        last_word = core.rsplit(None, 1)[-1].lower().rstrip(".,!?") if core else ""
        if not core or last_word in INCOMPLETE_TAIL_WORDS:
            return BOARD_UPDATE_FALLBACK if board_updated else INCOMPLETE_REPLY_FALLBACK
        return core + ("." if not core.endswith((".", "!", "?")) else "")

    return reply


async def complete(messages: list[dict[str, str]]) -> tuple[str, str | None]:
    """Send a structured chat completion request and return raw JSON plus finish_reason."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=502, detail="AI service is not configured (missing OPENROUTER_API_KEY)."
        )

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                OPENROUTER_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": MODEL,
                    "messages": messages,
                    "max_tokens": COMPLETION_MAX_TOKENS,
                    "reasoning": {"effort": "low"},
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "chat_response",
                            "strict": True,
                            "schema": CHAT_RESPONSE_SCHEMA,
                        },
                    },
                },
            )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail="AI service is unavailable. Please try again."
        ) from exc

    choice = response.json()["choices"][0]
    return choice["message"]["content"], choice.get("finish_reason")


def fetch_chat_history(conn, user_id: int) -> list[ChatMessageOut]:
    rows = conn.execute(
        "SELECT role, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY id",
        (user_id,),
    ).fetchall()
    return [
        ChatMessageOut(role=row["role"], content=row["content"], created_at=row["created_at"])
        for row in rows
    ]


def persist_chat_turn(conn, user_id: int, user_message: str, assistant_reply: str) -> None:
    conn.execute(
        "INSERT INTO chat_messages (user_id, role, content) VALUES (?, 'user', ?)",
        (user_id, user_message),
    )
    conn.execute(
        "INSERT INTO chat_messages (user_id, role, content) VALUES (?, 'assistant', ?)",
        (user_id, assistant_reply),
    )


def build_messages(board: BoardData, history: list[ChatMessageOut], user_message: str) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Current board:\n{board.model_dump_json()}"},
    ]
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": user_message})
    return messages


def apply_board_update(data: dict, username: str) -> bool:
    if data.get("board_update") is None:
        return False
    try:
        board = BoardData.model_validate(data["board_update"])
    except ValidationError:
        return False
    with closing(connect()) as conn, conn:
        user_id = ensure_user_board(conn, username)
        save_user_board(conn, user_id, board)
    return True


@router.get("/chat")
def get_chat(username: CurrentUser) -> ChatHistoryOut:
    with closing(connect()) as conn, conn:
        user_id = ensure_user_board(conn, username)
        return ChatHistoryOut(messages=fetch_chat_history(conn, user_id))


@router.post("/chat")
async def post_chat(body: ChatRequest, username: CurrentUser) -> PostChatOut:
    with closing(connect()) as conn, conn:
        user_id = ensure_user_board(conn, username)
        board = load_user_board(conn, user_id)
        history = fetch_chat_history(conn, user_id)

    content, finish_reason = await complete(build_messages(board, history, body.message))
    if not content:
        raise HTTPException(status_code=502, detail="AI returned an empty response")
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON") from exc

    board_updated = apply_board_update(data, username)
    reply = finalize_reply(
        data.get("reply", ""),
        board_updated=board_updated,
        finish_reason=finish_reason,
    )

    with closing(connect()) as conn, conn:
        user_id = ensure_user_board(conn, username)
        persist_chat_turn(conn, user_id, body.message, reply)

    return PostChatOut(reply=reply, board_updated=board_updated)
