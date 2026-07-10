from contextlib import closing
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, model_validator

from app.auth import CurrentUserId
from app.db import EMPTY_BOARD, FIXED_COLUMN_IDS, connect

router = APIRouter(prefix="/api")


class Card(BaseModel):
    id: str
    title: str
    details: str
    dueDate: str | None = None
    labels: list[str] = []
    priority: Literal["low", "medium", "high"] | None = None
    assigneeId: int | None = None


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_integrity(self) -> "BoardData":
        if [column.id for column in self.columns] != FIXED_COLUMN_IDS:
            raise ValueError(f"columns must be exactly {FIXED_COLUMN_IDS} in order")
        for key, card in self.cards.items():
            if key != card.id:
                raise ValueError(f"card key {key!r} does not match card id {card.id!r}")
        refs = [card_id for column in self.columns for card_id in column.cardIds]
        if len(refs) != len(set(refs)):
            raise ValueError("a card is referenced by more than one column")
        if set(refs) != set(self.cards):
            raise ValueError("column cardIds and cards keys must match exactly")
        return self


class BoardSummary(BaseModel):
    id: int
    name: str
    updated_at: str


class CreateBoardRequest(BaseModel):
    name: str = "My Board"


class RenameBoardRequest(BaseModel):
    name: str


def _summary_row(row) -> BoardSummary:
    return BoardSummary(id=row["id"], name=row["name"], updated_at=row["updated_at"])


def list_boards(conn, user_id: int) -> list[BoardSummary]:
    rows = conn.execute(
        "SELECT id, name, updated_at FROM boards WHERE user_id = ? ORDER BY id", (user_id,)
    ).fetchall()
    return [_summary_row(row) for row in rows]


def create_board(conn, user_id: int, name: str) -> BoardSummary:
    board = BoardData.model_validate(EMPTY_BOARD)
    cursor = conn.execute(
        "INSERT INTO boards (user_id, name, data) VALUES (?, ?, ?)",
        (user_id, name, board.model_dump_json()),
    )
    row = conn.execute(
        "SELECT id, name, updated_at FROM boards WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return _summary_row(row)


def rename_board(conn, user_id: int, board_id: int, name: str) -> BoardSummary | None:
    cursor = conn.execute(
        "UPDATE boards SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        (name, board_id, user_id),
    )
    if cursor.rowcount == 0:
        return None
    row = conn.execute(
        "SELECT id, name, updated_at FROM boards WHERE id = ?", (board_id,)
    ).fetchone()
    return _summary_row(row)


def delete_board(conn, user_id: int, board_id: int) -> bool:
    conn.execute("DELETE FROM chat_messages WHERE board_id = ?", (board_id,))
    cursor = conn.execute(
        "DELETE FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
    )
    return cursor.rowcount > 0


def load_board(conn, user_id: int, board_id: int) -> BoardData | None:
    row = conn.execute(
        "SELECT data FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
    ).fetchone()
    if row is None:
        return None
    return BoardData.model_validate_json(row["data"])


def save_board(conn, user_id: int, board_id: int, board: BoardData) -> bool:
    cursor = conn.execute(
        "UPDATE boards SET data = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        (board.model_dump_json(), board_id, user_id),
    )
    return cursor.rowcount > 0


@router.get("/boards")
def list_boards_route(user_id: CurrentUserId) -> list[BoardSummary]:
    with closing(connect()) as conn, conn:
        return list_boards(conn, user_id)


@router.post("/boards", status_code=201)
def create_board_route(body: CreateBoardRequest, user_id: CurrentUserId) -> BoardSummary:
    with closing(connect()) as conn, conn:
        return create_board(conn, user_id, body.name)


@router.patch("/boards/{board_id}")
def rename_board_route(
    board_id: int, body: RenameBoardRequest, user_id: CurrentUserId
) -> BoardSummary:
    with closing(connect()) as conn, conn:
        summary = rename_board(conn, user_id, board_id, body.name)
    if summary is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return summary


@router.delete("/boards/{board_id}", status_code=204)
def delete_board_route(board_id: int, user_id: CurrentUserId) -> None:
    with closing(connect()) as conn, conn:
        owned = conn.execute(
            "SELECT 1 FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
        ).fetchone()
        if owned is None:
            raise HTTPException(status_code=404, detail="Board not found")
        remaining = conn.execute(
            "SELECT COUNT(*) AS n FROM boards WHERE user_id = ?", (user_id,)
        ).fetchone()["n"]
        if remaining <= 1:
            raise HTTPException(status_code=409, detail="Cannot delete your last remaining board")
        delete_board(conn, user_id, board_id)


@router.get("/boards/{board_id}")
def get_board_by_id(board_id: int, user_id: CurrentUserId) -> BoardData:
    with closing(connect()) as conn, conn:
        board = load_board(conn, user_id, board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@router.put("/boards/{board_id}")
def put_board_by_id(board_id: int, board: BoardData, user_id: CurrentUserId) -> dict[str, str]:
    with closing(connect()) as conn, conn:
        saved = save_board(conn, user_id, board_id, board)
    if not saved:
        raise HTTPException(status_code=404, detail="Board not found")
    return {"status": "ok"}
