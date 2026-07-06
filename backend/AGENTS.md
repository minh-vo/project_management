# Backend

Python FastAPI backend, managed with uv (Python 3.13).

## Structure

- `app/db.py` - SQLite via stdlib sqlite3. Path from `DATABASE_PATH` env (default `backend/data/pm.db`; `/data/pm.db` in Docker, volume `pm-data`). `init_db()` runs in the FastAPI lifespan: creates tables if missing and seeds user `user` with the demo board (`SEED_BOARD`, mirrors frontend `initialData`). Schema documented in `docs/DATABASE.md`.
- `app/board.py` - `GET/PUT /api/board` (auth required). Pydantic `BoardData` validates shape plus integrity: column ids fixed to `FIXED_COLUMN_IDS` in order, card keys match card ids, every card referenced by exactly one column. `load_user_board` / `save_user_board` helpers shared with the chat route.
- `app/ai.py` - OpenRouter client and chat routes. `complete(messages)` posts to the chat completions API with raw async httpx (`OPENROUTER_API_KEY` env, model `openai/gpt-oss-120b`) using Structured Outputs (`response_format: json_schema`) for `{ reply, board_update }`. `GET /api/chat` returns persisted history; `POST /api/chat` loads board + history, calls the model, validates and saves any `board_update`, persists the user/assistant turn.
- `app/auth.py` - session auth: hardcoded MVP credentials (`user`/`password`), itsdangerous-signed `session` cookie (httponly, 7 days, secret from `SESSION_SECRET` env, dev default). `CurrentUser` dependency raises 401 without a valid cookie; use it on all protected routes.
- `app/main.py` - FastAPI app. API routes under `/api`; static files mounted at `/` (mounted last so API routes take precedence) with an SPA fallback that serves `index.html` for unknown paths. The static directory defaults to `backend/static` (placeholder page) and is overridden with the `STATIC_DIR` env var; in Docker it points at the built Next.js frontend.
- `static/` - placeholder hello world page used for local backend dev and unit tests
- `tests/` - pytest tests using FastAPI's TestClient. pytest config (testpaths, pythonpath) is in `pyproject.toml`. OpenRouter HTTP is mocked with respx in `tests/test_ai.py`.

## Decisions

- stdlib `sqlite3`, no ORM: the board is one JSON blob per user (see `docs/DATABASE.md`), so an ORM adds nothing. Connections are opened per request; sync routes run in FastAPI's threadpool.
- Full-board `PUT` instead of granular card/column endpoints: one write path, and it matches how the AI will update the board (whole-board Structured Output).
- Board access is get-or-create (`ensure_user_board`) so any authenticated user gets a seeded board on first request.
- Fixed columns are enforced server-side: `BoardData` validation rejects any payload whose column ids are not exactly `FIXED_COLUMN_IDS` in order. Only column titles are mutable.
- Auth is a signed cookie rather than server-side session storage: no session table needed, and the itsdangerous signature plus `max_age` covers the MVP threat model (hardcoded single user).
- OpenRouter is called with raw httpx rather than the OpenAI SDK: one endpoint, one model, and Structured Outputs are just a `response_format` field in the same JSON body.
- Invalid AI `board_update` payloads are dropped without failing the chat request; the reply is returned and history is saved, but the board row is left unchanged.
- OpenRouter requests set `max_tokens: 8192` and `reasoning.effort: low` so structured board updates leave room for a complete reply; `finalize_reply()` replaces ellipsis placeholders when the model still truncates.

## Commands

- `uv run uvicorn app.main:app --reload` - run dev server
- `uv run pytest` - run tests
- `uv add <pkg>` / `uv add --dev <pkg>` - manage dependencies

## Routes

- `GET /api/health` - returns `{"status": "ok"}`
- `POST /api/login` - body `{username, password}`; sets session cookie or 401
- `POST /api/logout` - clears session cookie
- `GET /api/me` - returns `{username}`; 401 when not authenticated
- `GET /api/board` - the signed-in user's board JSON (creates/seeds if missing)
- `PUT /api/board` - validates and saves the full board; 422 on invalid payloads
- `GET /api/chat` - returns `{messages: [{role, content, created_at}]}` in order (auth required)
- `POST /api/chat` - body `{message}`; returns `{reply, board_updated}` (auth required)
- `GET /` - static site
