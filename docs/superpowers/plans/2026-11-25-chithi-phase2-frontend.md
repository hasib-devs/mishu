# Chithi Phase 2 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing Chithi slot/paper-style service seam through the HTTP API and the `/chithi` UI.

**Architecture:** Additive schema/route changes in the Hono app; client schema mirrors them; the modal uses React Hook Form + Zod and TanStack Query mutations; CSS-only paper themes. No new dependencies or migration.

**Tech Stack:** Hono, Zod 4, Drizzle/D1, React 19, React Router v8, TanStack Query v5, React Hook Form, Tailwind 4, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-25-chithi-phase2-frontend-design.md`

## Global Constraints

- Worker code only under `worker/`; client code only under `src/`. No cross-boundary imports.
- Paper styles: `classic | modern | minimal`; default `classic`.
- `generated_for`: hour-aligned epoch ms (`n % 3_600_000 === 0`) or `null`.
- HTTP POST may set `paper_style` and `generated_for`; PATCH may set `content` and/or `paper_style`; `source` remains service-only.
- Duplicate slot → 409; invalid style/slot → 400.
- `node --test tests/*.test.ts`; `pnpm run lint` has pre-existing errors — add none; `pnpm run build` must pass.
- No secrets printed or committed. No pushes.

## Review Focus

1. Duplicate hour slot → inline 409, form stays editable — pinned in Task 2 and Task 4.
2. Non-hour-aligned `generated_for` → 400, never a stored row — pinned in Task 2.
3. PATCH with only `paper_style` → style changes, content unchanged — pinned in Tasks 1–2.
4. Paper style/slot survive refresh — pinned by Task 3 client payload test plus Task 5 browser pass.
5. No double refetch on save — Task 5 removes `onSaved` refetch.

---

### Task 1: Validation and service patch shape

**Files:** Modify `worker/chithi/validation.ts`, `worker/chithi/service.ts`; Test `tests/chithi-service.test.ts`.

**Interfaces:** Produces `paperStyleSchema`, extended `createChithiSchema`, extended `patchChithiSchema`, `PatchChithiInput = { content?: string; paperStyle?: string }`.

- [ ] **Step 1: Write failing tests** in `tests/chithi-service.test.ts`: style-only update keeps content; create accepts `paperStyle`/`generatedFor`; schemas reject `"fancy"` style and a non-aligned slot and accept `"minimal"` plus an aligned slot.
- [ ] **Step 2:** `node --test tests/chithi-service.test.ts` → FAIL.
- [ ] **Step 3:** Implement schemas (Zod 4 `z.enum`, `.refine`, patch `.refine` requiring one field) and make `updateChithi` set only supplied fields while bumping `updated_at`.
- [ ] **Step 4:** `node --test tests/chithi-service.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(chithi): accept paper style and slot in validation/service`.

### Task 2: Hono routes and 409 mapping

**Files:** Modify `worker/chithi/routes.ts`; Test `tests/worker-chithi.test.ts`.

**Interfaces:** Consumes Task 1 schemas; `SlotTakenError` from `worker/chithi/service.ts`.

- [ ] **Step 1:** Write failing worker tests: POST with style+slot persists both; second POST with same slot → 409 JSON error; bad style and non-aligned slot → 400; PATCH style-only returns updated row with original content.
- [ ] **Step 2:** `node --test tests/worker-chithi.test.ts` → FAIL.
- [ ] **Step 3:** Pass validated fields to service; catch `SlotTakenError` in POST → 409; keep Zod validator 400 hook for other errors.
- [ ] **Step 4:** `node --test tests/worker-chithi.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(chithi): expose style/slot over HTTP with 409 conflicts`.

### Task 3: Client API and schema

**Files:** Modify `src/lib/chithi-api.ts`, `src/lib/chithi-schema.ts`; Test `tests/chithi-api.test.ts`.

**Interfaces:** Produces `PaperStyle`, `Chithi.paper_style: PaperStyle`, `createChithi(content, options?)`, `updateChithi(id, string | {content?, paperStyle?})`, `paperStyles`, `chithiSchema` with `{content, paperStyle, slot}`.

- [ ] **Step 1:** Write failing client tests: POST body includes `paper_style`/`generated_for` only when supplied; PATCH object body sends `paper_style`; plain string callers still send `{content}`.
- [ ] **Step 2:** `node --test tests/chithi-api.test.ts` → FAIL.
- [ ] **Step 3:** Implement client changes; keep existing signatures working.
- [ ] **Step 4:** `node --test tests/chithi-api.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(chithi): extend typed client for style and slots`.

### Task 4: Modal form controls

**Files:** Create `src/components/chithi/paper-style-utils.ts`; Modify `src/components/chithi/chithi-form-dialog.tsx`.

**Interfaces:** Consumes Task 3 client API/schema/hooks; `PAPER_CLASSES` from utils.

- [ ] **Step 1:** Write a test for `PAPER_CLASSES` covering all three styles and the default fallback.
- [ ] **Step 2:** Run it → FAIL (module missing).
- [ ] **Step 3:** Implement `PAPER_CLASSES` and add paper-style `<select>` plus hour `<select>` (next 24 free UTC hours, editing row's own slot included); convert `slot` to `generatedFor` on submit; surface inline 409 error.
- [ ] **Step 4:** Run the test → PASS; `pnpm run build` → clean.
- [ ] **Step 5:** Commit `feat(chithi): add paper style and hour slot controls to form`.

### Task 5: Dashboard rendering and verification

**Files:** Modify `src/components/chithi/chithi-dashboard.tsx`; delete unused `onSaved` refetch.

**Interfaces:** Consumes `PAPER_CLASSES`, `useChithis`, mutations.

- [ ] **Step 1:** Change modal props to `{open, initial, onClose}` (drop `onSaved`) so save does not double-refetch.
- [ ] **Step 2:** Apply per-card paper classes from `item.paper_style` and show a scheduled-hour badge when `generated_for` is non-null.
- [ ] **Step 3:** Run `node --test tests/*.test.ts`, `pnpm run lint`, `pnpm run build` → all clean / no new lint errors.
- [ ] **Step 4:** Browser pass `/chithi`: create with a style and hour, edit, refresh persists, duplicate hour shows inline 409.
- [ ] **Step 5:** Commit `feat(chithi): render paper themes and scheduled badges`.
