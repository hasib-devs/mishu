# Professional Chat Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat answers complete and well-structured, and render them with production-grade Markdown, code highlighting, copy/regenerate/feedback actions, and visible retryable errors.

**Architecture:** Server-side prompt and output ceiling in a new testable module, wired into the existing Worker `streamText` path with abort and stream-error handling. Client-side, replace the hand-rolled Markdown parser with `react-markdown` + `remark-gfm` and custom renderers built on the installed shiki highlighter and `CodeBlock` primitives; add a message-actions row and an inline error card in `ChatBox`. Transport, thread API and model/effort settings remain untouched.

**Tech Stack:** React 19, Vite 8, Tailwind 4, AI SDK v7 / `@ai-sdk/react` v4, Cloudflare Worker, shiki, `react-markdown` + `remark-gfm` (to add), `node --test` on `.ts`.

**Spec:** `docs/superpowers/specs/2026-11-27-chat-response-quality-design.md`

## Global Constraints

- Never commit or push; leave worktree changes uncommitted unless the user explicitly asks.
- Keep the existing `/api/chat/completions` request/response shape, model options, effort mapping and thread API unchanged.
- No backend for feedback; votes are localStorage-only.
- Tests: `pnpm run test` (`node --test tests/*.test.ts`, no DOM). UI behavior is verified in the browser, not with component tests.
- `pnpm run lint` and `pnpm run build` must pass after every task.

## Review Focus

- **Error after partial text** — partial reply stays visible but muted, with error + retry and no actions; pinned in Task 5 (browser smoke) and Task 2 (persistence test).
- **Error before any assistant text** — the user's question survives refresh; pinned in Task 2's `messagesToSave` test.
- **`javascript:` / `data:` links in model output** — rendered as inert text, never an anchor; pinned in Task 4's `safeHref` test.
- **Regenerate on an older reply** — must not truncate later turns; the button is only rendered on the last message; pinned in Task 5 (code + browser smoke).
- **Streamed fenced code with no language or an unclosed fence** — renders as a code block without crashing; pinned in Task 4's browser smoke.

---

### Task 1: Server answer quality

**Files:**
- Create: `worker/chat-prompt.ts`
- Modify: `worker/chat.ts:1-103`
- Test: `tests/chat-prompt.test.ts`, `tests/worker-chat.test.ts`

**Interfaces:**
- Produces: `SYSTEM_PROMPT: string` and `MAX_OUTPUT_TOKENS: number` (= `8192`) from `worker/chat-prompt.ts`; consumed by Task 1's worker edit only.

- [ ] **Step 1: Write the failing prompt test** in `tests/chat-prompt.test.ts`:
  - import `SYSTEM_PROMPT, MAX_OUTPUT_TOKENS` from `../worker/chat-prompt.ts`
  - assert `MAX_OUTPUT_TOKENS === 8192`
  - assert `SYSTEM_PROMPT` matches `/accurate/i`, `/uncertain/i`, `/tables/i`, and does **not** match `/small and concise/i`

- [ ] **Step 2: Run `node --test tests/chat-prompt.test.ts`; expected: FAIL (module not found)**

- [ ] **Step 3: Create `worker/chat-prompt.ts`** exporting the two constants. Prompt content follows the spec's guidelines: accuracy, depth matched to the question, structured Markdown where useful, no invented facts/citations/tool results, explicit uncertainty, code in the language asked for.

- [ ] **Step 4: Write the failing worker wiring test** in `tests/worker-chat.test.ts`:
  - import `worker` from `../worker/index.ts`, `stubNvidiaFetch` from `./support/fake-nvidia-fetch.ts`, and `SYSTEM_PROMPT, MAX_OUTPUT_TOKENS` from `../worker/chat-prompt.ts`
  - stub fetch, POST `{"modelId":"nvidia/nemotron-3.5-bolt-e4b","messages":[{"role":"user","content":"Hi"}]}` to `/api/chat/completions`, read the response body inside `try/catch` (the stub returns JSON, not SSE), then restore fetch
  - assert `stub.requests[0].max_tokens === MAX_OUTPUT_TOKENS`
  - assert some message in `stub.requests[0].messages` has `content` containing `SYSTEM_PROMPT`

- [ ] **Step 5: Run `node --test tests/worker-chat.test.ts`; expected: FAIL (max_tokens is 2048 / prompt text absent)**

- [ ] **Step 6: Edit `worker/chat.ts`**: import the constants; replace the inline `system` string and `maxOutputTokens: 2048`; add `abortSignal: request.signal` to `streamText`; pass `{ onError: () => "The assistant could not complete this response. Please try again." }` to `result.toUIMessageStream()`. Leave model, effort and SSE headers unchanged.

- [ ] **Step 7: Run `node --test tests/chat-prompt.test.ts tests/worker-chat.test.ts`; expected: PASS**

- [ ] **Step 8: Run `pnpm run lint && pnpm run build`; expected: PASS**

