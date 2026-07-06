import os
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel

# MVP: single hardcoded user. The database still models multiple users.
VALID_USERNAME = "user"
VALID_PASSWORD = "password"

SESSION_COOKIE = "session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

serializer = URLSafeTimedSerializer(
    os.environ.get("SESSION_SECRET", "dev-session-secret"), salt="session"
)

router = APIRouter(prefix="/api")


class LoginRequest(BaseModel):
    username: str
    password: str


def current_user(
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> str:
    if session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return serializer.loads(session, max_age=SESSION_MAX_AGE)
    except BadSignature:
        raise HTTPException(status_code=401, detail="Invalid session")


CurrentUser = Annotated[str, Depends(current_user)]


@router.post("/login")
def login(body: LoginRequest, response: Response) -> dict[str, str]:
    if body.username != VALID_USERNAME or body.password != VALID_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    response.set_cookie(
        SESSION_COOKIE,
        serializer.dumps(body.username),
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
def me(username: CurrentUser) -> dict[str, str]:
    return {"username": username}
