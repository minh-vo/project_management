# Database Design

SQLite database for the Project Management app. Single file, created automatically on first startup if missing.

## Approach

Each board is stored as one JSON blob, in the same shape the frontend already uses (`BoardData`: a `columns` array with ordered `cardIds`, plus a `cards` map). This keeps a board's read/write to a single row, avoids joins, and makes the AI integration simple: the blob is passed to the model as-is and a validated replacement is saved back. A user can own multiple boards; each row in `boards` is independent.

Chat history is stored as one row per message, scoped to a single board via `board_id`, so it can be returned in order and appended cheaply.

## Schema

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL DEFAULT 'My Board',
    data TEXT NOT NULL,               -- BoardData JSON blob
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    board_id INTEGER REFERENCES boards(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

A user can have any number of boards (no uniqueness constraint on `boards.user_id`). `chat_messages.board_id` scopes chat history to the board it was discussed on.

### Migrating from the single-board schema

The original schema had a `UNIQUE` constraint on `boards.user_id` (one board per user), no `name` column, and no `chat_messages.board_id` column. `app/db.py`'s `migrate()` function detects and upgrades an old-shaped database in place on every startup (structural check via `PRAGMA table_info`, not a version counter):

1. `boards` is rebuilt under a temporary name (SQLite can't drop a `UNIQUE` constraint in place) and its rows copied across, each getting `name = 'My Board'`.
2. `chat_messages.board_id` is added and backfilled from the 1:1 user-to-board relationship that held at migration time.

This runs automatically against the `pm-data` Docker volume; no manual steps are needed and existing data is preserved.

### BoardData JSON shape

Matches `frontend/src/lib/kanban.ts`:

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "...",
      "details": "...",
      "dueDate": null,
      "labels": [],
      "priority": null,
      "assigneeId": null
    }
  }
}
```

`dueDate`, `labels`, `priority`, and `assigneeId` are optional card metadata (ISO date string, free-form tag strings, `low`/`medium`/`high`, and a `users.id` reference respectively). They default to empty/null so board blobs written before these fields existed still deserialize unchanged. `assigneeId` is not validated against `users` server-side — the assignee picker in the UI is the sole source of valid choices.

The backend validates the board shape with Pydantic models before saving. Validation also checks referential integrity: every `cardIds` entry exists in `cards`, and every card is referenced by exactly one column. Columns themselves are still fixed and shared across every board (`FIXED_COLUMN_IDS` in `app/db.py`); only titles are mutable.

## Users and authentication

There is no `password` column — passwords are never persisted. `SEED_USERS` (env var, `username:password` pairs comma-separated, default `user:password`) defines the operator-configured account list; `app/db.py` seeds a `users` row and a first board for each on startup. Login checks the submitted credentials against this in-process set. See `backend/AGENTS.md` for the auth flow.

## Location and lifecycle

- Database file path comes from the `DATABASE_PATH` env var; default `backend/data/pm.db` locally, `/data/pm.db` in the container.
- The Docker container mounts a named volume (`pm-data`) at `/data`, so data survives container rebuilds and restarts. The start scripts add the volume flag.
- On startup the backend creates the file and tables if missing, runs `migrate()`, then seeds each `SEED_USERS` account with a user row and a first board (demo data, 5 columns, 8 cards) if it doesn't already have one.
- Tests use a temporary database path so they never touch real data.
