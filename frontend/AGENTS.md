# Frontend

Next.js 16 (App Router) + React 19 + Tailwind CSS 4 single-page Kanban board app, backed by the FastAPI backend (auth + persistent board API + AI chat).

## Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4 (via `@tailwindcss/postcss`), design tokens as CSS variables in `src/app/globals.css`
- Drag and drop: `@dnd-kit/core` + `@dnd-kit/sortable`
- Unit tests: Vitest + Testing Library (jsdom), config in `vitest.config.ts`
- E2E tests: Playwright (chromium), config in `playwright.config.ts`. Tests run against the FastAPI-served static build on port 8000: if the Docker container is already running it is reused; otherwise the config builds the frontend and serves `out/` via uvicorn (`STATIC_DIR` env var).

## Structure

- `src/app/layout.tsx` - root layout, loads Google fonts (Space Grotesk display, Manrope body), metadata
- `src/app/page.tsx` - client-side auth gate: calls `/api/me` on mount, shows `LoginForm` when unauthenticated, otherwise `KanbanBoard` with a logout handler
- `src/lib/api.ts` - fetch-based API client (`me`, `login`, `logout`, `getBoard`, `putBoard`, `getChat`, `postChat`), throws `ApiError` with status on non-2xx
- `src/components/LoginForm.tsx` - styled login form; shows error on invalid credentials
- `src/components/ChatSidebar.tsx` - collapsible AI chat panel: loads history on open (`GET /api/chat`), user/assistant bubbles, send form with pending and error states, calls `onBoardUpdated` when `POST /api/chat` returns `board_updated: true`
- `src/lib/kanban.ts` - core types and logic:
  - `Card` (`id`, `title`, `details`), `Column` (`id`, `title`, `cardIds` ordered array), `BoardData` (`columns` array + `cards` keyed map)
  - `initialData`: hardcoded demo board with 5 columns (Backlog, Discovery, In Progress, Review, Done) and 8 cards
  - `moveCard(columns, activeId, overId)`: pure function handling reorder within a column and moves across columns (drop on card or on empty column)
  - `createId(prefix)`: random + timestamp id generator
- `src/components/KanbanBoard.tsx` - client component owning board state and chat sidebar toggle. Loads the board from `GET /api/board` on mount (loading state until then); every mutation goes through `updateBoard()`, which marks the state dirty and triggers a debounced (400ms) `PUT /api/board`. The `isDirty` ref prevents saving right after load. `refreshBoard()` clears `isDirty` and re-fetches after AI updates. Wires DndContext (pointerWithin-first collision detection), handles drag, rename, add/edit/delete card.
- `src/components/KanbanColumn.tsx` - droppable column; title is an inline `<input>` (rename on change); renders sortable card list, empty-state drop zone, and `NewCardForm`
- `src/components/KanbanCard.tsx` - sortable card with Edit (inline title/details form; sortable disabled and dnd attributes/listeners removed while editing so inputs stay enabled) and Remove buttons
- `src/components/KanbanCardPreview.tsx` - static card rendering used in the `DragOverlay` while dragging
- `src/components/NewCardForm.tsx` - collapsed "Add a card" button expanding to title/details form

## Decisions

- Auth is a client-side gate in `page.tsx` (conditional render on `/api/me`), not a separate `/login` route: keeps the static export a single page while the backend still enforces access on every API call.
- Persistence saves the whole board via `PUT /api/board`, debounced 400ms behind an `isDirty` ref: keystroke-level edits (column rename) coalesce into one save, and the initial `GET` never triggers a write.
- Collision detection is `pointerWithin` first, `closestCorners` fallback: pure `closestCorners` resolved drops in the empty lower area of short columns to cards in neighboring taller columns (card bounced back). Regression e2e test in `tests/kanban.spec.ts`.
- Card editing is inline within the card, with dnd attributes/listeners removed while editing: dnd-kit's `attributes` set `aria-disabled`, which makes form inputs unfillable.
- Chat sidebar loads history lazily when opened (not on board mount). AI board refreshes use `getBoard()` with `isDirty` cleared so they do not trigger a debounced `PUT`.

## Tests

- `src/lib/kanban.test.ts` - unit tests for `moveCard` logic
- `src/components/KanbanBoard.test.tsx` - component tests (render, rename, add/delete card)
- `src/components/ChatSidebar.test.tsx` - chat UI tests with mocked API (history, send, board refresh callback, error)
- `src/components/LoginForm.test.tsx`, `src/app/page.test.tsx` - auth UI tests with mocked API
- `tests/kanban.spec.ts` - Playwright e2e: board loads, add card, drag between columns (logs in via API in beforeEach)
- `tests/persistence.spec.ts` - Playwright e2e: add/rename/move/edit/delete survive reload. Resets the board via `PUT /api/board` in beforeEach (the database persists between runs) and waits for the debounced save response before reloading.
- `tests/auth.spec.ts` - Playwright e2e: login required, bad credentials rejected, login/reload/logout flow. Note: Next.js injects a route-announcer div with `role="alert"`, so target error messages by text, not role.
- `tests/chat.spec.ts` - Playwright e2e: open sidebar, history display, board refresh after mocked AI update, close sidebar layout
- Run: `npm run test:unit`, `npm run test:e2e`, or `npm run test:all`

## Notable details and gaps

- Test hooks: columns render `data-testid="column-<id>"`, cards `data-testid="card-<id>"`, chat uses `chat-toggle`, `chat-sidebar`, `chat-messages`, `chat-input`
- dnd-kit sortable wrappers have `role="button"`, so in tests target inner buttons by exact accessible name (e.g. `{ name: "Save" }`), not broad regexes
- Close the chat sidebar with `{ name: "Close chat" }`, not `/close/i` (matches card titles like "Close onboarding sprint")
- `npm run dev` on its own has no backend, so the login screen cannot proceed; use the FastAPI-served build for full-stack work
- `next.config.ts` sets `output: "export"`; `npm run build` emits the static site to `out/`, which the Docker image serves via FastAPI. Rebuild the container after frontend changes when e2e reuses the running server on port 8000.
