# Database Design

SQLite database for the Project Management MVP. Single file, created automatically on first startup if missing.

## Approach

The board is stored as one JSON blob per user, in the same shape the frontend already uses (`BoardData`: a `columns` array with ordered `cardIds`, plus a `cards` map). This keeps reads and writes to a single row, avoids joins for the MVP, and makes the AI integration simple: the blob is passed to the model as-is and a validated replacement is saved back.

Chat history is stored as one row per message so it can be returned in order and appended cheaply.

## Schema

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    data TEXT NOT NULL,               -- BoardData JSON blob
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`boards.user_id` is UNIQUE because the MVP has one board per user; dropping that constraint later enables multiple boards without a migration of existing data.

### BoardData JSON shape

Matches `frontend/src/lib/kanban.ts`:

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }
  ],
  "cards": {
    "card-1": { "id": "card-1", "title": "...", "details": "..." }
  }
}
```

The backend validates this shape with Pydantic models before saving. Validation also checks referential integrity: every `cardIds` entry exists in `cards`, and every card is referenced by exactly one column.

## Location and lifecycle

- Database file path comes from the `DATABASE_PATH` env var; default `backend/data/pm.db` locally, `/data/pm.db` in the container.
- The Docker container mounts a named volume (`pm-data`) at `/data`, so data survives container rebuilds and restarts. The start scripts add the volume flag.
- On startup the backend creates the file and tables if missing, then seeds:
  - the default user `user`
  - that user's board with the current demo data (5 columns, 8 cards)
- Tests use a temporary database path so they never touch real data.
