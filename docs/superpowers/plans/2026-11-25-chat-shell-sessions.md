# ChatGPT-style Shell + Persistent Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing D1 thread API into the UI and reshape the app into a modern chat shell with persistent sessions, a history sidebar, and a polished chat surface.

**Architecture:** The worker already owns thread/message CRUD; extend it with one snapshot-replace endpoint and a `parts` column so full UI messages survive reload. A small typed client in `src/lib/` connects React to that API. `App` owns active-session URL state and the sidebar; `ChatBox` owns the conversation, creates a session lazily on first send, and saves the final snapshot in `onFinish`. No router or new UI dependency.

**Tech Stack:** React 19, Vite 8, `ai` v7, `@ai-sdk/react` v4, Cloudflare Worker + D1, Tailwind 4, base-ui/shadcn primitives, Node 26 test runner (`node --test`, native TS stripping).

**Spec:** `docs/superpowers/specs/2026-11-25-chat-shell-sessions-design.md`

## Global Constraints

- No auth; history is shared by everyone using the deployment.
- Do not change `/api/chat/completions`, the model, or the transport's streaming parser.
- No new dependencies. Use existing UI primitives in `src/components/ui/`.
- Keep thinking dots, streaming caret, markdown, trace rows, and reduced-motion behavior working.
- Visiting the page must not create an empty thread.
- Tests: `node --test tests/*.test.ts` (verified working on Node 26.7.0 with native TS stripping; tests import `.ts` paths directly).
- Verification for every task: `pnpm run lint` and `pnpm run build` must pass.
- Never print or commit secret values from `wrangler.jsonc` or `.dev.vars`.

## Review Focus

1. **Refresh mid-conversation** — active thread id in `?thread=` must restore messages; test: browser pass Task 4, step 6.
2. **Restored message fidelity** — `reasoning` / `tool-runCommand` parts must survive the DB round-trip; test: `tests/thread-messages.test.ts` round-trip case.
3. **Legacy rows** — rows with `parts = null` (pre-migration) must still render as text; test: `tests/thread-messages.test.ts` legacy case.
4. **Aborted or errored replies** — a broken assistant reply must not be persisted; test: browser pass Task 4, step 6 (stop generation, refresh).
5. **First send with no session** — no empty thread on visit, but the first message is saved; test: `tests/worker-threads.test.ts` title case + browser pass Task 4, step 6.

---

### Task 1: Worker persistence API

**Files:**
- Create: `migrations/0002_message_parts.sql`
- Modify: `worker/index.ts:31-49`, `worker/index.ts:115-180`
- Create: `tests/worker-threads.test.ts`, `tests/support/fake-d1.ts`

**Interfaces:**
- Consumes: existing `threads` / `messages` tables from `migrations/0001_init.sql`; `Env.DB` is a D1 binding.
- Produces:
  - `PUT /api/threads/:id/messages`, body `{ messages: Array<{ id: string; role: string; content: string; parts: unknown[] }> }` → `{ success: true }`, status 200.
  - `GET /api/threads/:id` → thread fields + `messages: Array<{ id, role, content, parts: unknown[] | null, created_at }>`.
  - `handleSaveMessages` export not required; tests call the worker's default `fetch(request, env)`.

- [ ] **Step 1: Add the migration**

Create `migrations/0002_message_parts.sql` with exactly `ALTER TABLE messages ADD COLUMN parts TEXT;` (nullable JSON). Keep `content` as plain text.

- [ ] **Step 2: Write failing worker tests**

