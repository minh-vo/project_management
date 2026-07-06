# Project Plan

Detailed plan for the Project Management MVP. Each part has a checklist, tests, and success criteria. Check items off as they are completed. See `AGENTS.md` (root) for business requirements and technical decisions.

## Decisions locked in (agreed with user before implementation)

- SQLite stores one JSON board blob per user (plus a `users` table for future multi-user support)
- Sign-in is enforced server-side: login endpoint validates `user`/`password`, sets a session cookie; board and chat APIs require it
- AI chat history persists in the database per user
- Start/stop scripts are Docker-only (build image, run/stop container)
- Frontend is built with `output: "export"` and served statically by FastAPI

## Implementation decisions (made during Parts 2-10)

Infrastructure:
- Multi-stage Dockerfile: `node:24-alpine` builds the frontend, `python:3.13-slim` + uv runs the app; image and container are both named `pm-app`
- Database on a named volume `pm-data` mounted at `/data`; paths configurable via `DATABASE_PATH` and `STATIC_DIR` env vars so local dev and tests don't need Docker
- SPA fallback serves `index.html` for unknown non-API paths (current Starlette raises `starlette.exceptions.HTTPException` for missing static files — `fastapi.HTTPException` does not catch it)

Backend:
- stdlib `sqlite3`, no ORM — one JSON blob per board makes an ORM pointless for the MVP
- Connection opened per request in sync routes (FastAPI runs them in a threadpool); no pooling
- Board reads use get-or-create (`ensure_user_board`), so a new user's board appears seeded on first access
- `PUT /api/board` replaces the whole board; no granular card/column endpoints. Server-side validation enforces the fixed five column ids in order (only titles change), card keys matching card ids, and each card in exactly one column
- Session cookie signed with itsdangerous (`SESSION_SECRET` env, dev default, 7-day expiry); credentials hardcoded in `app/auth.py` per MVP scope
- OpenRouter calls via raw async httpx in `app/ai.py` (no SDK); structured chat uses `response_format: json_schema` with a Pydantic-generated schema for `{ reply, board_update }`
- Invalid `board_update` from the model is rejected server-side (BoardData validation) without corrupting the stored board; the assistant reply and chat history are still persisted

