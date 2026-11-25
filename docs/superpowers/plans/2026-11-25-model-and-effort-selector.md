# Model + Reasoning Effort Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-thread ChatGPT-like model and reasoning-effort selector to the chatbox that actually changes the upstream request.

**Architecture:** A shared catalog (`src/lib/model-options.ts`) owns the curated model ids and the per-model effort-to-request mapping; per-thread selections live in `localStorage` via `src/lib/chat-settings.ts`; `sendMessage(..., { body })` carries the choice to the worker, which validates it and forwards the mapped raw provider fields through `providerOptions.nvidia`. No DB migration, no thread API change, no new dependency.

**Tech Stack:** React 19, Vite 8, `ai` v7 / `@ai-sdk/react` v4, `@ai-sdk/openai-compatible` v3.0.94, Cloudflare Worker + D1, node:test.

**Spec:** `docs/superpowers/specs/2026-11-25-model-and-effort-selector-design.md`

## Global Constraints

- React 19, Vite 8, `ai` v7 / `@ai-sdk/react` v4, Cloudflare Worker + D1, no router installed.
- No new dependencies; use installed base-ui/shadcn/Tailwind primitives only.
- `pnpm run build` must pass.
- `pnpm run lint` currently has 4 pre-existing errors from `229b4de`; add no new errors.
- Never print or commit secret values.
- `src/lib/model-options.ts` must use relative imports only: `tsconfig.worker.json` includes only `worker`, and the worker imports this module directly.
- Keep `/api/chat/completions`, the D1 thread API, and the SSE/UI-message streaming parser unchanged.

## Review Focus

- **Tampered request with unknown `modelId` or effort** → worker must return 400 before any upstream call. Pinned in Task 3 test.
- **Bolt has no `reasoning_effort` parameter** → its mapping must emit only `chat_template_kwargs.enable_thinking`, never `reasoning_effort`. Pinned in Task 1 test.
- **Non-reasoning model selected** → no effort control in the UI and no effort field in the request body. Pinned in Task 1 test (`effortMode: "none"` → `{}`) and Task 5 browser step.
- **Malformed or stale `localStorage` settings** (unknown model, unknown effort, invalid JSON) → defaults, no crash. Pinned in Task 2 tests.
- **Switching threads / refreshing** → each thread restores its own choice and a fresh draft inherits the last choice. Pinned in Task 2 test and Task 5 browser steps.

---

### Task 1: Shared model catalog and effort mapping

**Files:**
- Create: `src/lib/model-options.ts`
- Test: `tests/model-options.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type EffortMode = "none" | "thinking" | "budget" | "effort"`; `type ReasoningEffort = "low" | "medium" | "high"`; `type ModelOption = { id: string; label: string; description: string; effortMode: EffortMode }`; `MODEL_OPTIONS: readonly ModelOption[]`; `DEFAULT_MODEL_ID = "nvidia/nemotron-3.5-bolt-e4b"`; `DEFAULT_EFFORT: ReasoningEffort = "medium"`; `EFFORTS: readonly ReasoningEffort[]`; `isSupportedModel(id: string): boolean`; `isSupportedEffort(value: unknown): value is ReasoningEffort`; `effortToRequestOptions(id: string, effort: ReasoningEffort): Record<string, unknown>`.

- [ ] **Step 1: Write the failing test** in `tests/model-options.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MODEL_ID,
  EFFORTS,
  MODEL_OPTIONS,
  effortToRequestOptions,
  isSupportedEffort,
  isSupportedModel,
} from "../src/lib/model-options.ts";

test("catalog holds only live ids with known effort modes", () => {
  assert.equal(MODEL_OPTIONS.length, 4);
  assert.ok(MODEL_OPTIONS.some((model) => model.id === DEFAULT_MODEL_ID));
  assert.deepEqual(EFFORTS, ["low", "medium", "high"]);
  assert.equal(isSupportedModel("nvidia/nemotron-3-super-120b-a12b"), false);
  assert.equal(isSupportedEffort("extreme"), false);
});

test("effort maps to the raw field each model family actually accepts", () => {
  assert.deepEqual(
    effortToRequestOptions("nvidia/nemotron-3.5-bolt-e4b", "low"),
    { chat_template_kwargs: { enable_thinking: false } },
  );
  assert.deepEqual(
    effortToRequestOptions("nvidia/nemotron-3.5-bolt-e4b", "high"),
    { chat_template_kwargs: { enable_thinking: true } },
  );
  assert.deepEqual(
    effortToRequestOptions("nvidia/nemotron-3.5-lightning-30b-a3b", "medium"),
    { reasoning_budget: 8192 },
  );
  assert.deepEqual(
    effortToRequestOptions("nvidia/nemotron-3.5-super-vl-120b-a12b", "high"),
    { reasoning_effort: "high" },
  );
  assert.deepEqual(effortToRequestOptions("unknown/model", "high"), {});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/model-options.test.ts`
