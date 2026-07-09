# Project Management MVP

A local Kanban board app with sign-in, persistent storage, and an AI assistant that can create, edit, and move cards.

## Features

- Sign in with a session cookie (MVP: hardcoded `user` / `password`)
- Five-column Kanban board: rename columns, drag-and-drop cards, add/edit/delete cards
- Board state persisted in SQLite (survives container restarts)
- AI chat sidebar powered by OpenRouter (`openai/gpt-oss-120b`)

## Quick start

1. Copy `.env.example` to `.env` and fill in your OpenRouter key:

   ```
   OPENROUTER_API_KEY=your_key_here
   ```

   `SESSION_SECRET` in that file is optional for local use (see the comment there).

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

## API routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/login` | Sign in |
| `POST` | `/api/logout` | Sign out |
| `GET` | `/api/me` | Current user |
| `GET/PUT` | `/api/board` | Load/save board |
| `GET/POST` | `/api/chat` | Chat history / send message |

## Documentation

- `docs/PLAN.md` — build plan and implementation decisions
- `docs/DATABASE.md` — SQLite schema
- `AGENTS.md` — project overview and conventions
- `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md` — area-specific detail
