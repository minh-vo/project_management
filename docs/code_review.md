# Code Review

A full read-through of the repo — backend, frontend, tests, and Docker/scripts — done to catch bugs, gaps, and things a new contributor should know about before extending the app. Written for someone new to this codebase, so it explains *why* something matters, not just *what* to change.

**Overall**: this is a clean, well-organized MVP. The board-integrity validation (`backend/app/board.py`), the debounced-save pattern in the frontend, and the docs (`AGENTS.md` files, `docs/PLAN.md`) that record *why* past decisions were made are all genuinely good practice — keep doing that. All 29 backend tests and 18 frontend unit tests pass as of this review. The issues below are mostly about hardening an intentionally-scoped MVP, not structural problems.

How to read this: each item says what's there today, why it matters, and where to look. Severity is relative to this project's stated scope (local, single hardcoded user, MVP) — nothing here is "drop everything," but the **Do soon** items are cheap to fix and prevent real confusion for the next person who touches this code.

---

## Do soon (cheap fixes, real payoff) — all fixed

### 1. ✅ Fixed — `OPENROUTER_API_KEY` missing or OpenRouter down → raw 500 instead of a clear error
`backend/app/ai.py`'s `complete()` now checks for the env var up front and wraps the HTTP call in `try/except httpx.HTTPError`, turning a missing key, network failure, or a non-2xx OpenRouter response into a clean `HTTPException(502, ...)` instead of an uncaught `KeyError`/`httpx.HTTPStatusError`. Covered by three new tests in `backend/tests/test_ai.py` (missing key, 500 from OpenRouter, connection error) — 32 backend tests pass.

### 2. ✅ Fixed — board save failures were invisible to the user
`frontend/src/components/KanbanBoard.tsx` now tracks a `saveError` state: a failed debounced `PUT /api/board` shows a red banner ("Couldn't save your last change...") instead of only logging to the console, and it clears automatically the next time a save succeeds. Covered by a new test in `KanbanBoard.test.tsx`.

### 3. ✅ Fixed — no `.env.example`, `SESSION_SECRET` undocumented
Added `.env.example` at the repo root documenting both `OPENROUTER_API_KEY` and `SESSION_SECRET` (with a comment explaining the dev-secret fallback). `README.md`'s quick start now points at copying `.env.example` instead of writing `.env` from scratch.

### 4. ✅ Fixed — `tsc --noEmit` was failing silently
`frontend/src/test/vitest.d.ts` now references `vitest/globals` (not just `vitest`), which resolves the `describe`/`it`/`expect` "Cannot find name" errors in `kanban.test.ts`. The invalid `exact: true` option was removed from two `getByRole` calls in `KanbanBoard.test.tsx` (redundant — `name` matching is exact by default). Added a `"typecheck": "tsc --noEmit"` script to `frontend/package.json` so this has a real place to live going forward. `npm run typecheck`, `npm run lint`, `npm run test:unit`, and `npm run build` all pass clean.

---

## Worth knowing (lower urgency, good to keep in mind)

Classified against this app's actual current scope (local, single hardcoded user). **Critical** means the failure mode can happen today, in normal single-user use, not just in a hypothetical future multi-user setup. **Non-critical** means it's a hardening/quality item that matters more if the scope grows (multi-user, deployed beyond localhost, more contributors).

| # | Item | Severity |
|---|------|----------|
| 6 | Single-writer / no optimistic concurrency | **Critical — fixed** |
| 5 | No tests for AI failure modes | Non-critical |
| 7 | No delete confirmation | Non-critical |
| 8 | No length limits on user text | Non-critical |
| 9 | `finalize_reply` heuristic fragility | Non-critical |
| 10 | Docker root user + unpinned `uv:latest` | Non-critical |
| 11 | No backend linter/formatter | Non-critical |

### 6. ✅ Fixed — single-writer assumption clobbered in-flight local edits
`PUT /api/board` still always overwrites the stored board wholesale server-side (that part is unchanged and is fine for this MVP's single-board-blob design). The real bug was client-side: `ChatSidebar`'s `onBoardUpdated` callback calls `refreshBoard()` in `KanbanBoard.tsx`, which used to unconditionally re-fetch and replace local board state — including while a rename/edit was mid-debounce (or its save was still in flight), silently discarding it with no warning.

Confirmed with a test *before* fixing it: typing a column rename, then triggering an AI chat response with `board_updated: true`, reverted the input back to the stale server value ("Backlog") the instant the AI update landed. Fixed by adding an `isSaving` ref alongside the existing `isDirty` ref in `KanbanBoard.tsx`; `refreshBoard()` now skips the fetch entirely whenever an edit is pending save or currently saving, so the debounced save always gets to finish first. The AI's own change is still safely in the database — the UI just picks it up on the next refresh instead of stomping on unsaved local work. Locked in by `KanbanBoard.test.tsx`'s "does not lose an in-progress edit when an AI board update arrives" (verified to fail without the fix, pass with it).

### 5. Non-critical — AI chat has no tests for its own failure modes (now fixed)
`backend/tests/test_ai.py` covers the happy path well (reply with/without board update, invalid board update rejected, history ordering). As of the "Do soon" fixes above, it now also covers OpenRouter returning a non-2xx status, a network/connection error, and a missing API key. The one remaining gap is a test for the model returning content that isn't valid JSON (`ai.py`'s existing `json.JSONDecodeError` handling) — low priority since that path is simple and already defensive.