In `tests/worker-threads.test.ts`, use `node:test` + `node:assert/strict`, the fake D1 helper from `tests/support/fake-d1.ts`, and `worker.fetch` imported from `../worker/index.ts`. Cover:
  - `PUT /api/threads/t1/messages` replaces the prior message set, sets `parts` to JSON text, updates `threads.updated_at`, and sets title from the first user message when it is `New Thread`.
  - `PUT` on a missing thread returns 404 and leaves no messages.
  - `PUT` with a non-string `id` or unsupported `role` returns 400.
  - `GET /api/threads/t1` decodes stored `parts` back into an array and returns `null` for legacy rows with no `parts`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/worker-threads.test.ts`
Expected: FAIL (PUT route not handled, missing `parts` in GET).

- [ ] **Step 4: Implement the worker changes**

In `worker/index.ts`, route `PUT /^\\/api\\/threads\\/[^/]+\\/messages$/` to a new `handleSaveMessages(threadId, request, env)`. Validate every message has string `id`, `role`, `content` and array `parts`; allow roles `user`, `assistant`, `system`, `tool`. On validation failure return 400. Check the thread exists (404 otherwise). In one `env.DB.batch([...])`: delete old rows for the thread, insert new rows with `JSON.stringify(parts)`, update `threads.updated_at`, and update `title` from the first user message's content only while it equals `New Thread`. In `handleGetThread`, select `parts` and `JSON.parse` it when non-null (fall back to `null` on malformed JSON). Keep existing POST/GET/DELETE handlers otherwise unchanged.

- [ ] **Step 5: Run tests and checks**

Run: `node --test tests/worker-threads.test.ts && pnpm run lint && pnpm run build`
Expected: PASS. Then apply the migration locally with `npx wrangler d1 migrations apply mishu-threads --local` (remote apply is left to the user at deploy time).

- [ ] **Step 6: Commit**

`git add migrations/0002_message_parts.sql worker/index.ts tests/worker-threads.test.ts tests/support/fake-d1.ts && git commit -m "feat: persist full messages in thread snapshot API"`

---

### Task 2: Typed client and message conversion

**Files:**
- Create: `src/lib/thread-api.ts`, `src/lib/thread-messages.ts`, `tests/thread-messages.test.ts`

**Interfaces:**
- Consumes: the worker API shapes from Task 1 and `ChatMessage` from `src/lib/chat-transport.ts`.
- Produces:
  - `ThreadSummary = { id: string; title: string; created_at: number; updated_at: number }`
  - `StoredMessage = { id: string; role: string; content: string; parts: unknown[] | null; created_at?: number }`
  - `ThreadDetail = ThreadSummary & { messages: StoredMessage[] }`
  - `listThreads(): Promise<ThreadSummary[]>`, `createThread(title?: string): Promise<ThreadSummary>`, `getThread(id: string): Promise<ThreadDetail>`, `deleteThread(id: string): Promise<void>`, `saveMessages(id: string, messages: Array<{ id: string; role: string; content: string; parts: unknown[] }>): Promise<void>`
  - `toChatMessages(rows: StoredMessage[]): ChatMessage[]`, `toStoredMessages(messages: ChatMessage[]): Array<{ id: string; role: string; content: string; parts: unknown[] }>`

- [ ] **Step 1: Write failing conversion tests**

In `tests/thread-messages.test.ts`, cover: a message with a `reasoning` part and a `tool-runCommand` part round-trips through `toStoredMessages` → `toChatMessages` with part `type`, `text`/`input`/`output`, and message `id` unchanged; a legacy row with `parts: null` becomes exactly one `{ type: "text", text: content }` part; `content` is the concatenation of text parts.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/thread-messages.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `src/lib/thread-messages.ts`**

Use `messageContent` from `chat-transport.ts` for `content`. Copy `parts` by value (`structuredClone` or JSON round-trip) so streamed objects are not shared. Set `role` only for `user`, `assistant`, `system`, `tool`; default other roles to `assistant`. Preserve message `id`.

- [ ] **Step 4: Implement `src/lib/thread-api.ts`**

Fetch helper with `Accept: application/json` and `Content-Type: application/json` where relevant; throw `Error` including response status/body on non-2xx (204 on delete counts as success). `saveMessages` sends `{ messages }` to `PUT /api/threads/${encodeURIComponent(id)}/messages`.

- [ ] **Step 5: Run tests and checks**

Run: `node --test tests/*.test.ts && pnpm run lint && pnpm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add src/lib/thread-api.ts src/lib/thread-messages.ts tests/thread-messages.test.ts && git commit -m "feat: add thread API client and message conversion"`

---

### Task 3: App shell and session sidebar

**Files:**
- Create: `src/components/thread-sidebar.tsx`
- Modify: `src/App.tsx`, `src/App.css`

**Interfaces:**
- Consumes: `ThreadSummary`, `listThreads`, `createThread`, `deleteThread` from Task 2.
- Produces:
  - `<ThreadSidebar threads={ThreadSummary[]} activeId={string | null} onSelect={(id: string) => void} onNew={() => void} onDelete={(id: string) => void} />`
  - `App` owns: `activeThreadId` (from `?thread=`), `chatKey` (`activeThreadId ?? "draft"`), `threads`, `title`, `initialMessages`, `loading`, and `ensureThread(): Promise<string>` which creates+selects a thread only when none is active.
  - `App` passes to `ChatBox` (Task 4): `key={chatKey}` (forces remount only on explicit session switch), `title`, `initialMessages`, `ensureThread`, `onDeleted`.

- [ ] **Step 1: Build the sidebar component**

`ThreadSidebar` renders a New chat button, then sessions grouped by `updated_at` into Today / Yesterday / Earlier (local date), each row showing `title` with delete on hover. Active row gets a visible highlight. Below `md`, render a menu button that toggles an overlay panel; no new dependency.

- [ ] **Step 2: Wire URL-driven session state in `App.tsx`**

On mount, load `listThreads()`. If `?thread=` is present, load `getThread(id)` and `toChatMessages(...)`; on 404 clear the parameter and show a draft. Handle `popstate` to follow back/forward. Selecting a session updates `?thread=` with `history.pushState`, sets `chatKey` to that id, and reloads its messages. New chat clears the parameter and sets `chatKey = "draft"`. Deleting a session removes it from state and, if active, returns to draft.

- [ ] **Step 3: Style the two-pane shell**

Full-height `flex` layout: sidebar ~260px with border and scrollable list; chat pane `flex-1 min-w-0`. Keep the existing `h-dvh` behavior and dark theme tokens from `App.css`.

- [ ] **Step 4: Run checks**

Run: `pnpm run lint && pnpm run build`
Expected: PASS. Verify in browser that the sidebar lists threads and selecting one changes `?thread=`.

- [ ] **Step 5: Commit**

`git add src/components/thread-sidebar.tsx src/App.tsx src/App.css && git commit -m "feat: add ChatGPT-style session sidebar"`

---

### Task 4: ChatBox session wiring and surface polish

**Files:**
- Modify: `src/components/ChatBox.tsx`

**Interfaces:**
- Consumes props from Task 3: `chatKey: string`, `title: string`, `initialMessages: ChatMessage[]`, `ensureThread: () => Promise<string>`, `onDeleted: () => void`.
- Produces: a `ChatBox` that creates a session on first send, saves a message snapshot on `onFinish`, and renders the polished surface.

- [ ] **Step 1: Change the component signature**

`export function ChatBox({ title, initialMessages, ensureThread, onDeleted }: ChatBoxProps)`; remove the `initialMessages` import from `chat-transport.ts`. Keep a `threadIdRef = React.useRef<string | null>(null)` for the active save target.

- [ ] **Step 2: Save on stream finish**

Pass `onFinish: ({ messages: finalMessages, isAbort, isError }) => { ... }` to `useChat`. If `isAbort || isError`, drop the last message (the broken reply); then `void saveMessages(threadIdRef.current, toStoredMessages(snapshot))`. Ignore empty snapshots. Do not save while `threadIdRef.current` is null.

- [ ] **Step 3: Create the session on first send**

In `onSubmit`, when `threadIdRef.current` is null, `await ensureThread()` first, store the returned id in the ref, then `sendMessage({ text })`. Use one shared `submit(text)` helper for the form and the empty-state starter chips. Keep `chatKey` remount behavior owned by `App` (Task 3), so creating a session mid-stream does not remount `useChat`.

- [ ] **Step 4: Polish the surface**

Header shows `title` and a delete action (`onDeleted`) instead of the fixed "New Thread" label and in-place reset. Empty state shows "What can I help with?", a short description, and three clickable starter prompts using `submit`. Composer gets a rounded container, larger textarea, and circular send button while keeping the add-context dropdown. Tighten message spacing/typography without touching `Markdown`, `StepRow`, caret, or thinking dots.

- [ ] **Step 5: Run checks**

Run: `pnpm run lint && pnpm run build`
Expected: PASS.

- [ ] **Step 6: Browser verification**

Run `pnpm run dev` and confirm: (a) fresh page shows empty state and no thread is created until first send; (b) send a message, reply streams; (c) refresh — messages and reasoning/tool blocks are restored from `?thread=`; (d) New chat then switch back via sidebar restores the old session; (e) delete a session removes it; (f) stop generation mid-reply and refresh — no partial assistant reply is restored. Fix anything that fails before finishing.

- [ ] **Step 7: Commit**

`git add src/components/ChatBox.tsx && git commit -m "feat: wire chat to sessions and polish chat surface"`

---

### Task 5: Final verification and documentation

**Files:**
- Modify: `GLOSSARY.md`

**Interfaces:** none.

- [ ] **Step 1: Update glossary**

Add terms for **thread/session**, **ThreadSummary**, **StoredMessage**, and **snapshot save** with file references.

- [ ] **Step 2: Full verification**

Run: `node --test tests/*.test.ts && pnpm run lint && pnpm run build`
Expected: PASS. Then repeat the browser pass from Task 4 step 6 once after the final build.

- [ ] **Step 3: Commit**

`git add GLOSSARY.md && git commit -m "docs: describe session persistence terms"`
