import os
from contextlib import closing
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel

from app.db import connect, ensure_user_board, seed_users

SESSION_COOKIE = "session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

serializer = URLSafeTimedSerializer(
    os.environ.get("SESSION_SECRET", "dev-session-secret"), salt="session"
)

router = APIRouter(prefix="/api")


class LoginRequest(BaseModel):
    username: str
    password: str


def current_user_id(
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> int:
    if session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return serializer.loads(session, max_age=SESSION_MAX_AGE)
    except BadSignature:
        raise HTTPException(status_code=401, detail="Invalid session")


CurrentUserId = Annotated[int, Depends(current_user_id)]


@router.post("/login")
def login(body: LoginRequest, response: Response) -> dict[str, str]:
    if seed_users().get(body.username) != body.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    with closing(connect()) as conn, conn:
        user_id = ensure_user_board(conn, body.username)
    response.set_cookie(
        SESSION_COOKIE,
        serializer.dumps(user_id),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
    )
    return {"username": body.username}


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "ok"}


@router.get("/me")
def me(user_id: CurrentUserId) -> dict[str, str]:
    with closing(connect()) as conn:
        row = conn.execute(
            "SELECT username FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    return {"username": row["username"]}