---

### Task 2: Keep the user's prompt when generation fails

**Files:**
- Modify: `src/lib/thread-messages.ts:34-37`
- Test: `tests/thread-messages.test.ts:61-68`

**Interfaces:**
- Consumes: `ChatMessage` from `src/lib/chat-transport.ts`
- Produces: changed semantics of `messagesToSave(messages: ChatMessage[], failed: boolean): ChatMessage[]` — on `failed`, drop assistant messages but keep user messages.

- [ ] **Step 1: Add a failing test** to `tests/thread-messages.test.ts`:
  - name: `"messagesToSave keeps the user prompt when no assistant reply was produced"`
  - input: `[{ id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] }]` (type as `ChatMessage[]`)
  - assert `messagesToSave(messages, true)` deep-equals `messages`

- [ ] **Step 2: Run `node --test tests/thread-messages.test.ts`; expected: FAIL (returns `[]`)**

- [ ] **Step 3: Change `messagesToSave`**: when `failed`, filter messages to `role !== "assistant"` instead of slicing off the last message; keep the existing filter that omits empty assistant messages.

- [ ] **Step 4: Run `node --test tests/thread-messages.test.ts`; expected: PASS (all tests, including the pre-existing broken-reply test)**

- [ ] **Step 5: Run `pnpm run lint && pnpm run build`; expected: PASS**

---

### Task 3: Local feedback storage

**Files:**
- Create: `src/lib/chat-feedback.ts`, `tests/chat-feedback.test.ts`

**Interfaces:**
- Produces: `export type FeedbackVote = "up" | "down"`; `export function setFeedback(threadId: string, messageId: string, vote: FeedbackVote | null): void`; `export function getFeedback(threadId: string, messageId: string): FeedbackVote | null`. Storage key `mishu:chat-feedback`; `null` vote clears the entry. Consumed by Task 5.

- [ ] **Step 1: Write the failing tests** in `tests/chat-feedback.test.ts`, using the same in-memory `localStorage` mock pattern as `tests/chat-settings.test.ts:7-15`:
  - `"feedback is independent per message and thread"`: set `("t1","a1","up")` and `("t2","a1","down")`; assert each reads back correctly and `("t1","a2")` is `null`
  - `"clearing a vote removes it"`: set then `setFeedback("t1","a1",null)`; assert `getFeedback(...) === null`
  - `"malformed storage and invalid votes fall back to null"`: seed `"mishu:chat-feedback"` with `"{bad"`, assert `null`; seed `{"t1":{"a1":"sideways"}}`, assert `null`
  - `"a storage failure never throws"`: make `setItem` throw; assert `setFeedback(...)` does not throw

- [ ] **Step 2: Run `node --test tests/chat-feedback.test.ts`; expected: FAIL (module not found)**

- [ ] **Step 3: Implement `src/lib/chat-feedback.ts`** with the signatures above: a single JSON object keyed by thread id then message id, best-effort reads/writes guarded by `typeof localStorage === "undefined"` and `try/catch`, validating votes are exactly `"up"` or `"down"`.

- [ ] **Step 4: Run `node --test tests/chat-feedback.test.ts`; expected: PASS**

- [ ] **Step 5: Run `pnpm run lint && pnpm run build`; expected: PASS**

---

### Task 4: GFM Markdown rendering with safe links and highlighted code

**Files:**
- Create: `src/lib/safe-href.ts`, `tests/safe-href.test.ts`
- Modify: `src/components/markdown.tsx` (replace the hand-rolled parser), `package.json` + `pnpm-lock.yaml` (dependency add)

**Interfaces:**
- Produces: `export function safeHref(href: string | undefined): string | null` — returns the trimmed href only for `http:`, `https:` and `mailto:` URLs; returns `null` for `javascript:`, `data:`, protocol-relative `//host`, empty and undefined. Consumed by Task 4's `Markdown` component.
- Consumes: `highlightCode(code, language)` from `src/lib/highlighter.tsx`; `CodeBlock`, `CodeBlockHeader`, `CodeBlockTitle`, `CodeBlockActions`, `CodeBlockCopyButton`, `CodeBlockContent` from `src/components/ui/code-block.tsx`.
- Preserves: `Markdown({ className, children, caret, ...props })` signature used by `ChatBox.tsx:295-300`.

- [ ] **Step 1: Write the failing `safeHref` tests** in `tests/safe-href.test.ts`:
  - allow `https://example.com/a`, `http://example.com`, `mailto:a@b.com` with surrounding whitespace
  - reject `javascript:alert(1)`, `data:text/html,x`, `//evil.example`, `""`, `undefined`

- [ ] **Step 2: Run `node --test tests/safe-href.test.ts`; expected: FAIL (module not found)**

- [ ] **Step 3: Implement `src/lib/safe-href.ts`** using `new URL(value)` inside `try/catch`, checking `url.protocol`.

