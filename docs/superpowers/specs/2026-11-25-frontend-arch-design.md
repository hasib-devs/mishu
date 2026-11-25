# Mishu — Frontend Routing & Toolchain Upgrade
**Date:** 2026-11-25
**Status:** Draft for approval

## Intent & why
Mishu grew beyond a single view: chat (/) plus the Chithi letter store (/chiqui, `/chithi`). Routing is currently hand-rolled with `window.history.pushState`/`popstate` and a `?thread=` query-param hack inside one large `App.tsx`. As more pages are added, this becomes unmanageable and hides data-fetching state (loading/error/draft) inside component effects.

This change introduces a proper declarative router and a modern server-state layer so that new routes and features can land additively.

## Goals
- Replace manual `popstate`/pathname routing with **React Router v8 (declarative)**.
- Add **TanStack Query v5** as the server-state layer on top of the existing `fetch` api modules.
- Keep the existing app behaviour (`?thread=`, `/chithi`, Chithi CRUD) unchanged at the wire level.
- Make room for new pages with a small, clear route layout and wiring.

## Non-goals / Anti-goals
- No SSR / no React Router framework (Remix) mode — the app is a Cloudflare SPA (`not_found_handling: single-page-application`).
- No rewrite of the Hono worker, chat streaming, or the `/api/*` NVIDIA proxy.
- No authentication, per-user scoping, or transactional state (no SSR request context needed).
- Forms and global client state only where already proven (Chithi modal form) — not rebuilt for the chat shell.

## Constraints
- React 19 + Vite 8 SPA + Cloudflare Worker/D1. `tsconfig.worker.json` covers `worker/` only; `tsconfig.app.json` covers `src/`.
- Existing tests: `node --test tests/*.test.ts`. Lint currently has pre-existing errors; **add none**.
- `pnpm run build` currently typechecks & builds; keep it green.

## Approaches (the three, user picked #3)

1. **Declarative only** (`BrowserRouter` + `<Routes>`) — smallest migration; keeps raw `useEffect`+fetch. Fast, low risk, but no data-caching or routing-level error boundaries.
2. **Data router** (`createBrowserRouter` + `RouterProvider`, loaders/actions) — modern recommended mode; loaders fetch before render, actions handle mutations, built-in pending/error elements. Bigger refactor of `App.tsx`.
3. **Declarative + TanStack Query v5** *(chosen)* — keep `BrowserRouter` for routing, layer React Query over the existing api modules. Gives caching/refetch without forcing loaders for every route, and is the path that changes the least while still being "modern."

## Decided how (design)

### Dependency stack (exact latest)
| Package | Version | Used for |
|---|---|---|
| `react-router` | `8.5.3` | declarative routing (v8 merged `react-router-dom` into `react-router`) |
| `@tanstack/react-query` | `5.108.4` | server state (cache/refetch/mutations) |
| `react-hook-form` | `7.92.0` | form state (only Chithi modal) |
| `@hookform/resolvers` | `7.0.9` | Zod 4 resolver for RHF |
| `react-error-boundary` | `6.1.6` | route-level error boundaries |
| *(later)* `zustand` | `5.1.0` | cross-component client state — **decide later** |

### Routing layout
- `src/App.tsx` becomes a thin shell: wrap in `<BrowserRouter>` + `<Routes>`; no more `popstate`/pathname booleans.
- Route files in `src/routes/`:
  - `src/routes/index.tsx` — root `/` (existing chat shell)
  - `src/routes/chithi.tsx` — `/chithi` (ChithiDashboard)
  - future routes added in the same file/format
- Edge case `?thread=` **kept** as the active-thread selector: root loader reads `useSearchParams()`, routes to the selected thread; back/forward is handled by the router, no manual listeners.

### Data layer (new `src/lib/query.ts`)
- `createQueryClient()` factory + `QueryClientProvider` in `App`.
- One hook per resource, thin over existing modules:
  - `useThreads()` / `useThread(id)` — `listThreads`/`getThread`
  - `useChithis()` / `useChithi(id)` — `listChithis`/`getChithi`
- `useMutation` for `createChithi`/`updateChithi`/`deleteChithi` and thread save/delete, with `onSuccess` refetch per scope.
- Keep `thread-api.ts` / `chithi-api.ts` raw `fetch` unchanged; never touch the worker.

### State & forms
- Global client state: **defer** to a later phase (Zustand only if cross-component state is proven needed). No new store for this change.
- Chithi modal form: convert to `react-hook-form` + `@hookform/resolvers` (zod). Keep `ConfirmDialog` for delete.
- Chat form state stays local to `ChatBox` (no store change).

### Error handling
- Wrap route elements in `<ErrorBoundary>` (`react-error-boundary`) with a shared fallback UI; route-level `errorElement` where loaders run.

## What's left to the builder
- Exact route file shape and migration of `App.tsx` effects (thread loading moves to a root loader).
- Where `QueryClient` lives and whether to enable refetch on window focus (default is fine).
- Whether to keep `?thread=` or switch to path-based (`/threads/:id`) later — decision changes nothing in the wire layer.
- Exact `errorElement` copy.

## Verification
1. Install deps + run `tsc`/build — no new type errors.
2. `pnpm run lint` — no new errors.
3. `node --test tests/*.test.ts` — existing tests still pass (no tests currently assert on the router itself).
4. Browser pass: `/` chat shell, `/chithi` lists letters, create/edit/delete work, back/forward between chat and dashboard.
