# ChatGPT-style shell + persistent sessions — design

Approved scope: **2 — shell + chat surface polish** (conversation, 2026-11-25).

## Intent

A refresh currently wipes the conversation: `ChatBox` always starts from `initialMessages = []` (`src/lib/chat-transport.ts:18`) and never calls the thread API. The worker already has a complete thread API and D1 binding (`worker/index.ts:31-49,76-180`, `migrations/0001_init.sql`) that nothing uses. Connect the UI to that API and reshape the shell so the app reads like a modern AI chat app: persistent named sessions, a history sidebar, new session, and a calmer chat surface.

## Goals

- Conversations survive refresh and are reloadable from a session list.
- New session / switch session / delete session.
- Restored messages look the same as before reload, including reasoning and tool blocks.
- ChatGPT-like shell: history sidebar, centered chat column, prominent composer, clear empty state.
- Keep the existing streaming/typing experience intact.

## Non-goals

- Auth, per-user history, sharing, search, model picker, attachments, regenerating/editing messages.
- Changing `/api/chat/completions` or the model/provider setup.
- New UI dependencies (use installed shadcn/base-ui/Tailwind primitives).

## Anti-goals

- Empty threads created just by visiting the page.
- Replaying fake typing animations for restored messages.
- Losing reasoning/tool parts on reload.

## Constraints

- React 19, Vite 8, `ai` v7 / `@ai-sdk/react` v4, Cloudflare Worker + D1, no router installed.
- `useChat` supports `id`, `messages` (initial), and `onFinish({ message, messages, isAbort, isError, ... })` — verified in `node_modules/ai/dist/index-CKEJqCzY.d.ts:7060-7098`.
- Single shared history (no auth) — my call, since the user did not request per-user privacy and no auth exists.
- `pnpm run lint` and `pnpm run build` must pass.

## Approaches considered

1. **Shell only** — sidebar + persistence, chat area untouched. Too narrow: the request explicitly asks for a modern chat UI.
2. **Shell + surface polish** *(chosen)* — above plus empty state, composer, header title, message spacing. Moderate diff, reuses existing primitives, preserves streaming.
3. **Broad ChatGPT clone** — adds model picker, attachments, search. Rejected: those controls are currently placeholders and would be fake features.

## Decided how

**Persistence**

- New migration `migrations/0002_message_parts.sql`: `ALTER TABLE messages ADD COLUMN parts TEXT` (nullable JSON of `UIMessage["parts"]`). Existing `content` stays as plain text for back-compat.
- New additive endpoint `PUT /api/threads/:id/messages`, body `{ messages: [{ id, role, content, parts }] }`. Replaces the thread's messages in one `env.DB.batch`, updates `threads.updated_at`, and sets the title from the first user message when it is still `New Thread`. Existing `POST .../messages` stays unchanged.
- `GET /api/threads/:id` returns messages with `parts` decoded to an array (or `null`).
- New `src/lib/thread-api.ts`: typed client for list/create/get/delete/save.
- New `src/lib/thread-messages.ts`: DB row ↔ `ChatMessage` conversion. Rows with no `parts` become one text part; rows with `parts` are handed to `useChat` as-is (ids preserved for scroller anchors).

**Session lifecycle**

- Active thread id lives in the URL as `?thread=<id>`; `popstate` handles back/forward. No router dependency.
- No thread on first visit: typing and sending creates the thread first, then sends. Visiting never creates an empty thread.
- `ChatBox` is keyed by thread id in `App`, so switching sessions resets `useChat` state cleanly.
- `onFinish` saves the final message snapshot in one PUT, including the user message and the completed assistant reply. Empty assistant messages are filtered out. Aborted/error responses do not persist the broken reply.
- "New chat" in the sidebar creates a fresh session and selects it. Header gets a delete action for the active session.

**UI**

- `src/App.tsx`: two-pane full-height layout; sidebar ~260px, chat column centered. Sidebar collapses behind a menu button below `md`.
- New `src/components/thread-sidebar.tsx`: New chat button, session list grouped Today / Yesterday / Earlier by `updated_at`, active highlight, per-row delete.
- `src/components/ChatBox.tsx`: accepts `threadId` + `initialMessages`; header shows thread title instead of "New Thread"; remove the in-place reset button.
- Empty state: "What can I help with?" with a short description and 3 starter prompt chips that actually send.
- Composer: rounded container, bigger textarea, circular send button, add-context menu kept as-is.
- Chat column: slightly tighter message typography/spacing; markdown, trace rows, caret, thinking dots, and reduced-motion behavior unchanged.

## Left to the builder

- Exact Tailwind classes and responsive breakpoint details.
- Whether to group old sessions by date or show a flat list (date grouping preferred).
- Error messaging for failed API calls: inline toast-free text in the sidebar/header is enough.

## Verification

1. `pnpm run lint`, `pnpm run build`.
2. Browser pass on `pnpm run dev`: create session → send → refresh → history restored with reasoning/text intact → new session → switch back → delete.
