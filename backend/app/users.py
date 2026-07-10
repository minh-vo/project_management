from contextlib import closing

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth import CurrentUserId
from app.db import connect

router = APIRouter(prefix="/api")


class UserOut(BaseModel):
    id: int
    username: str


@router.get("/users")
def list_users(_: CurrentUserId) -> list[UserOut]:
    with closing(connect()) as conn:
        rows = conn.execute("SELECT id, username FROM users ORDER BY id").fetchall()
    return [UserOut(id=row["id"], username=row["username"]) for row in rows]
