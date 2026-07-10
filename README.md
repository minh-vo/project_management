# Project Management App

A local Kanban board app with multi-user sign-in, multiple boards per user, persistent storage, and an AI assistant that can create, edit, and move cards.

## Features

- Sign in with a session cookie; accounts come from an operator-configured list (`SEED_USERS`, defaults to `user` / `password`)
- Multiple Kanban boards per user: create, switch between, rename, and delete (at least one board always remains)
- Five-column board per board: rename columns, drag-and-drop cards, add/edit/delete cards
- Cards carry optional due date, labels, priority, and assignee
- Board state persisted in SQLite (survives container restarts)
- AI chat sidebar powered by OpenRouter (`openai/gpt-oss-120b`), scoped to the board it's opened on

## Quick start

1. Copy `.env.example` to `.env` and fill in your OpenRouter key:

   ```
   OPENROUTER_API_KEY=your_key_here
   ```

   `SESSION_SECRET` and `SEED_USERS` in that file are optional for local use (see the comments there).

2. Start the app (Docker required):

   ```bash
   ./scripts/start.sh      # Mac/Linux
   scripts\start.bat       # Windows
   ```

3. Open http://localhost:8000 and sign in with `user` / `password`.

4. Stop the app:

   ```bash
   ./scripts/stop.sh
   scripts\stop.bat
   ```

The Docker image and container are both named `pm-app`. Board data is stored in the `pm-data` volume at `/data/pm.db`.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, dnd-kit |
| Backend | Python 3.13, FastAPI, uv, stdlib sqlite3 |
| AI | OpenRouter with structured JSON outputs |
| Deploy | Multi-stage Docker (Node build + Python runtime) |

FastAPI serves the static Next.js export at `/` and the API at `/api/*`.

## Development

**Backend** (from `backend/`):

```bash
uv run uvicorn app.main:app --reload
uv run pytest
```

**Frontend** (from `frontend/`):

```bash
npm run dev          # frontend only, no API
npm run test:unit
npm run test:e2e     # against FastAPI on port 8000
```

For full-stack local work, either run the Docker container or build the frontend and serve it via uvicorn with `STATIC_DIR` pointing at `frontend/out`.

CI (`.github/workflows/ci.yml`) runs backend pytest, frontend lint/typecheck/unit tests, and the Playwright e2e suite on every push and PR.

## API routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/login` | Sign in |
| `POST` | `/api/logout` | Sign out |
| `GET` | `/api/me` | Current user |
| `GET` | `/api/users` | List of accounts (for the assignee picker) |
| `GET/POST` | `/api/boards` | List / create boards |
| `PATCH/DELETE` | `/api/boards/{id}` | Rename / delete a board |
| `GET/PUT` | `/api/boards/{id}` | Load/save a board |
| `GET/POST` | `/api/boards/{id}/chat` | Chat history / send message for a board |

## Documentation

- `docs/PLAN.md` — build plan and implementation decisions
- `docs/DATABASE.md` — SQLite schema
- `AGENTS.md` — project overview and conventions
- `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md` — area-specific detail
