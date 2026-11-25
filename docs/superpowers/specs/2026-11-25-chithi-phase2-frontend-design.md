# Chithi Phase 2 — slot-aware, paper-styled frontend

## Intent

Phase 1 shipped CRUD at `/chithi`. The service layer already supports hour slots and
paper styles, but HTTP clients cannot use them and the UI exposes neither. Phase 2
makes those seams usable from the frontend without touching chat/streaming or adding
dependencies. User direction: take the recommended approach and use the best/current
solutions available in the repo.

## Goals

- POST accepts optional `paper_style` and `generated_for`; PATCH accepts `paper_style`
  and makes `content` optional (at least one field required).
- `SlotTakenError` maps to HTTP 409; invalid style/slot maps to 400.
- Create/edit modal offers a paper-style selector and a "schedule to hour" picker
  built from the loaded letters plus the next 24 UTC hours.
- Cards render the selected paper theme and show a scheduled-hour badge.
- Remove the duplicate list refetch after save (mutations already invalidate).

## Non-goals

- No cron/AI generation (`worker/chithi/generate.ts` stays a seam), no auth, no new
  D1 migration, no new npm packages, no date library (native `Intl`).
- No pagination/cursor, rich text, or attachments.

## Constraints

- `tsconfig.worker.json` includes `worker/` only; `tsconfig.app.json` includes `src/`
  only. Client schema is duplicated in `src/lib/chithi-schema.ts`.
- React Router v8 declarative mode; TanStack Query v5; React Hook Form + Zod 4.
- `react-refresh/only-export-components`: non-component exports go in sibling
  `*-utils.ts` files.
- Existing tests use `node --test tests/*.test.ts`; `pnpm run lint` has pre-existing
  errors — add none; `pnpm run build` must pass.
- Never print or commit secret values.

## Approaches considered

1. **Additive fields on existing CRUD routes** *(chosen)* — smallest change that
   activates the existing service seam; no new endpoint or dependency. Tradeoff:
   unauthenticated callers can claim an hour, acceptable since nothing here is
   authenticated and the unique index plus 409 protect the cron.
2. **Separate slot resource** — cleaner isolation, doubles API/frontend flow for no
   benefit at this scale. Rejected.
3. **Client-only styles** — no persistence across refresh. Rejected.

## Decided how

- Paper styles are the enum `classic | modern | minimal`; default `classic`.
- `generated_for` is an hour-aligned epoch-ms integer or `null`; validation lives in
  Zod on both sides (service check stays as backstop).
- Client API keeps backward-compatible signatures: `createChithi(content, options?)`
  and `updateChithi(id, contentOrPatch)`.
- Form values are `{ content, paperStyle, slot: string }` where `slot` is `""` or an
  hour-epoch string; the submit handler converts it to `generatedFor: number | null`.
- Paper-theme Tailwind classes live in `src/components/chithi/paper-style-utils.ts`.

## Verification

- Worker tests: persisted style/slot, 409 duplicate slot, 400 invalid style and slot,
  PATCH style-only. Service test: style-only update.
- Client tests: new POST/PATCH payloads.
- `node --test tests/*.test.ts`, `pnpm run lint` (no new errors), `pnpm run build`,
  then browser pass of `/chithi`: create with style+slot, edit, refresh persists,
  duplicate hour surfaces inline 409.
