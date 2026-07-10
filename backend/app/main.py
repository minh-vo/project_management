import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from app.ai import router as ai_router
from app.auth import router as auth_router
from app.board import router as board_router
from app.db import init_db
from app.users import router as users_router

STATIC_DIR = Path(
    os.environ.get("STATIC_DIR", Path(__file__).resolve().parent.parent / "static")
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Project Management API", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(board_router)
app.include_router(ai_router)
app.include_router(users_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class SPAStaticFiles(StaticFiles):
    """Serve index.html for unknown paths so client-side routes work."""

    async def get_response(self, path: str, scope):  # type: ignore[override]
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            return await super().get_response("index.html", scope)
        if response.status_code == 404:
            return await super().get_response("index.html", scope)
        return response


# Mounted last so /api routes take precedence.
app.mount("/", SPAStaticFiles(directory=STATIC_DIR, html=True), name="static")
