# Glossary

Terms used across Mishu's four surfaces, grounded in the code that defines them.
Line references point to the current source; update them when the code moves.

## Chat conversation

**ChatMessage** — A `UIMessage` from the AI SDK used for a conversation turn.
Text and `reasoning` parts are standard AI SDK parts; the only declared tool is
`runCommand`. Defined in `src/lib/chat-transport.ts:9`.

**ChatPart** — A single part of a `ChatMessage`
(`ChatMessage["parts"][number]`). Named in `src/components/chat-rows.tsx:9`.

**ToolPart** — A `ChatPart` with `type === "tool-runCommand"`. It carries
`input.command`; a successful run exposes `output.stdout`, while a failed run
exposes the AI SDK's `errorText` when `state === "output-error"`
(`src/components/chat-rows.tsx:39-59`).

**transport** — The custom `ChatTransport` passed to `useChat`. `sendMessages`
posts to `INVOKE_URL`, converts the Worker's SSE stream into UI-message chunks,
and maps legacy OpenAI-style chunks when needed; `reconnectToStream` returns
`null` (`src/lib/chat-transport.ts:153-218`).

**INVOKE_URL** — `/api/chat/completions`, the Worker endpoint the browser posts
to (`src/lib/chat-transport.ts:20`). The Worker forwards to NVIDIA's
OpenAI-compatible API at `NVIDIA_BASE` (`worker/chat.ts:16`).

**payload** — The JSON body posted to `INVOKE_URL`: `model`, `messages`,
`stream: true`, `temperature: 0.7`, `top_p: 0.9`, `frequency_penalty: 0`,
`presence_penalty: 0`, and an optional `reasoningEffort`
(`src/lib/chat-transport.ts:181-190`).

**system message / user message / assistant message** — Conversation roles. The
browser takes roles from the AI SDK and persists them with `toStoredMessages`
(`src/lib/thread-messages.ts:43-50`); the Worker accepts `user`, `assistant`,
`system`, and `tool` (`worker/threads.ts:129`).

**draft** — Unsent textarea content, held in `ChatBox` state as `draft ?? ""`
(`src/components/ChatBox.tsx:144,152`).

**busy** — `status === "submitted" || status === "streaming"`; a request is in
flight (`src/components/ChatBox.tsx:151`).

**reasoning** — An AI SDK part with `type === "reasoning"`, rendered as a
collapsible "Thinking" / "Thought" row by `ReasoningRow`
(`src/components/chat-rows.tsx:13-14,22`).

**tool-runCommand** — The tool that executes a shell command on the server
(`worker/toolExecutor.ts`) and renders its output or error through `ToolRow`
(`src/components/chat-rows.tsx:39-67`).

## Threads and persistence

**thread / session** — A saved conversation in the D1 `threads` table, selected
via the `?thread=` URL parameter (`src/routes/chat-route.tsx:49,62`). Titles
start as `New Thread` and are set from the first user message during a snapshot
save (`worker/threads.ts:163,173`).

**ThreadSummary** — `{ id, title, created_at, updated_at }`, returned by
`GET /api/threads` and shown in the sidebar (`src/lib/thread-api.ts:5-10`).

**ThreadDetail** — A `ThreadSummary` plus `messages: StoredMessage[]`, returned by
`GET /api/threads/:id` (`src/lib/thread-api.ts:12-14`).

**StoredMessage** — A persisted message row `{ id, role, content, parts,
created_at? }`. `parts` is stored as JSON text in D1 and decoded on read
(`worker/threads.ts:60-71,169`). The client type lives in
`src/lib/thread-messages.ts:3-9`.

**snapshot save** — A single `PUT /api/threads/:id/messages` that replaces all
messages for a thread with the final conversation state, fired from `useChat`'s
`onFinish` and skipped when there is no thread or an empty snapshot
(`src/components/ChatBox.tsx:133-141`). On abort or error,
`messagesToSave` drops the trailing assistant turn but keeps the user's
question (`src/lib/thread-messages.ts:34-41`).

## Models and effort

**model option** — A curated NVIDIA chat model in `MODEL_OPTIONS`, with `id`,
`label`, `description`, and `effortMode` (`src/lib/model-options.ts:8-13,19`).

**ChatSettings** — The per-thread `{ modelId, effort }` pair kept in localStorage
under `mishu:chat-settings`. Threads without an id use the `draft` key until a
thread is created (`src/lib/chat-settings.ts:10-15,40-42,79-84`).

**reasoning effort** — The user's `low` / `medium` / `high` choice. It is sent as
`reasoningEffort` only when the selected model's effort mode is not `none`
(`src/lib/chat-settings.ts:68-77`).

**effort mode** — The provider-specific field family a model accepts: `none`,
`thinking`, `budget`, or `effort`. `effortToRequestOptions` maps the effort
choice to `chat_template_kwargs.enable_thinking`, `reasoning_budget`, or
`reasoning_effort` (`src/lib/model-options.ts:1-7,72-89`).

## Chithi

**chithi** — An AI-generated letter stored in the `chithis` table, one per hour
slot. Supports browse/create/edit/delete and hourly generation
(`worker/chithi/schema.ts`, `worker/chithi/routes.ts`).

**hour slot** — The `generated_for` value: the UTC hour's start in epoch ms,
computed by `hourStart`, with a unique index preventing two letters per slot
(`worker/chithi/generate.ts:24`, `migrations/0003_chithi.sql:11`).

**paper style** — A Chithi presentation style: `classic`, `modern`, or `minimal`,
defaulting to `classic` (`src/lib/chithi-schema.ts:6`,
`migrations/0003_chithi.sql:6`).

## Free4Talk

**snapshot** — One hourly scrape of the public free4talk.com room list, stored
in `f4t_snapshots` with its `f4t_rooms` and `f4t_participants` rows
(`migrations/0004_free4talk.sql`).

**daily rollup** — A permanent per-day, per-language aggregate in
`f4t_daily_stats` (`avg_rooms`, `peak_rooms`, `peak_participants`, `peak_hour`,
`unique_owners`), produced by `rollupAndPrune` as raw rows are pruned
(`worker/free4talk/db.ts:433`).

## Chithi links

**chithi target** — A verified `chithi.me/<username>` profile discovered in
room topics or participant bios, persisted in `f4t_chithi_targets` because raw
`f4t_*` rows are pruned by the daily rollup (`migrations/0005_chithi_links.sql`).

**quote history** — One row per sent quote in `f4t_chithi_quote_history`, so a
target that has already been sent a quote is skipped on later runs
(`migrations/0006_chithi_quote_history.sql`).

## Scheduling

**hourly job** — `runHourlyJobs`: Chithi generation → Free4Talk scrape → link
pipeline. If the scrape fails, the link step is skipped. The same function
serves the cron trigger and the token-gated manual endpoint
(`worker/hourly.ts:43-70`, `worker/chithi-links/routes.ts:36-51`).

**schedule** — The cron expressions `0 * * * *` (hourly) and `10 0 * * *` (daily)
in `worker/schedule.ts:1-2`. `GET /api/schedule` returns server time and the
next run for both, computed by `nextRunAfter`.
