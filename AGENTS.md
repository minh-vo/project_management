# The Project Management web app

## Business Requirements

This project is a Project Management App. Key features:
- A user can sign in (one of a small, operator-configured set of accounts — see Limitations)
- When signed in, the user sees their own Kanban boards and can create, switch between, rename, and delete them (at least one board must always remain)
- Each Kanban board has fixed columns that can be renamed; the column set itself is shared/global, not customizable per board
- Cards can be moved with drag and drop, edited, and carry optional metadata: due date, labels, priority (low/medium/high), and an assignee (any signed-in user)
- There is an AI chat feature in a sidebar, scoped to the board it's opened on; the AI is able to create / edit / move one or more cards on that board

## Limitations

Multi-user sign-in uses a fixed, operator-configured account list (`SEED_USERS` env var, `username:password` pairs) rather than self-serve registration with hashed passwords — no password reset, no session revocation beyond cookie expiry. Appropriate for a small, trusted user set running locally; revisit before running this anywhere with untrusted users.

Kanban boards are per-user only — there is no sharing or collaboration between users on the same board yet.

For now, this runs locally (in a docker container).

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `openai/gpt-oss-120b` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/
- GitHub Actions CI (`.github/workflows/ci.yml`) runs backend pytest, frontend lint/typecheck/unit tests, and the Playwright e2e suite on every push/PR

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.

Implementation decisions made during the build are recorded in docs/PLAN.md ("Implementation decisions"), with area-specific detail in backend/AGENTS.md, frontend/AGENTS.md, and scripts/AGENTS.md. The database design is in docs/DATABASE.md.