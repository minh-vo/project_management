from contextlib import closing

from fastapi import APIRouter
from pydantic import BaseModel, model_validator

from app.auth import CurrentUser
from app.db import FIXED_COLUMN_IDS, connect, ensure_user_board

router = APIRouter(prefix="/api")


class Card(BaseModel):
    id: str
    title: str
    details: str


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


def load_user_board(conn, user_id: int) -> BoardData:
    row = conn.execute(
        "SELECT data FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()
    return BoardData.model_validate_json(row["data"])


def save_user_board(conn, user_id: int, board: BoardData) -> None:
    conn.execute(
        "UPDATE boards SET data = ?, updated_at = datetime('now') WHERE user_id = ?",
        (board.model_dump_json(), user_id),
    )


@router.get("/board")
def get_board(username: CurrentUser) -> BoardData:
    with closing(connect()) as conn, conn:
        user_id = ensure_user_board(conn, username)
        return load_user_board(conn, user_id)


@router.put("/board")
def put_board(board: BoardData, username: CurrentUser) -> dict[str, str]:
    with closing(connect()) as conn, conn:
        user_id = ensure_user_board(conn, username)
        save_user_board(conn, user_id, board)
    return {"status": "ok"}
