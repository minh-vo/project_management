# Frontend

Next.js 16 (App Router) + React 19 + Tailwind CSS 4 single-page Kanban board app, backed by the FastAPI backend (multi-user auth + multi-board API + AI chat).

## Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4 (via `@tailwindcss/postcss`), design tokens as CSS variables in `src/app/globals.css`
- Drag and drop: `@dnd-kit/core` + `@dnd-kit/sortable`
- Unit tests: Vitest + Testing Library (jsdom), config in `vitest.config.ts`
- E2E tests: Playwright (chromium), config in `playwright.config.ts`. Tests run against the FastAPI-served static build on port 8000: if the Docker container is already running it is reused; otherwise the config builds the frontend and serves `out/` via uvicorn (`STATIC_DIR` env var).

## Structure

- `src/app/layout.tsx` - root layout, loads Google fonts (Space Grotesk display, Manrope body), metadata
- `src/app/page.tsx` - client-side auth gate: calls `/api/me` on mount, shows `LoginForm` when unauthenticated; once authenticated, fetches the user's boards (`listBoards()`) and picks a default (last-selected board remembered in `localStorage` under `pm:lastBoardId`, falling back to most-recently-updated), then renders `KanbanBoard`. Owns the board list and create/rename/delete handlers passed down as props.
- `src/lib/api.ts` - fetch-based API client (`me`, `login`, `logout`, `listUsers`, `listBoards`, `createBoard`, `renameBoard`, `deleteBoard`, `getBoard`, `putBoard`, `getChat`, `postChat` — the last four all board-id-scoped), throws `ApiError` with status on non-2xx; treats `204 No Content` as a valid empty response
- `src/components/LoginForm.tsx` - styled login form; shows error on invalid credentials
- `src/components/BoardSwitcher.tsx` - board tab list (horizontally scrollable, not wrapping, so a large board count never pushes the columns below the fold) plus new/rename/delete controls for the active board; delete is hidden when it's the user's only board
- `src/components/ChatSidebar.tsx` - collapsible AI chat panel, takes a `boardId` prop: loads history on open (`GET /api/boards/{id}/chat`), user/assistant bubbles, send form with pending and error states, calls `onBoardUpdated` when `POST /api/boards/{id}/chat` returns `board_updated: true`
- `src/lib/kanban.ts` - core types and logic:
  - `Card` (`id`, `title`, `details`, plus optional `dueDate`, `labels`, `priority`, `assigneeId`), `Column` (`id`, `title`, `cardIds` ordered array), `BoardData` (`columns` array + `cards` keyed map)
  - `CardMetadata` / `emptyCardMetadata` - the four optional card fields grouped for form state, threaded through `onAddCard`/`onEditCard` instead of four separate positional args
  - `initialData`: hardcoded demo board with 5 columns (Backlog, Discovery, In Progress, Review, Done) and 8 cards
  - `moveCard(columns, activeId, overId)`: pure function handling reorder within a column and moves across columns (drop on card or on empty column)
  - `createId(prefix)`: random + timestamp id generator
- `src/components/KanbanBoard.tsx` - client component owning board state, users list, and chat sidebar toggle for one `boardId`. Loads the board from `GET /api/boards/{id}` on mount (loading state until then) and `listUsers()` once for the assignee picker; every mutation goes through `updateBoard()`, which marks the state dirty and triggers a debounced (400ms) `PUT /api/boards/{id}`. The `isDirty` ref prevents saving right after load. `refreshBoard()` clears `isDirty` and re-fetches after AI updates. Renders `BoardSwitcher` in its header (props passed through from `page.tsx`). Parent remounts this component via `key={boardId}` on board switch — see Decisions.
- `src/components/KanbanColumn.tsx` - droppable column; title is an inline `<input>` (rename on change); renders sortable card list, empty-state drop zone, and `NewCardForm`
- `src/components/KanbanCard.tsx` - sortable card with Edit (inline title/details/metadata form; sortable disabled and dnd attributes/listeners removed while editing so inputs stay enabled) and Remove buttons; displays priority/due-date/assignee/label badges when set
- `src/components/KanbanCardPreview.tsx` - static card rendering used in the `DragOverlay` while dragging
- `src/components/NewCardForm.tsx` - collapsed "Add a card" button expanding to a title/details/due-date/priority/labels/assignee form

## Decisions

