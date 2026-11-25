# Model + reasoning-effort selector — design

Approved approach: **per-thread** selection (conversation, 2026-11-25).

## Intent

The user wants a ChatGPT-like control in the chatbox to choose the model and the reasoning effort before sending. Today the model is hardcoded in `src/lib/chat-transport.ts:16`, `reasoning_effort` is commented out at `chat-transport.ts:174`, and `worker/index.ts:283-307` reads only `model` from the request body — so a UI control by itself would be a fake switch. The worker must accept, validate, and forward the choice for the control to mean anything.

## Goals

- Pick a model and a reasoning effort from a dropdown in the composer, with human-readable labels.
- The choice belongs to the thread: it survives refresh and is restored when switching back from the sidebar.
- Every send in that thread uses the selected values; historical messages are never rewritten.
- Models without reasoning support hide/disable the effort control.
- Keep streaming, typing dots, reasoning/tool rows, and reduced-motion behavior unchanged.

## Non-goals

- Per-message selectors, header model picker, temperature/top_p controls, custom system prompts.
- Auth, per-user settings, syncing settings across devices, DB migration, changes to the thread API.
- New dependencies; changes to the SSE/UI-message streaming parser.
- Rotating the plaintext API key already committed in `refrences/index.ts:10` — separate security work, but it should be done before any deploy.

## Anti-goals

- Accepting arbitrary model ids or effort values from the browser.
- Creating an empty thread just by opening the selector.
- Showing an effort control that has no effect on the chosen model.

## Constraints

- React 19, Vite 8, `ai` v7 / `@ai-sdk/react` v4, Cloudflare Worker + D1, no router.
- `sendMessage(message, { body })` is supported: `ChatRequestOptions.body` (`node_modules/ai/dist/index-CKEJqCzY.d.ts:6974-6984`).
- `@ai-sdk/openai-compatible` v3.0.94 maps `providerOptions.nvidia.reasoningEffort` to `reasoning_effort` in the request body (`src/chat/openai-compatible-chat-language-model.ts:293-352`).
- `pnpm run build` must pass. `pnpm run lint` currently has 4 pre-existing errors from `229b4de`; this work must add none.
- Never print or commit secret values.

## Approaches considered

1. **Per-message** — a selector on each send. Most flexible; cluttered UI and ambiguity about which model produced which reply. Rejected.
2. **Per-thread** *(chosen)* — one selector in the composer, remembered per conversation, applied to subsequent sends. Matches ChatGPT and the way the sidebar already scopes state.
3. **Global** — one app-wide setting. Simplest, but removes the useful case of a fast draft thread and a deep reasoning thread. Rejected.

## Decided how

**Shared option catalog** — `src/lib/model-options.ts`: `ReasoningEffort = "low" | "medium" | "high"`, `ModelOption = { id, label, description, effortMode: "none" | "thinking" | "budget" | "effort" }`, a curated `MODEL_OPTIONS` array, `DEFAULT_MODEL_ID`, `isSupportedModel(id)`, and `effortToRequestOptions(model, effort)`. Live list:

Verified against `GET https://integrate.api.nvidia.com/v1/models` (30 ids returned without auth). Each option carries an `effortMode`, because the models do **not** share one effort parameter:

- `nvidia/nemotron-3.5-bolt-e4b` — Nemotron 3.5 Bolt, default. `effortMode: "thinking"` — only `chat_template_kwargs.enable_thinking` (boolean) is supported; no `reasoning_effort`.
- `nvidia/nemotron-3.5-lightning-30b-a3b` — Nemotron 3.5 Lightning, fast. `effortMode: "budget"` — `reasoning_budget` integer, low/medium/high → 2048/8192/32768.
- `nvidia/nemotron-3.5-super-vl-120b-a12b` — Nemotron 3.5 Super VL. `effortMode: "effort"` — native `reasoning_effort` none/low/high.
- `google/gemma-3-12b-it` — Gemma 3 12B, fast non-reasoning. `effortMode: "none"` — effort control hidden.

The earlier candidates `nvidia/nemotron-3-super-120b-a12b` and `qwen/qwen2.5-coder-32b-instruct` are **not** in the live list and must not be used.

**Model catalog source** — NVIDIA exposes `GET https://integrate.api.nvidia.com/v1/models` (OpenAI-compatible; bearer token optional). It returns `{ object: "list", data: [{ id, object, owned_by }] }` with no capability metadata. We use it once to curate the list and do **not** proxy it at runtime: the catalog mixes chat, embedding, safety and vision models, and the UI needs a short, known-good set with correct effort semantics.

**Persistence** — `src/lib/chat-settings.ts`: `ChatSettings = { modelId: string; effort: ReasoningEffort }`; `loadSettings(threadId: string | null)` / `saveSettings(threadId, settings)` backed by one `localStorage` JSON object under `mishu:chat-settings`, keyed by thread id with a `"draft"` entry. Malformed JSON and unknown model ids fall back to defaults. Draft settings persist so a new chat inherits the last choice. No DB/API changes.

**Transport** — extend `sendMessages` to accept `body?: object` and forward `modelId` / `reasoningEffort` into the JSON payload, alongside the existing fields. Client-side validation is convenience only; the worker is authoritative.

**ChatBox** — `settings` state initialized from `loadSettings(threadId)`; a compact dropdown in the composer header shows model and (when supported) effort, using the existing `DropdownMenu` primitives. Changes persist immediately via `saveSettings`. `submit()` passes `sendMessage({ text }, { body: settings })`. When `ensureThread()` creates a thread on first send, draft settings are copied to the new thread id. The selected effort is omitted for models with `effortMode: "none"`.

**Worker** — validate `modelId` against the shared catalog and the effort against the allowed set; reject bad values with 400 instead of forwarding them. Map the effort through `effortToRequestOptions(model, effort)` from the shared catalog: `thinking` → `chat_template_kwargs.enable_thinking`, `budget` → `reasoning_budget` (2048/8192/32768), `effort` → `reasoning_effort`, `none` → omit. Send those raw fields via `providerOptions.nvidia` — the openai-compatible provider forwards unknown keys into the request body unchanged (`openai-compatible-chat-language-model.ts:335-345`) — rather than using the SDK's `reasoningEffort` option. Raise `maxOutputTokens` from 256 to 2048 so reasoning and longer replies are not truncated. Keep `/api/chat/completions`, the provider config, and the streaming response unchanged otherwise.

## Left to the builder

- Exact Tailwind classes, dropdown labels, and iconography; use existing UI primitives only.
- Whether to import the shared catalog into the worker via a relative path or duplicate the id allowlist there; prefer the shared module, and verify `tsconfig` includes it in the worker build.
- Inline error text if a chosen model returns an upstream error; no new toast system.

## Verification

1. Add tests: settings load/save and fallback; worker rejects unknown model/effort and forwards a valid effort.
2. `node --test tests/*.test.ts`, `pnpm run lint` (no new errors), `pnpm run build`.
3. Browser pass: select a different model + effort, send, confirm the request body carries both; refresh and confirm the selection is restored; switch threads and confirm independent selections; choose the non-reasoning model and confirm the effort control disappears.
