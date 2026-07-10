import json
import os
import sqlite3
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "pm.db"

# The MVP board has fixed columns; only titles may change.
FIXED_COLUMN_IDS = [
    "col-backlog",
    "col-discovery",
    "col-progress",
    "col-review",
    "col-done",
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL DEFAULT 'My Board',
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    board_id INTEGER REFERENCES boards(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

# Mirrors the demo data in frontend/src/lib/kanban.ts.
SEED_BOARD = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {"id": "col-progress", "title": "In Progress", "cardIds": ["card-4", "card-5"]},
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Align roadmap themes",
            "details": "Draft quarterly themes with impact statements and metrics.",
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
        },
    },
}


# Fresh boards created via the UI start with the fixed columns and no cards.
EMPTY_BOARD = {
    "columns": [
        {"id": column["id"], "title": column["title"], "cardIds": []}
        for column in SEED_BOARD["columns"]
    ],
    "cards": {},
}


def seed_users() -> dict[str, str]:
    """Parse "user:pass,user2:pass2" from SEED_USERS, defaulting to the MVP demo user.

    Passwords live only here (env-configured), never in the database — this
    avoids needing a hashing dependency for a small, operator-defined user set.
    """
    raw = os.environ.get("SEED_USERS", "user:password")
    users: dict[str, str] = {}
    for pair in raw.split(","):
        username, _, password = pair.partition(":")
        if username.strip() and password.strip():
            users[username.strip()] = password.strip()
    return users


def database_path() -> Path:
    return Path(os.environ.get("DATABASE_PATH", DEFAULT_PATH))


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_user_board(conn: sqlite3.Connection, username: str) -> int:
    """Return the user's id, creating the user and a seeded first board if missing."""
    conn.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (username,))
    user_id: int = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()["id"]
    conn.execute(
        """
        INSERT INTO boards (user_id, name, data)
        SELECT ?, 'My Board', ?
        WHERE NOT EXISTS (SELECT 1 FROM boards WHERE user_id = ?)
        """,
        (user_id, json.dumps(SEED_BOARD), user_id),
    )
    return user_id


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row["name"] == column for row in conn.execute(f"PRAGMA table_info({table})"))


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        ).fetchone()
        is not None
    )


def migrate(conn: sqlite3.Connection) -> None:
    """Migrate a pre-multi-board database in place; a no-op on a fresh or current one.

    The original schema had a UNIQUE constraint on boards.user_id (one board
    per user) and no `name` column; chat_messages had no `board_id` column.
    SQLite can't drop a UNIQUE constraint in place, so the old boards table is
    rebuilt under a temporary name and its rows copied across.
    """
    if _table_exists(conn, "boards") and not _has_column(conn, "boards", "name"):
        conn.executescript(
            """
            ALTER TABLE boards RENAME TO boards_old;
            CREATE TABLE boards (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                name TEXT NOT NULL DEFAULT 'My Board',
                data TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO boards (id, user_id, name, data, updated_at)
                SELECT id, user_id, 'My Board', data, updated_at FROM boards_old;
            DROP TABLE boards_old;
            """
        )

    if _table_exists(conn, "chat_messages") and not _has_column(conn, "chat_messages", "board_id"):
        conn.execute("ALTER TABLE chat_messages ADD COLUMN board_id INTEGER REFERENCES boards(id)")
        conn.execute(
            """
            UPDATE chat_messages SET board_id = (
                SELECT id FROM boards WHERE boards.user_id = chat_messages.user_id
            )
            WHERE board_id IS NULL
            """
        )


def init_db() -> None:
    conn = connect()
    try:
        with conn:
            migrate(conn)
            conn.executescript(SCHEMA)
            for username in seed_users():
                ensure_user_board(conn, username)
    finally:
        conn.close()
