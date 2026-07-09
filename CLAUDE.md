# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local Kanban board app (MVP) with hardcoded sign-in, SQLite-backed persistence, and an AI chat sidebar that can create/edit/move cards. FastAPI serves both the API and the static Next.js export. See `README.md` for feature overview and `AGENTS.md` for full business requirements and locked-in technical decisions.

Detailed, actively-maintained area docs already exist — read these before working in a given area, they go deeper than this file:
- `AGENTS.md` (root) — business requirements, technical decisions, coding standards, color scheme
- `backend/AGENTS.md` — backend module-by-module breakdown, routes, decisions
- `frontend/AGENTS.md` — frontend module-by-module breakdown, decisions, test notes/gotchas
- `scripts/AGENTS.md` — start/stop script behavior
- `docs/DATABASE.md` — SQLite schema and rationale
- `docs/PLAN.md` — build history and implementation decisions per part

## Commands

Backend (from `backend/`, Python 3.13 managed with `uv`):
```bash
uv run uvicorn app.main:app --reload   # dev server
uv run pytest                          # all tests
uv run pytest tests/test_board.py -k some_test   # single test
uv add <pkg> / uv add --dev <pkg>      # add dependency
```

Frontend (from `frontend/`):
```bash
npm run dev          # frontend only, no backend/API (login screen can't proceed)
npm run build        # static export to out/ (next.config.ts: output: "export")
npm run test:unit    # Vitest + Testing Library
npm run test:unit:watch
npm run test:e2e     # Playwright against the FastAPI-served build on port 8000
npm run test:all     # unit then e2e
npm run lint
```
Playwright reuses an already-running `pm-app` Docker container on port 8000; otherwise it builds the frontend and serves `out/` via uvicorn itself. Rebuild the container after frontend changes if e2e is reusing the running server.

Full stack via Docker (from repo root, requires `.env` with `OPENROUTER_API_KEY`):
```bash
./scripts/start.sh   # build + run container "pm-app", port 8000, volume pm-data at /data
./scripts/stop.sh     # stop + remove container (volume persists)
```

## Architecture

- **One FastAPI process serves everything**: API routes under `/api/*`, and the built Next.js static export mounted at `/` (mounted last so API routes take precedence), with an SPA fallback to `index.html` for unknown paths. `STATIC_DIR` env var controls which static directory is served (placeholder `backend/static` locally, `frontend/out` in Docker).
- **Board state is one JSON blob per user**, not relational tables — `boards.data` holds the same `BoardData` shape (`columns` array with ordered `cardIds` + `cards` map) the frontend already used before the backend existed. This is why there's no ORM: reads/writes are single-row, and the AI can consume/produce the blob directly. Full board is validated and replaced via `PUT /api/board`; there are no granular card/column endpoints.
- **Fixed columns, server-enforced**: `BoardData` validation in `backend/app/board.py` rejects any payload whose column ids aren't exactly `FIXED_COLUMN_IDS` in that order — only column titles are mutable. This mirrors validation the frontend also assumes.
- **Auth** is a single hardcoded user (`user`/`password`), an itsdangerous-signed httponly session cookie (`backend/app/auth.py`), no session table. The `CurrentUser` dependency gates every protected route with 401.
- **AI chat** (`backend/app/ai.py`) calls OpenRouter directly via raw async httpx (no SDK) with Structured Outputs (`response_format: json_schema`) requesting `{ reply, board_update }` in one call. An invalid `board_update` is silently dropped (board left unchanged) while the reply and chat history are still persisted — the chat call never hard-fails because of a bad board edit.
- **Frontend state flow**: `KanbanBoard.tsx` owns board state, loaded once from `GET /api/board`. Every mutation runs through `updateBoard()`, which flags state dirty and triggers a 400ms-debounced `PUT /api/board`; an `isDirty` ref prevents the initial load from itself triggering a save, and AI-driven refreshes (`refreshBoard()`) clear that ref so they don't echo back as a user save.
- **Drag-and-drop** uses dnd-kit with `pointerWithin`-first collision detection (falls back to `closestCorners`) — this specific ordering fixes a regression where empty space in short columns misattributed drops to neighboring taller columns; covered by an e2e regression test.
- Both `frontend/AGENTS.md` and `docs/PLAN.md` document several other non-obvious fixes/decisions (e.g. Starlette's SPA-fallback exception handling, dnd-kit `aria-disabled` breaking inline edit forms) — check there before re-deriving a fix that's already been made once.

## Coding standards (from AGENTS.md)

- Use latest/idiomatic library versions as of today.
- Keep it simple — never over-engineer, no unnecessary defensive programming, no speculative features.
- Be concise; no emojis, ever.
- When hitting an issue, identify root cause before attempting a fix — prove it with evidence, don't guess.

## Color scheme (from AGENTS.md)

- Accent Yellow `#ecad0a` — accent lines, highlights
- Blue Primary `#209dd7` — links, key sections
- Purple Secondary `#753991` — submit buttons, important actions
- Dark Navy `#032147` — main headings
- Gray Text `#888888` — supporting text, labels
