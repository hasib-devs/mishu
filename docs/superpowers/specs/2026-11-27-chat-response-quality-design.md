# Professional chat responses — design

Chosen scope: **answer quality + response UX** (conversation, 2026-11-27). Production plumbing (rate limits, retries, auth, observability) is a later project.

## Intent

The chat shell is already modern — persistent threads, streaming, model/effort picker, reasoning and tool traces. The response itself is not: `worker/chat.ts:88` tells the model to "Keep responses small and concise", output is capped at 2048 tokens (`worker/chat.ts:90`), replies go through a hand-rolled regex Markdown parser (`src/components/markdown.tsx`) with no syntax highlighting, copy, regenerate or feedback, and failures surface as an empty bubble. The composer advertises attachments, deep research and web search that do nothing. This change makes both the answer and its presentation feel like a production chat product.

## Goals

- Answers are complete and well-structured: professional system prompt, realistic output ceiling, client disconnect cancels upstream work, stream errors reach the UI as readable text.
- Replies render GitHub-flavored Markdown: nested lists, tables, task lists, fenced code with language label + syntax highlighting + copy, safe links.
- Every completed assistant reply offers copy, regenerate and thumbs up/down feedback.
- Request failures show an inline error with a working retry; failed assistant replies are never persisted, but the user's prompt is kept.
- Composer contains only controls that work.

## Non-goals

- Attachments, web search, deep research, real tool execution (Worker cannot spawn processes).
- Auth / multi-user history, sharing, message search, editing past messages.
- Changing the default model or reasoning-effort controls.
- Backend for feedback analytics; retries/rate limits/observability (separate project).

## Anti-goals

- Fake or disabled-looking affordances in the composer.
- Silent errors, or persisting a broken assistant message.
- Extending the hand-rolled regex Markdown parser.

## Constraints

- React 19, Vite 8, Tailwind 4, AI SDK v7 / `@ai-sdk/react` v4, Cloudflare Worker + D1.
- `shiki`, `@ai-sdk/react`, `ai` are installed; `react-markdown` and `remark-gfm` are not.
- `useChat` exposes `error`, `regenerate`, `clearError` (verified in `node_modules/@ai-sdk/react/dist/index.d.ts:111-112`); `streamText` accepts `abortSignal` and `toUIMessageStream({ onError })` (verified in `node_modules/ai/dist/index-CKEJqCzY.d.ts:591, 3021-3090`).
- Tests are `node --test` on `.ts` files — no DOM. Pure helpers, not components, get unit tests.
- `pnpm run lint`, `pnpm run test`, `pnpm run build` must pass.

## Approaches considered

1. **Server only** — prompt + token cap. Answers improve, presentation stays crude. Rejected: half the request.
2. **Client only** — markdown + actions. Looks better, answers stay thin. Rejected: other half.
3. **Both, on installed primitives** *(chosen)* — small dependency add for a maintained Markdown parser; reuse shiki and the existing `CodeBlock` primitives; keep the current transport and thread API untouched.
4. **Both + real search/attachments/tools** — needs storage, external APIs and a Node runner. Rejected: separate project.

## Decided how

**Answer quality**
- New `worker/chat-prompt.ts` exports `SYSTEM_PROMPT` and `MAX_OUTPUT_TOKENS = 8192`. The prompt instructs: be accurate and direct; match depth to the question — short for simple questions, thorough and structured for complex ones; use headings/lists/tables/code blocks where they aid clarity; show reasoning only when asked; never invent facts, citations or tool results; say when uncertain; write code in the language the user asked for.
- `worker/chat.ts` imports those constants in place of the inline prompt and `2048`, passes `abortSignal: request.signal` to `streamText`, and passes `onError` to `toUIMessageStream` returning a short user-facing message instead of the default generic text. Model selection, effort mapping, provider options and SSE headers stay unchanged.

**Rendering**
- Add `react-markdown` + `remark-gfm` via pnpm. Rewrite `src/components/markdown.tsx` around `<ReactMarkdown remarkPlugins={[remarkGfm]}>`, keeping the existing `className` and `caret` props and stream behavior. Custom `components` overrides:
  - `code`/`pre`: fenced blocks become `CodeBlock` + `CodeBlockHeader` (language title) + `CodeBlockActions` + `CodeBlockCopyButton`, highlighted through the existing `highlightCode(code, language)` in `src/lib/highlighter.tsx`. Inline code keeps a simple styled `<code>`.
  - `a`: allow only `http:`, `https:`, `mailto:` hrefs; otherwise render plain text. Allowed links get `target="_blank" rel="noopener noreferrer"`.
  - tables, task-list checkboxes, headings, lists, blockquotes and rules get Tailwind styles consistent with the existing primitives.
- The streaming caret stays visible at the end of the final block; exact mechanism (last-child inline styling or equivalent) is the builder's call.

**Message actions and errors**
- New `src/components/message-actions.tsx`: copy reply, regenerate (`useChat().regenerate()`), thumbs up/down. Buttons are icon buttons using the installed `Button` + `Tooltip` primitives; shown only on completed assistant messages with text.
- New `src/lib/chat-feedback.ts` + `tests/chat-feedback.test.ts`: localStorage helpers to set/read/clear a `"up" | "down"` vote keyed by thread id + message id, with malformed-data fallback. Feedback stays local — no endpoint.
- `src/components/ChatBox.tsx`: render the actions row under each completed reply; render `error` as an inline error card with Retry (`clearError()` then `regenerate()`); remove the non-functional "+" context menu; refresh starter prompts to ones that exercise structured answers.
- `onFinish` still saves through the existing PUT; see Review decisions for how failed snapshots are handled.

## Review decisions (my calls)

- **Regenerate is only offered on the latest assistant reply**, via `regenerate()` with no message id. Older replies get copy and feedback only: `regenerate({ messageId })` drops every later turn, and the D1 PUT rewrites the whole transcript, so a button there would silently delete conversation history.
- **A reply that failed after emitting partial text stays visible**, subtly muted, with the error card and retry beneath it. Copy/regenerate/feedback are suppressed on it. "Completed" for action purposes means neither streaming/submitted nor failed.
- **A failed request with no assistant text keeps the user's prompt.** Change `messagesToSave(failed)` in `src/lib/thread-messages.ts` to drop assistant messages only instead of slicing off the last message, and update `tests/thread-messages.test.ts`. This preserves the question across refresh and gives retry its context.

## Left to the builder

- Exact Tailwind classes and the caret mechanism.
- Final system-prompt wording, within the guidelines above.
- Per-thread feedback keys (my call), and exact starter prompt strings.
- Whether the error card uses the existing `Empty` styles or a small inline alert.

## Verification

1. `pnpm run lint`, `pnpm run test`, `pnpm run build`.
2. Browser pass on `pnpm run dev`: send a question that produces a table and a code block → GFM renders, code is highlighted and copy works; regenerate replaces the reply; a vote persists across reload; the composer has no dead controls; a forced request error shows the inline error card and retry works; refresh still restores the thread.
