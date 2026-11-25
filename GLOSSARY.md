# Glossary

**ChatMessage** — A `UIMessage` in the conversation, typed with parts of kind `reasoning`, `tool-runCommand`, and text. Defined in `src/components/ChatBox.tsx:70`.

**ChatPart** — A single part of a `ChatMessage` (`ChatMessage["parts"][number]`).

**ToolPart** — A `ChatPart` of type `tool-runCommand`, carrying `input.command` and `output.stdout`/`errorText`.

**transport** — The mechanism `useChat` uses to send a message and receive the streamed response. Currently a scripted demo transport (`chat.transport(...)`).

**draft** — Uncomposed text the user has typed into the input textarea but not yet sent.

**busy** — `status === "submitted" || status === "streaming"`; a request is in flight.

**invokeUrl** — The NVIDIA chat-completions endpoint (`https://integrate.api.nvidia.com/v1/chat/completions`) from `refrences/index.ts:5`.

**payload** — The JSON request body posted to `invokeUrl` (model, messages, temperature, etc.).

**system message / user message / assistant message** — Conversation roles, as in `refrences/index.ts:16`.

**reasoning** — A hidden/visible model thought block, rendered in `ReasoningRow`.

**tool-runCommand** — A tool invocation part (`runCommand`) that executes a shell command and shows stdout/stderr, rendered in `ToolRow`.
