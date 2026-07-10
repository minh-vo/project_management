import pytest
from fastapi.testclient import TestClient

from app.board import BoardData
from app.db import SEED_BOARD
from app.main import app


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))


def make_client(logged_in: bool = True, username: str = "user", password: str = "password") -> TestClient:
    client = TestClient(app)
    client.__enter__()  # run lifespan (creates and seeds the database)
    if logged_in:
        client.post("/api/login", json={"username": username, "password": password})
    return client


def expected_seed_board() -> dict:
    """SEED_BOARD as the API actually returns it, with card metadata defaults filled in."""
    return BoardData.model_validate(SEED_BOARD).model_dump(mode="json")
