# Model catalog expansion — design

Approved scope (conversation, 2026-11-27): add `z-ai/glm-5.3-flash` and `moonshotai/kimi-k3.1-pro` to the chat model picker. `nvidia/nemotron-3.5-bolt-e4b` is already present and unchanged.

## Why

Both are live NVIDIA NIM chat endpoints. NVIDIA's API docs say both accept `reasoning_effort` (`low`/`high`/`max`; GLM cannot disable reasoning). The existing `effortMode: "effort"` mapper sends `low` or `high` from the three-position picker, so no transport, worker or UI changes are needed.

## Approach

Add two `ModelOption` entries to `MODEL_OPTIONS` in `src/lib/model-options.ts`, both with `effortMode: "effort"`, labels "GLM 5.3 Flash" and "Kimi K3.1 Pro", and one-line descriptions. Update `tests/model-options.test.ts` first: catalog count 6, both ids supported, and `effortToRequestOptions` returns `{ reasoning_effort: "high" | "low" }` appropriately.

## Non-goals

Changing the default model, adding new effort levels, image/video input, provider-specific `clear_thinking`, or new dependencies.

## Verification

Test-first RED→GREEN, `pnpm run check`, then live smoke of both ids through `/api/chat/completions` on the dev server.