- [ ] **Step 4: Run `node --test tests/safe-href.test.ts`; expected: PASS**

- [ ] **Step 5: Add dependencies**: `pnpm add react-markdown remark-gfm`. Expected: both listed in `package.json`.

- [ ] **Step 6: Replace `src/components/markdown.tsx`** with a `<ReactMarkdown remarkPlugins={[remarkGfm]}>` renderer:
  - keep the `MarkdownProps` signature and the `cn("text-foreground", className)` wrapper
  - `pre` component: fenced blocks become `CodeBlock` + `CodeBlockHeader`/`CodeBlockTitle` (language or `"Code"`) + `CodeBlockActions`/`CodeBlockCopyButton` + `CodeBlockContent`. In `react-markdown` v9+ there is no `inline` prop on `code`; read the language from the child `code`'s `className` (`language-<lang>`) and the source from its `children`, then call `highlightCode(code, language)` for lines, falling back to plain text. `code` outside `pre` renders as a styled inline `<code>`.
  - `a` component: `safeHref(href)` — allowed URLs render as `<a href target="_blank" rel="noopener noreferrer">`; otherwise render children as plain text
  - `table`, `thead`, `tbody`, `tr`, `th`, `td`, `input[type=checkbox]`, headings, lists, blockquote and `hr` get Tailwind styles consistent with the existing primitives
  - keep the streaming caret visible at the end of the last block (any mechanism that does not alter message text)

- [ ] **Step 7: Run `pnpm run lint && pnpm run build`; expected: PASS**

- [ ] **Step 8: Browser smoke on `pnpm run dev`**: send a prompt that produces a table and a fenced code block, plus one with an unlabeled/unclosed fence. Expected: GFM renders, code is highlighted, copy works, no crash.

---

### Task 5: Message actions, retry UX and clean composer

**Files:**
- Create: `src/components/message-actions.tsx`
- Modify: `src/components/ChatBox.tsx:78-82, 100-125, 241-308, 316-444`

**Interfaces:**
- Consumes: `useChat().regenerate` and `clearError` and `error` (`node_modules/@ai-sdk/react/dist/index.d.ts:111-112`); `messageContent(message)` from `src/lib/chat-transport.ts`; `getFeedback/setFeedback` from Task 3; `Button` and `Tooltip` primitives.
- Produces: `MessageActions({ text, threadId, messageId, canRegenerate, onRegenerate })` — self-contained action row. Consumed by Task 5's `ChatBox` edit.

- [ ] **Step 1: Create `src/components/message-actions.tsx`** with that signature: three icon `Button`s inside `Tooltip`/`TooltipTrigger`/`TooltipContent` — Copy (`navigator.clipboard.writeText(text)`, 2s checked state), Regenerate (only rendered when `canRegenerate`), thumbs up/down (`getFeedback` initial state, `setFeedback` on click, clicking the active vote clears it). Use lucide icons; no new dependencies.

- [ ] **Step 2: Edit `src/components/ChatBox.tsx`**:
  - pull `error`, `regenerate`, `clearError` from `useChat`
  - define `failed = error !== undefined && message === messages.at(-1)` and `completed = !busy && !failed && reply.length > 0`
  - render `<MessageActions>` under completed assistant replies, with `canRegenerate={message === messages.at(-1)}` and an `onRegenerate` that calls `regenerate()`
  - render failed replies with muted styling and no actions; render an inline error card below the message list with the error text and a Retry button that calls `clearError()` then `regenerate()`
  - remove the `+` `DropdownMenu` and its unused `PaperclipIcon`/`PlusIcon`/`TelescopeIcon`/`GlobeIcon` imports; keep the model/effort dropdown and send button
  - replace `STARTER_PROMPTS` with three prompts that elicit structured answers (a comparison table, a code example with explanation, and a step-by-step plan)

- [ ] **Step 3: Run `pnpm run lint && pnpm run build`; expected: PASS**

- [ ] **Step 4: Browser smoke on `pnpm run dev`**: regenerate the latest reply (older reply has no regenerate button); copy a reply; vote and confirm the vote survives reload; force a request error (e.g. stop the dev worker or use an invalid key temporarily) and confirm the inline error + Retry; confirm the composer has no dead `+` menu. Expected: all behaviors work and thread persistence still restores messages.

- [ ] **Step 5: Run `pnpm run test`; expected: PASS**

---

### Task 6: Final gate

**Files:** none (verification only)

- [ ] **Step 1: Run `pnpm run check`** (`lint && test && build`); expected: PASS with no new errors.

- [ ] **Step 2: Run `git status --short`** and report the changed file list; expected: only files from Tasks 1-5 plus the approved design doc and this plan. No commits made.

- [ ] **Step 3: Browser pass from an empty thread**: create → send a structured question → verify answer quality, GFM, code copy, actions → refresh → verify full transcript restores. Expected: no regressions in the existing streaming/typing experience.