### 7. Non-critical — no confirmation before deleting a card
`KanbanCard.tsx`'s "Remove" button (`KanbanCard.tsx:106-113`) deletes immediately, no undo. Given there's no version history, a mis-click loses the card's details permanently. Worth a lightweight confirm (even a native `window.confirm`) if accidental deletes turn out to be a real annoyance in practice. Non-critical because it's a UX nicety, not data corruption — the rest of the board stays intact.

### 8. Non-critical — no length limits on user-supplied text
Card titles/details (`board.py`'s `Card` model) and chat messages (`ai.py`'s `ChatRequest`) accept strings of any length. A very long chat message increases OpenRouter token cost per request since full history is replayed every turn (`build_messages`, `ai.py:138-146`); a very long card title/details could visually break the fixed-width card layout. Non-critical while this only runs locally for one trusted user; would become more important if ever exposed to untrusted input.

### 9. Non-critical — `finalize_reply`'s truncation heuristic is doing a lot of guessing
`ai.py:64-87` detects truncated AI replies by checking for a trailing "..."/"…" and a blocklist of ~20 common trailing words (`INCOMPLETE_TAIL_WORDS`). It's a reasonable pragmatic fix for a real problem (documented in `backend/AGENTS.md`), and it's tested. Just flagging it as a place where "add one more word to the blocklist" is the wrong instinct if it starts misfiring — the real fix would be tuning `max_tokens`/`reasoning.effort` or asking the model for a stop condition, not growing the heuristic.

### 10. Non-critical — Docker image runs as root; `uv` is pulled from a `:latest` tag
`Dockerfile` has no `USER` directive, so the container runs as root — low risk for a local single-user tool, but an easy hardening step (`python:3.13-slim` supports adding a non-root user) if this is ever exposed beyond localhost. Separately, `COPY --from=ghcr.io/astral-sh/uv:latest` means a rebuild months from now could pull a different `uv` version than today's — pinning to a specific tag (e.g. `uv:0.5.x`) would make builds reproducible.

### 11. Non-critical — no backend linter/formatter configured
There's no `ruff`, `black`, or `mypy` config in `backend/pyproject.toml` — style consistency is currently just convention (which the code follows well). Worth adding `ruff` (format + lint in one tool, fast, minimal config) if the backend grows past a handful of files, mirroring the `eslint` setup already in place on the frontend.

---

## What's already solid (no action needed)

- **Board integrity validation** (`backend/app/board.py:28-40`): the `model_validator` catching wrong column order, orphaned cards, duplicate references, and mismatched keys is thorough and exactly the kind of validation that prevents silent data corruption from a buggy AI response or a frontend bug.
- **Debounced save with `isDirty` ref** (`KanbanBoard.tsx:43-65`): a clean, minimal way to avoid saving on initial load and to avoid AI-triggered refreshes echoing back as user saves. Well-tested (`KanbanBoard.test.tsx`'s "does not save on initial load").
- **Test coverage overall**: 29 backend tests + 18 frontend unit tests + 4 Playwright e2e specs, including a genuine regression test for the drag-and-drop collision-detection bug (`kanban.spec.ts`'s "drops a card into the empty lower area of a short column"). That's a real bug that was found and locked in with a test, not just a happy-path check.
- **`.env` hygiene**: properly gitignored and never committed — confirmed via `git log` and `git check-ignore`.
- **Docker layer ordering**: `pyproject.toml`/`uv.lock` and `package.json`/`package-lock.json` are copied (and dependencies installed) before the rest of the source, so dependency layers cache correctly across rebuilds.

---

## Suggested order of attack

1. ~~Wrap the OpenRouter call in `ai.py` with error handling (#1)~~ — done.
2. ~~Surface `putBoard` failures to the user somehow (#2)~~ — done.
3. ~~Add `.env.example` and document `SESSION_SECRET` (#3)~~ — done.
4. ~~Fix the two `tsc --noEmit` errors and wire in a `typecheck` script (#4)~~ — done.
5. ~~#6 (single-writer/concurrency: AI refresh clobbering in-flight edits)~~ — done.
6. Everything remaining in "Worth knowing" is non-critical and discretionary — revisit if/when the app's scope grows past a single local user.