- Auth is a client-side gate in `page.tsx` (conditional render on `/api/me`), not a separate `/login` route: keeps the static export a single page while the backend still enforces access on every API call.
- Board switching is also client-side state (no Next.js dynamic routes), consistent with the single-page/static-export pattern: no board-sharing feature exists yet to make shareable board URLs worthwhile.
- Switching boards remounts `KanbanBoard` via `<KanbanBoard key={boardId} .../>` in `page.tsx`, rather than hand-resetting the `isDirty`/`isSaving` refs and pending debounce timer in place: a stale-closure `PUT` firing against the *previous* board after switching is a real risk (see the Playwright test-helper note in `tests/`), and remounting sidesteps it entirely by construction. `ChatSidebar` resets for free since it's a child of the remounted tree.
- Persistence saves the whole board via `PUT /api/boards/{id}`, debounced 400ms behind an `isDirty` ref: keystroke-level edits (column rename) coalesce into one save, and the initial `GET` never triggers a write.
- Collision detection is `pointerWithin` first, `closestCorners` fallback: pure `closestCorners` resolved drops in the empty lower area of short columns to cards in neighboring taller columns (card bounced back). Regression e2e test in `tests/kanban.spec.ts`.
- Card editing is inline within the card, with dnd attributes/listeners removed while editing: dnd-kit's `attributes` set `aria-disabled`, which makes form inputs unfillable.
- Chat sidebar loads history lazily when opened (not on board mount). AI board refreshes use `getBoard()` with `isDirty` cleared so they do not trigger a debounced `PUT`.
- Card metadata fields (due date, labels, priority, assignee) are optional and additive on the `Card` type; labels are a free-form comma-separated text input (no managed tag vocabulary), and `assigneeId` is picked from the full app-wide user list (`listUsers()`) since board sharing doesn't exist yet to make a narrower "board's users" pool meaningful.

## Tests

- `src/lib/kanban.test.ts` - unit tests for `moveCard` logic
- `src/components/KanbanBoard.test.tsx` - component tests (render, rename, add/delete card, card metadata add/edit, AI-update-vs-in-progress-edit race)
- `src/components/BoardSwitcher.test.tsx` - tab rendering/selection, create/rename/delete, delete hidden when it's the only board
- `src/components/ChatSidebar.test.tsx` - chat UI tests with mocked API (history, send, board refresh callback, error)
- `src/components/LoginForm.test.tsx`, `src/app/page.test.tsx` - auth UI tests with mocked API
- `tests/kanban.spec.ts` - Playwright e2e: board loads, add card, drag between columns
- `tests/persistence.spec.ts` - Playwright e2e: add/rename/move/edit/delete survive reload
- `tests/card-metadata.spec.ts` - Playwright e2e: due date/priority/labels/assignee survive reload
- `tests/boards.spec.ts` - Playwright e2e: create/switch/rename/delete boards, no card leakage between boards
- `tests/auth.spec.ts` - Playwright e2e: login required, bad credentials rejected, login/reload/logout flow. Note: Next.js injects a route-announcer div with `role="alert"`, so target error messages by text, not role.
- `tests/chat.spec.ts` - Playwright e2e: open sidebar, history display, board refresh after mocked AI update, close sidebar layout
- `tests/helpers.ts` - shared e2e setup: `loginAndCreateBoard` creates a uniquely-named, demo-seeded throwaway board per test (isolation — all specs share one seeded account, so a hardcoded board name would collide across parallel tests); `pickBoard`/`openBoard` select a board and wait for *that board's own* `GET` response before returning (not just the switcher's `aria-pressed` flip, which updates synchronously before the new board's data has actually loaded — acting on a locator immediately after can hit the previous board's about-to-unmount DOM); `waitForBoardSave` scopes a save-wait to one board's id so a concurrent test's save can't satisfy it early
- Run: `npm run test:unit`, `npm run test:e2e`, or `npm run test:all`

## Notable details and gaps

- Test hooks: columns render `data-testid="column-<id>"`, cards `data-testid="card-<id>"`, board tabs `data-testid="board-tab-<id>"`, switcher `data-testid="board-switcher"`, chat uses `chat-toggle`, `chat-sidebar`, `chat-messages`, `chat-input`
- dnd-kit sortable wrappers have `role="button"`, so in tests target inner buttons by exact accessible name (e.g. `{ name: "Save" }`), not broad regexes
- Close the chat sidebar with `{ name: "Close chat" }`, not `/close/i` (matches card titles like "Close onboarding sprint")
- `npm run dev` on its own has no backend, so the login screen cannot proceed; use the FastAPI-served build for full-stack work
- `next.config.ts` sets `output: "export"`; `npm run build` emits the static site to `out/`, which the Docker image serves via FastAPI. Rebuild the container after frontend changes when e2e reuses the running server on port 8000.
- E2E specs all share one seeded account (`user`/`password`) and create their own throwaway boards rather than resetting a single shared board — boards accumulate in the local dev database across repeated manual test runs (no `afterEach` cleanup); this is harmless for CI (fresh container each run) but if the switcher gets unwieldy during local iteration, wipe `backend/data/pm.db` (or point `DATABASE_PATH` at a scratch file) to reset.
