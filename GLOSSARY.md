# Glossary

**ChatMessage** — A `UIMessage` in the conversation, typed with parts of kind `reasoning`, `tool-runCommand`, and text. Defined in `src/lib/chat-transport.ts:4`.

**ChatPart** — A single part of a `ChatMessage` (`ChatMessage["parts"][number]`).

**ToolPart** — A `ChatPart` of type `tool-runCommand`, carrying `input.command` and `output.stdout`/`errorText`.

**transport** — The mechanism `useChat` uses to send a message and receive the streamed response: a custom `ChatTransport` that posts to `/api/chat/completions` and converts the worker's SSE output into UI-message chunks (`src/lib/chat-transport.ts`).

**draft** — Uncomposed text the user has typed into the input textarea but not yet sent.

**busy** — `status === "submitted" || status === "streaming"`; a request is in flight.

**invokeUrl** — The NVIDIA chat-completions endpoint (`https://integrate.api.nvidia.com/v1/chat/completions`) from `refrences/index.ts:5`.

**payload** — The JSON request body posted to `invokeUrl` (model, messages, temperature, etc.).

**system message / user message / assistant message** — Conversation roles, as in `refrences/index.ts:16`.

**reasoning** — A hidden/visible model thought block, rendered in `ReasoningRow`.

**tool-runCommand** — A tool invocation part (`runCommand`) that executes a shell command and shows stdout/stderr, rendered in `ToolRow`.

**thread / session** — A saved conversation in D1 (`threads` table), identified by `id` and selected via the `?thread=` URL parameter. Titles start as `New Thread` and are set from the first user message.

**ThreadSummary** — `{ id, title, created_at, updated_at }`, the row shape returned by `GET /api/threads` and shown in the sidebar (`src/lib/thread-api.ts`).

**StoredMessage** — A persisted message row: `{ id, role, content, parts, created_at }`, where `parts` is JSON-encoded `ChatMessage["parts"]` (`src/lib/thread-messages.ts`).

**snapshot save** — A single `PUT /api/threads/:id/messages` that replaces all messages for a thread with the final state of the conversation, fired from `useChat`'s `onFinish`.
