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

## Decisions locked in for Parts 11-15 (agreed with user before implementation)

- Feature scope: real multi-user accounts, multiple boards per user, and card metadata (due date, labels, priority, assignee). Explicitly out of scope: board sharing/collaboration, comments/activity log, per-board custom columns (columns stay fixed and global).
- Delivery is phased — each part independently shippable and fully tested before the next starts, rather than one large connected change.
- Auth stays a "simple shared-secret" model: a small, operator-configured `SEED_USERS` list (env var), no self-serve registration, no password-hashing dependency — closest to the original MVP's spirit while enabling multiple real accounts.
- CI is added (GitHub Actions) so "strong test coverage" is enforced going forward, not just aspirational.

## Part 11: CI pipeline

- [x] `.github/workflows/ci.yml`: backend pytest job, frontend lint/typecheck/unit job, Playwright e2e job (all AI calls mocked, so no `OPENROUTER_API_KEY` secret needed)

Tests: this part *is* the test infrastructure; validated by running the same commands locally before committing the workflow.
Success criteria: all three CI jobs pass on a clean checkout.

## Part 12: Multi-user auth foundation

- [x] `app/db.py`: `seed_users()` parses `SEED_USERS` env (`user:pass,user2:pass2`, default `user:password`); passwords live only in this env-derived dict, never in the database
- [x] `init_db()` seeds every configured user (previously just `"user"`)
- [x] `app/auth.py`: `login()` checks credentials against `seed_users()`; session cookie signs the user's **id** instead of username; `CurrentUserId` dependency (renamed from `CurrentUser`); `/api/me` does one extra lookup to return `{username}`
- [x] `app/board.py` / `app/ai.py`: routes take `user_id` directly, dropping the now-unnecessary username-to-id resolution
- [x] `tests/conftest.py` introduced (shared `temp_db` fixture and `make_client`, previously duplicated); `test_auth.py` gains DB isolation and multi-user coverage
- [x] Frontend: "Signed in as {username}" next to the Log out button

Tests: backend — second seeded user can log in with isolated `/api/me`, session cookie payload is an int; frontend — unit test for the "Signed in as" text, extended `page.test.tsx`. Full existing suite (backend + frontend unit + e2e) re-verified with zero regressions.
Success criteria: multiple operator-configured accounts can log in independently; old single-user flows are unaffected.

## Part 13: Multi-board backend

- [x] `app/db.py`: `migrate()` upgrades a pre-multi-board database in place (structural check via `PRAGMA table_info`, not a version counter) — rebuilds `boards` to drop the `UNIQUE` constraint and add `name`, adds and backfills `chat_messages.board_id`; `EMPTY_BOARD` for boards created via the UI; `ensure_user_board` no longer relies on `INSERT OR IGNORE` (no longer unique) — guarded by `WHERE NOT EXISTS`
- [x] `app/board.py`: `list_boards` / `create_board` / `rename_board` / `delete_board` / `load_board` / `save_board`, all ownership-scoped (`user_id` + `board_id`); routes under `/api/boards`; deleting a user's last board is rejected (409, checked *after* ownership so a 404 on someone else's board still wins)
- [x] `app/ai.py`: chat routes become board-scoped (`/api/boards/{id}/chat`); `chat_messages` queries filter by `board_id`
- [x] Temporary compat aliases (`/api/board`, `/api/chat` singular) kept during this part so the not-yet-updated frontend and its e2e suite stay green; removed in Part 14
- [x] `tests/test_boards.py`: CRUD, cross-user ownership isolation, chat-history-per-board isolation, and a migration regression test that hand-builds an old-schema database and asserts data survives with `init_db()` idempotent on a second run

Tests: full backend suite (43 tests) and full e2e suite (via the compat aliases, unchanged) both green.
Success criteria: a user can have multiple boards at the data/API layer with zero visible frontend change yet.

## Part 14: Multi-board frontend

- [x] `src/lib/api.ts`: `Board` type, `listBoards`/`createBoard`/`renameBoard`/`deleteBoard`; `getBoard`/`putBoard`/`getChat`/`postChat` become board-id-scoped; `request()` treats `204 No Content` as valid
- [x] `src/app/page.tsx`: owns the board list and active `boardId` (remembered per-browser in `localStorage`, falling back to most-recently-updated)
- [x] `src/components/BoardSwitcher.tsx` (new): tabs + new/rename/delete, delete hidden when it's the only board
- [x] `src/components/KanbanBoard.tsx`: takes `boardId`; parent remounts it via `key={boardId}` on switch rather than hand-resetting the debounce/`isDirty` refs — sidesteps a stale-closure `PUT` firing against the previous board
- [x] Backend compat aliases removed; `test_board.py`/`test_ai.py` ported to the board-scoped routes
- [x] e2e reset pattern overhauled: each spec creates its own uniquely-named, demo-seeded throwaway board (`tests/helpers.ts`) instead of resetting one shared board — necessary since boards are no longer singular, and avoids cross-test interference under parallel workers
- [x] `tests/boards.spec.ts` (new): create/switch/rename/delete via the UI, no card leakage between boards

Tests: two real bugs found and fixed via this verification, not by inspection — see below. Full backend (43) + frontend unit (26) + e2e (19) suites green across 3 consecutive full e2e runs.
Success criteria: a user can create, switch between, rename, and delete boards in the UI; switching boards never leaks state between them.

Bugs found during Part 14 verification (all fixed, not just noted):
- `delete_board_route`'s "last board" guard checked the requester's *own* board count before checking whether the target board belonged to them at all, so deleting a nonexistent or someone else's board ID returned 409 instead of 404 whenever the requester happened to have only one board. Fixed by checking ownership first.
- `BoardSwitcher`'s tab list used `flex-wrap`, so once enough boards existed the header grew tall enough to push the columns out of the viewport, breaking coordinate-based Playwright drag simulations in unrelated specs. Fixed with a horizontally-scrolling, non-wrapping tab row (also just a better UI for many boards).
- The switcher's `aria-pressed` flips synchronously on click, before the newly-selected board's own data fetch resolves — a test that clicked a tab and immediately interacted with the board could land on the *previous* board's about-to-unmount DOM (same test ids reused across boards). `tests/helpers.ts`'s `pickBoard` now waits for that specific board's `GET` response before returning.

## Part 15: Card metadata

- [x] `app/board.py`: `Card` gains optional `dueDate`, `labels`, `priority` (`low`/`medium`/`high`), `assigneeId` — all default to empty/null so existing board blobs deserialize unchanged, no migration needed
- [x] `app/users.py` (new): `GET /api/users` returns `[{id, username}]` for the assignee picker
- [x] Frontend: `CardMetadata` type groups the four fields; `NewCardForm`/`KanbanCard` gain due-date/priority/labels/assignee inputs and display badges
- [x] `tests/test_board.py`: metadata round-trip, defaults-without-metadata, and a backward-compat test that writes a legacy (no-metadata-keys) card JSON directly into a board row and confirms `GET` fills defaults; `tests/test_users.py` (new)
- [x] `tests/card-metadata.spec.ts` (new): due date/priority/labels/assignee survive a reload

Tests: full backend (49) + frontend unit (28) + e2e (20) suites green across 2 consecutive full e2e runs.
Success criteria: cards can carry and display due date, priority, labels, and an assignee; old boards without these fields still load correctly.
