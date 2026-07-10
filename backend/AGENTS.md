# Backend

Python FastAPI backend, managed with uv (Python 3.13).

## Structure

- `app/db.py` - SQLite via stdlib sqlite3. Path from `DATABASE_PATH` env (default `backend/data/pm.db`; `/data/pm.db` in Docker, volume `pm-data`). `seed_users()` parses `SEED_USERS` env (`user:password,alex:secret`, default `user:password`) — passwords live only here, never in the database. `migrate()` upgrades a pre-multi-board database in place (structural check, not a version counter); `init_db()` runs in the FastAPI lifespan: creates tables if missing, migrates, then seeds each configured user with a first board (`SEED_BOARD`, mirrors frontend `initialData`) if they don't already have one. `EMPTY_BOARD` (fixed columns, no cards) seeds boards created later via the UI. Schema documented in `docs/DATABASE.md`.
- `app/board.py` - board CRUD under `/api/boards` (auth required, ownership-scoped so one user can never read/write another's board — 404 on mismatch). `Card` has optional metadata (`dueDate`, `labels`, `priority`, `assigneeId`), all defaulting to empty/null so old blobs deserialize unchanged. Pydantic `BoardData` validates shape plus integrity: column ids fixed to `FIXED_COLUMN_IDS` in order (shared across every board — no per-board custom columns), card keys match card ids, every card referenced by exactly one column. `list_boards` / `create_board` / `rename_board` / `delete_board` / `load_board` / `save_board` are the board-scoped data helpers; deleting a user's last remaining board is rejected (409).
- `app/ai.py` - OpenRouter client and board-scoped chat routes (`/api/boards/{board_id}/chat`). `complete(messages)` posts to the chat completions API with raw async httpx (`OPENROUTER_API_KEY` env, model `openai/gpt-oss-120b`) using Structured Outputs (`response_format: json_schema`) for `{ reply, board_update }`. `SYSTEM_PROMPT` still hardcodes the fixed column ids (unaffected by multi-board, since columns are shared). Chat history (`chat_messages`) is scoped by `board_id`, not just `user_id`.
- `app/auth.py` - session auth: credentials checked against `seed_users()` (no hashing dependency — see `docs/DATABASE.md`), itsdangerous-signed `session` cookie (httponly, 7 days, secret from `SESSION_SECRET` env, dev default) signs the user's **id**, not username. `CurrentUserId` dependency raises 401 without a valid cookie and resolves to an `int`; use it on all protected routes. `/api/me` does one extra lookup to return `{username}`.
- `app/users.py` - `GET /api/users` returns `[{id, username}]` for every seeded account (auth required); used by the frontend to populate the assignee picker.
- `app/main.py` - FastAPI app. API routes under `/api`; static files mounted at `/` (mounted last so API routes take precedence) with an SPA fallback that serves `index.html` for unknown paths. The static directory defaults to `backend/static` (placeholder page) and is overridden with the `STATIC_DIR` env var; in Docker it points at the built Next.js frontend.
- `static/` - placeholder hello world page used for local backend dev and unit tests
- `tests/` - pytest tests using FastAPI's TestClient. pytest config (testpaths, pythonpath) is in `pyproject.toml`. Shared `temp_db` fixture and `make_client`/`expected_seed_board` helpers live in `tests/conftest.py`. OpenRouter HTTP is mocked with respx in `tests/test_ai.py`.

## Decisions

- stdlib `sqlite3`, no ORM: boards are still a JSON blob per row (see `docs/DATABASE.md`), so an ORM adds nothing even with multiple boards per user. Connections are opened per request; sync routes run in FastAPI's threadpool.
- Full-board `PUT /api/boards/{id}` instead of granular card/column endpoints: one write path, and it matches how the AI updates the board (whole-board Structured Output).
- Fixed columns are enforced server-side and shared globally across every board: `BoardData` validation rejects any payload whose column ids are not exactly `FIXED_COLUMN_IDS` in order. Only column titles are mutable; there is no per-board custom-column support.
- Auth is a signed cookie rather than server-side session storage: no session table, no revocation beyond cookie expiry/`max_age` — acceptable for a small, operator-defined user set with no self-serve registration.
- Multi-user is a fixed, operator-configured account list (`SEED_USERS` env var), not self-serve registration with hashed passwords: keeps the local-app threat model simple and avoids adding a hashing dependency for a handful of trusted users.
- OpenRouter is called with raw httpx rather than the OpenAI SDK: one endpoint, one model, and Structured Outputs are just a `response_format` field in the same JSON body.
- Invalid AI `board_update` payloads are dropped without failing the chat request; the reply is returned and history is saved, but the board row is left unchanged.
- OpenRouter requests set `max_tokens: 8192` and `reasoning.effort: low` so structured board updates leave room for a complete reply; `finalize_reply()` replaces ellipsis placeholders when the model still truncates.
- Card metadata (`dueDate`/`labels`/`priority`/`assigneeId`) is purely additive to the JSON blob — no schema migration needed, and `assigneeId` is not validated against `users` server-side (the frontend dropdown is the only source of valid choices).

## Commands

- `uv run uvicorn app.main:app --reload` - run dev server
- `uv run pytest` - run tests
- `uv add <pkg>` / `uv add --dev <pkg>` - manage dependencies

## Routes

- `GET /api/health` - returns `{"status": "ok"}`
- `POST /api/login` - body `{username, password}`; sets session cookie or 401
- `POST /api/logout` - clears session cookie
- `GET /api/me` - returns `{username}`; 401 when not authenticated
- `GET /api/users` - returns `[{id, username}]` for every seeded account (auth required)
- `GET /api/boards` - the signed-in user's boards as `[{id, name, updated_at}]`
- `POST /api/boards` - body `{name}`; creates an empty board (fixed columns, no cards)
- `PATCH /api/boards/{id}` - body `{name}`; rename; 404 if not owned
- `DELETE /api/boards/{id}` - 404 if not owned, 409 if it's the user's last board
- `GET /api/boards/{id}` - board JSON; 404 if not owned
- `PUT /api/boards/{id}` - validates and saves the full board; 422 on invalid payloads, 404 if not owned
- `GET /api/boards/{id}/chat` - returns `{messages: [{role, content, created_at}]}` in order for that board
- `POST /api/boards/{id}/chat` - body `{message}`; returns `{reply, board_updated}`
- `GET /` - static site