Expected: FAIL — module `../src/lib/model-options.ts` not found.

- [ ] **Step 3: Implement `src/lib/model-options.ts`**

Catalog entries, exactly: `nvidia/nemotron-3.5-bolt-e4b` (`thinking`), `nvidia/nemotron-3.5-lightning-30b-a3b` (`budget`), `nvidia/nemotron-3.5-super-vl-120b-a12b` (`effort`), `mistralai/mistral-large-4-1t-a52b` (`effort`). Labels and descriptions are short human-readable strings; the plan leaves their wording to the implementer. Gemma 3 12B was removed from the catalog after a live check returned upstream 404 for the configured account.

`effortToRequestOptions` mapping: `thinking` → `{ chat_template_kwargs: { enable_thinking: effort !== "low" } }`; `budget` → `{ reasoning_budget: { low: 2048, medium: 8192, high: 32768 }[effort] }`; `effort` → `{ reasoning_effort: effort === "high" ? "high" : "low" }` (Super VL accepts none/low/high, not medium); `none` → `{}`. Unknown id → `{}`. Use relative imports only; no `@/` alias.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/model-options.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/model-options.ts tests/model-options.test.ts
git commit -m "feat: add curated model catalog and effort mapping"
```

### Task 2: Per-thread settings storage

**Files:**
- Create: `src/lib/chat-settings.ts`
- Test: `tests/chat-settings.test.ts`

**Interfaces:**
- Consumes: `ChatSettings` shape uses `ReasoningEffort`, `DEFAULT_MODEL_ID`, `DEFAULT_EFFORT`, `isSupportedModel`, `isSupportedEffort` from Task 1.
- Produces: `type ChatSettings = { modelId: string; effort: ReasoningEffort }`; `loadSettings(threadId: string | null): ChatSettings`; `saveSettings(threadId: string | null, settings: ChatSettings): void`; `moveDraftSettings(threadId: string): void`.

- [ ] **Step 1: Write the failing test** in `tests/chat-settings.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EFFORT, DEFAULT_MODEL_ID } from "../src/lib/model-options.ts";
import { loadSettings, moveDraftSettings, saveSettings } from "../src/lib/chat-settings.ts";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  },
});

test("defaults are used when nothing is stored", () => {
  store.clear();
  assert.deepEqual(loadSettings(null), { modelId: DEFAULT_MODEL_ID, effort: DEFAULT_EFFORT });
});

test("settings are independent per thread; draft carries forward", () => {
  store.clear();
  saveSettings(null, { modelId: "nvidia/nemotron-3.5-lightning-30b-a3b", effort: "high" });
  saveSettings("t1", { modelId: "mistralai/mistral-large-4-1t-a52b", effort: "low" });
  assert.deepEqual(loadSettings("t1"), { modelId: "mistralai/mistral-large-4-1t-a52b", effort: "low" });
  assert.deepEqual(loadSettings(null), { modelId: "nvidia/nemotron-3.5-lightning-30b-a3b", effort: "high" });
  moveDraftSettings("t2");
  assert.deepEqual(loadSettings("t2"), { modelId: "nvidia/nemotron-3.5-lightning-30b-a3b", effort: "high" });
  assert.deepEqual(loadSettings(null), { modelId: "nvidia/nemotron-3.5-lightning-30b-a3b", effort: "high" });
});