Frontend:
- Single-page auth gate (conditional render on `/api/me`), no separate `/login` route — keeps the static export to one page
- Saves are full-board `PUT`s debounced 400ms behind an `isDirty` ref, so keystroke-level changes coalesce and the initial load never triggers a save
- Drag-and-drop collision detection is `pointerWithin` with `closestCorners` fallback: pure `closestCorners` resolved drops in the empty lower area of short columns to cards in neighboring taller columns (bug found via scripted drop matrix, fixed and covered by a regression e2e test)
- Card editing is inline in the card; dnd attributes/listeners are removed while editing (dnd-kit's `aria-disabled` otherwise makes inputs unfillable)
- Chat sidebar is a collapsible right panel owned by `KanbanBoard`; history loads on open, and `board_updated` responses trigger `getBoard()` with `isDirty` cleared so AI refreshes never echo back as user saves

Testing:
- Playwright targets the FastAPI-served build on port 8000 (reuses the running container, else builds and serves via uvicorn) so e2e always exercises the deployment shape
- Backend tests use temp databases via `DATABASE_PATH`; persistence e2e tests reset the board through the API in `beforeEach` because the real database persists between runs
- OpenRouter HTTP is mocked with respx in unit tests

## Part 1: Plan

- [x] Review existing frontend code
- [x] Create `frontend/AGENTS.md` describing the existing code
- [x] Enrich this document with substeps, tests, and success criteria
- [x] User reviews and approves the plan

Success criteria: user approves the plan.

## Part 2: Scaffolding

- [x] Create `backend/` FastAPI project managed by uv (`pyproject.toml`, `uv.lock`)
- [x] FastAPI app with `GET /api/health` returning `{"status": "ok"}`
- [x] Serve a placeholder static `index.html` ("hello world") at `/` from a static dir
- [x] `Dockerfile`: Python 3.13 slim with uv, runs FastAPI via uvicorn on port 8000 (Node build stage added in Part 3)
- [x] `.dockerignore`
- [x] `scripts/start.sh` (Mac/Linux) and `scripts/start.bat` (PC): docker build + run, pass `.env`, map port 8000
- [x] `scripts/stop.sh` and `scripts/stop.bat`: stop and remove container
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md`

Tests: backend unit test for `/api/health` (pytest + httpx).
Success criteria: `scripts/start.sh` builds and runs the container; browser at `http://localhost:8000/` shows hello world page; `curl localhost:8000/api/health` returns ok; `scripts/stop.sh` stops it.

## Part 3: Add in Frontend

- [x] Set `output: "export"` in `next.config.ts`
- [x] Docker Node stage builds frontend; copy `out/` into the image; FastAPI serves it at `/` (SPA fallback to `index.html`)
- [x] Keep local dev workflow working (`npm run dev` still fine for frontend-only work)
- [x] Point Playwright config at the FastAPI-served build (port 8000) so e2e tests exercise the real deployment shape

Tests: existing Vitest unit tests pass; Playwright e2e (board loads, add card, drag card) pass against the container-served site; backend test that `/` returns the built index.
Success criteria: `http://localhost:8000/` shows the demo Kanban board served from the container; all tests green.

## Part 4: Fake user sign in

- [x] Backend: `POST /api/login` (validates `user`/`password`), `POST /api/logout`, `GET /api/me`; signed session cookie (httponly, itsdangerous or similar)
- [x] Backend: auth dependency that returns 401 for protected routes without a valid session
- [x] Frontend: login page/screen shown when not authenticated; logout button in the board header
- [x] Frontend: auth state via `/api/me` on load; redirect to login when 401
- [x] Style login with the project color scheme (purple submit button, navy headings)

Tests: backend unit tests for login success/failure, logout, protected route 401/200; frontend component tests for the login form; Playwright e2e: visiting `/` unauthenticated shows login, bad credentials rejected, good credentials show board, logout returns to login.
Success criteria: cannot see or call the board without logging in; login/logout round trip works in the container.

## Part 5: Database modeling

- [x] Write `docs/DATABASE.md` proposing the schema:
  - `users` (id, username, created_at)
  - `boards` (id, user_id FK, data JSON blob — columns + cards in the same shape as the frontend `BoardData`, updated_at)
  - `chat_messages` (id, user_id FK, role, content, created_at)
- [x] Document: SQLite file location (volume-mounted so data survives container restarts), creation on first run, seeding the default user and initial demo board
- [x] User reviews and approves the schema

Success criteria: user signs off on `docs/DATABASE.md`.

## Part 6: Backend board API

- [x] SQLite setup (sqlite3 or SQLAlchemy) with create-if-missing on startup; seed default user + demo board
- [x] `GET /api/board` returns the signed-in user's board JSON
- [x] `PUT /api/board` validates (Pydantic models mirroring `BoardData`) and saves the full board
- [x] Docker volume for the database file

Tests: backend unit tests using a temp database — board created/seeded on first access, get returns seed data, put persists and get reflects it, invalid payloads 422, unauthenticated 401.
Success criteria: all backend tests pass; board data survives container restart via the volume.

## Part 7: Frontend + Backend

- [x] Frontend API client (`src/lib/api.ts`) for login/logout/me/board get/put
- [x] `KanbanBoard` loads board from `GET /api/board` on mount (loading state) instead of `initialData`
- [x] All mutations (move, rename column, add/edit/delete card) update local state then persist via `PUT /api/board` (debounced)
- [x] Add card edit UI (title and details) — required by business requirements, currently missing

Tests: Vitest tests with mocked API for load/save and edit; Playwright e2e: add a card, reload page, card still there; rename column persists; move card persists; edit card persists.
Success criteria: board is fully persistent across reloads and container restarts; all tests green.

## Part 8: AI connectivity

- [x] Backend OpenRouter client (async httpx) using `OPENROUTER_API_KEY` from env, model `openai/gpt-oss-120b`
- [x] Temporary `POST /api/ai/test` route asking the model "what is 2+2" and returning the reply

Tests: unit test with mocked HTTP for request shape and response parsing; one live connectivity check (manual or opt-in test) confirming a real answer containing "4".
Success criteria: live call through the container succeeds, proving env var wiring and connectivity.

## Part 9: AI chat with Structured Outputs

- [x] Define Structured Output JSON schema: `{ reply: string, board_update: BoardData | null }`
- [x] `POST /api/chat`: loads user's board JSON and chat history, sends system prompt + board + history + new message to OpenRouter with the response schema
- [x] If `board_update` is present, validate and save it as the user's board
- [x] Persist user and assistant messages to `chat_messages`; `GET /api/chat` returns history
- [x] Remove the temporary `/api/ai/test` route

Tests: unit tests with mocked OpenRouter — reply without board update, reply with board update (board saved), invalid board update rejected without corrupting the board, history persisted and returned in order, unauthenticated 401.
Success criteria: via curl/tests, a chat message like "add a card called X to Backlog" updates the stored board and returns a sensible reply.

## Part 10: AI chat sidebar UI

- [x] Collapsible chat sidebar next to the board, styled with the project color scheme
- [x] Loads history from `GET /api/chat` on open; sends messages to `POST /api/chat`
- [x] Message list (user/assistant bubbles), input with submit, pending/typing state, error state
- [x] When a response includes a board update, refresh the board in place automatically
- [x] Polish pass: layout works with sidebar open/closed, no color scheme violations

Tests: Vitest component tests with mocked API (render history, send message, board refresh trigger); Playwright e2e with the real backend: log in, ask the AI to create a card, see the card appear on the board without a manual reload.
Success criteria: full flow works in the container — sign in, chat with AI, AI moves/creates/edits cards, board updates live; all unit, backend, and e2e tests pass.