test("malformed JSON and unknown values fall back to defaults", () => {
  store.clear();
  store.set("mishu:chat-settings", "{not json");
  assert.deepEqual(loadSettings("t1"), { modelId: DEFAULT_MODEL_ID, effort: DEFAULT_EFFORT });
  saveSettings("t1", { modelId: "nvidia/nemotron-3-super-120b-a12b", effort: "extreme" } as never);
  assert.deepEqual(loadSettings("t1"), { modelId: DEFAULT_MODEL_ID, effort: DEFAULT_EFFORT });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/chat-settings.test.ts`
Expected: FAIL — module `../src/lib/chat-settings.ts` not found.

- [ ] **Step 3: Implement `src/lib/chat-settings.ts`**

Single `localStorage` key `mishu:chat-settings`, value a JSON object mapping thread id (or `"draft"`) to `{ modelId, effort }`. `loadSettings` returns defaults when `localStorage` is unavailable, JSON is malformed, the entry is missing, or either value fails `isSupportedModel` / `isSupportedEffort`. `saveSettings` merges into the existing object and writes it back; passing `null` writes the `"draft"` entry. `moveDraftSettings(threadId)` copies the draft entry to `threadId` without deleting the draft. Use relative imports only.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/chat-settings.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat-settings.ts tests/chat-settings.test.ts
git commit -m "feat: persist model and effort per thread"
```

### Task 3: Worker validation and provider mapping

**Files:**
- Modify: `worker/index.ts:20`, `worker/index.ts:271-308`
- Test: `tests/worker-model.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_MODEL_ID`, `isSupportedModel`, `isSupportedEffort`, `effortToRequestOptions` from Task 1.
- Produces: `/api/chat/completions` accepts optional `modelId` and `reasoningEffort` in the JSON body; invalid values return 400.

- [ ] **Step 1: Write the failing test** in `tests/worker-model.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.ts";

function completion(body: unknown) {
  return new Request("https://example.test/api/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    duplex: "half",
  } as RequestInit);
}
const env = { VITE_NVIDIA_API_KEY: "test-key", DB: {} } as never;

test("an unknown model id is rejected with 400", async () => {
  const response = await worker.fetch(
    completion({ modelId: "nvidia/nemotron-3-super-120b-a12b", messages: [] }),
    env,
  );
  assert.equal(response.status, 400);
});

test("an unsupported effort is rejected with 400", async () => {
  const response = await worker.fetch(
    completion({ modelId: "nvidia/nemotron-3.5-bolt-e4b", reasoningEffort: "extreme", messages: [] }),
    env,
  );
  assert.equal(response.status, 400);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/worker-model.test.ts`
Expected: FAIL — both cases return a non-400 response and attempt to reach the provider.

- [ ] **Step 3: Implement validation and mapping in `worker/index.ts`**

Import the Task 1 exports with a relative path `../src/lib/model-options.ts`; delete the local `DEFAULT_MODEL` constant and use `DEFAULT_MODEL_ID`. In `handleChatCompletions`, after parsing the body: if `record.modelId` is present and `isSupportedModel(modelId)` is false, return `jsonError("Unsupported model", 400)`; if `record.reasoningEffort` is present and `isSupportedEffort(...)` is false, return `jsonError("Unsupported reasoning effort", 400)`. Resolve the model id from `record.modelId` (falling back to `DEFAULT_MODEL_ID`; keep accepting the legacy `record.model` string if present). Compute `const requestOptions = effortToRequestOptions(modelId, effort)` where `effort` defaults to `DEFAULT_EFFORT`. Pass `providerOptions: { nvidia: requestOptions }` and `maxOutputTokens: 2048` to `streamText`. Leave the provider config, system prompt, and stream pipeline untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/*.test.ts`
Expected: PASS — all tests including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts tests/worker-model.test.ts
git commit -m "feat: validate model choice and map reasoning effort in worker"
```

### Task 4: Transport carries the choice

**Files:**
- Modify: `src/lib/chat-transport.ts:15-16`, `src/lib/chat-transport.ts:149-177`
- Test: `tests/chat-transport.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_MODEL_ID`, `isSupportedModel`, `isSupportedEffort` from Task 1.
- Produces: `transport.sendMessages({ messages, abortSignal, body })` reads `body.modelId` and `body.reasoningEffort` and posts them as `model` and `reasoningEffort`.

- [ ] **Step 1: Write the failing test** in `tests/chat-transport.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MODEL_ID, DEFAULT_EFFORT } from "../src/lib/model-options.ts";
import { transport } from "../src/lib/chat-transport.ts";

const originalFetch = globalThis.fetch;

test("sendMessages posts the selected model and effort", async () => {
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(new ReadableStream(), { status: 200 });
  }) as typeof fetch;
  try {
    await transport.sendMessages({
      messages: [],
      abortSignal: undefined,
      body: { modelId: "nvidia/nemotron-3.5-super-vl-120b-a12b", reasoningEffort: "high" },
    });
    assert.equal(sent.model, "nvidia/nemotron-3.5-super-vl-120b-a12b");
    assert.equal(sent.reasoningEffort, "high");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an invalid body value falls back to defaults", async () => {
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(new ReadableStream(), { status: 200 });
  }) as typeof fetch;
  try {
    await transport.sendMessages({
      messages: [],
      abortSignal: undefined,
      body: { modelId: "bogus/model", reasoningEffort: "extreme" },
    });
    assert.equal(sent.model, DEFAULT_MODEL_ID);
    assert.equal(sent.reasoningEffort, DEFAULT_EFFORT);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/chat-transport.test.ts`
Expected: FAIL — the posted body contains the hardcoded model and no `reasoningEffort`.

- [ ] **Step 3: Implement the transport change**

Delete the local `MODEL` constant; import `DEFAULT_MODEL_ID`, `DEFAULT_EFFORT`, `isSupportedModel`, `isSupportedEffort` relatively. Extend the `sendMessages` parameter type with `body?: object`; narrow it to `Record<string, unknown>` and read `modelId` / `reasoningEffort`, falling back to the defaults when invalid. Build the JSON body with `model` set to the validated id and `reasoningEffort` set to the validated effort, keeping the existing `messages`, `stream`, `temperature`, `top_p`, `frequency_penalty`, `presence_penalty` fields. Remove the commented-out `reasoning_effort` line. Do not touch `toUiMessageChunkStream` or the forwarded chunk set.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/*.test.ts`
Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat-transport.ts tests/chat-transport.test.ts
git commit -m "feat: send chosen model and effort from chat transport"
```

### Task 5: Chatbox selector, docs, and browser verification

**Files:**
- Modify: `src/components/ChatBox.tsx:73-138`, `src/components/ChatBox.tsx:291-352`
- Modify: `GLOSSARY.md`

**Interfaces:**
- Consumes: `loadSettings`, `saveSettings`, `moveDraftSettings` from Task 2; `MODEL_OPTIONS`, `EFFORTS`, `DEFAULT_EFFORT` from Task 1.
- Produces: composer dropdown that sets `{ modelId, effort }` and passes it as `sendMessage` body.

- [ ] **Step 1: Add selector state and send it**

In `ChatBox`, initialize `const [settings, setSettings] = React.useState(() => loadSettings(threadId));`. Add `updateSettings(patch: Partial<ChatSettings>)` that merges into `settings`, calls `setSettings(next)` and `saveSettings(threadIdRef.current, next)`. In `submit`, after `ensureThread()` creates a thread, call `moveDraftSettings(threadIdRef.current)`; pass `{ body: { modelId: settings.modelId, reasoningEffort: settings.effort } }` as the second argument to `sendMessage`.

- [ ] **Step 2: Render the dropdown**

In the composer's `InputGroupAddon`, before the existing "Add context" `DropdownMenu`, add a `DropdownMenu` with `DropdownMenuTrigger` rendering an `InputGroupButton` (`aria-label="Model and reasoning effort"`, `disabled={busy}`, showing `MODEL_OPTIONS.find(o => o.id === settings.modelId)?.label` and the effort label). Its `DropdownMenuContent` (`side="top"`, `align="start"`) contains a `DropdownMenuLabel` "Model", a `DropdownMenuRadioGroup` of `DropdownMenuRadioItem`s for `MODEL_OPTIONS`, a `DropdownMenuSeparator`, then a `DropdownMenuLabel` "Reasoning effort" and a `DropdownMenuRadioGroup` of `EFFORTS` items. Omit the effort group when the selected model's `effortMode === "none"`. Use installed primitives only; no new dependency.

- [ ] **Step 3: Document the new terms in `GLOSSARY.md`**

Add one-line entries for **model option**, **reasoning effort**, and **effort mode** with their file paths. Do not remove existing entries.

- [ ] **Step 4: Run the full verification suite**

Run: `node --test tests/*.test.ts && pnpm run build && pnpm run lint`
Expected: tests and build PASS; lint reports exactly the 4 pre-existing errors from `229b4de` and no new ones.

- [ ] **Step 5: Browser pass on `pnpm run dev`**

Confirm: selector shows 4 models; choosing Super VL + high then sending posts `model` and `reasoningEffort: "high"` (check the request body in DevTools Network); refresh restores the selection; switching to another thread restores that thread's own selection; choosing Gemma 3 hides the effort group and sends no effort field; choosing Bolt never sends `reasoning_effort`. Fix anything that fails before finishing.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatBox.tsx GLOSSARY.md
git commit -m "feat: add model and reasoning effort selector to chatbox"
```
