# Frontend Routing & Toolchain Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-rolled `window.history` routing with declarative React Router v8 + TanStack Query v5, keeping existing wire behaviour (`?thread=`, `/chithi`, Chithi CRUD) unchanged.

**Architecture:** `App.tsx` becomes a thin shell (`<BrowserRouter>` → `<Routes>`); the chat route reads `?thread=` with `useSearchParams()` and loads via `useThread(id)`; `/chithi` renders the Chithi dashboard. TanStack Query wraps the existing `thread-api`/`chithi-api` fetch modules. **Declarative mode — no route loaders** (loaders require `createBrowserRouter`, which is approach 2 and was not chosen).

**Spec:** `docs/superpowers/specs/2026-11-25-frontend-arch-design.md` (approved 2026-11-25)

**Tech Stack:** React 19 + Vite 8 + `react-router@8.5.3` + `@tanstack/react-query@5.108.4` + `react-hook-form@7.92.0` + `@hookform/resolvers@7.0.9` + `react-error-boundary@6.1.6` + existing `zod@4.6.7`

**Global Constraints:**
- React 19 + Vite 8 SPA + Cloudflare Worker/D1; `tsconfig.app.json` covers `src/` only — **client code cannot import from `worker/`**.
- React Router v8 is a single package (`react-router`); `react-router-dom@8` does not exist. All DOM APIs are top-level exports of `react-router`.
- Declarative mode: no `loader`/`useLoaderData`/`errorElement` — use hooks + React Query.
- `zod@4` in repo; no Zod usage in `src/` today — client schema must be created locally.
- `pnpm run build` type-checks + builds; `pnpm run lint` has **pre-existing** errors — add none.
- Existing tests: `node --test tests/*.test.ts` (worker only). No frontend test runner.
- No wire changes to `?thread=`/Chithi API; no worker changes.

---

## Files

### Task 1 (deps)
- Modify: `package.json` (add 5 deps); run `pnpm install`; `pnpm run build`

### Task 2 (query layer)
- Create: `src/lib/query.ts` — `createQueryClient()`, `QueryClientProvider`
- Create: `src/lib/query-hooks.ts` — `useThreads`, `useThread`, `useChithis`, `useChithi`, and 5 mutation hooks
- Reference (do not modify): `src/lib/thread-api.ts`, `src/lib/chithi-api.ts`

### Task 3 (router + chat route)
- Modify: `src/App.tsx` → `<BrowserRouter>` → `<QueryClientProvider>` → `<Routes>`
- Create: `src/routes/chat-route.tsx` — reads `?thread=` via `useSearchParams`, `useThread(id)`, renders `ChatBox` + `ThreadSidebar`, owns `ensureThread`/delete
- Create: `src/routes/chithi-route.tsx` — `/chithi` route with `ErrorBoundary`
- Modify: `src/components/thread-sidebar.tsx` — `<Link>` for thread select and the existing "Chithi" link, both preserving `location.search`

### Task 4 (Chithi integration)
- Create: `src/lib/chithi-schema.ts` — client-side Zod schema (mirrors worker rule: content trimmed 1–600)
- Modify: `src/components/chithi/chithi-dashboard.tsx` — hook-driven (`useChithis` + mutations), no `useEffect` fetch
- Modify: `src/components/chithi/chithi-form-dialog.tsx` — `react-hook-form` + `zodResolver(chithiSchema)`
- Modify: `src/routes/chithi-route.tsx` — `ErrorBoundary` fallback + `<Link to={"/" + location.search}>` back

### Task 5 (verify)
- `pnpm run build`, `pnpm run lint` (no new errors), `node --test tests/*.test.ts`, browser pass

---

## Task 1: Config + dependencies

**Steps:**
- [ ] Add to `package.json` dependencies: `react-router@8.5.3`, `@tanstack/react-query@5.108.4`, `react-hook-form@7.92.0`, `@hookform/resolvers@7.0.9`, `react-error-boundary@6.1.6`
- [ ] Run `pnpm install`
- [ ] Run `pnpm run build` — expect clean type-check (no new errors)
- [ ] Commit: `git add package.json pnpm-lock.yaml && git commit -m "chore: add react-router v8, tanstack query, react-hook-form"`

---

## Task 2: Query layer

**Interfaces:**
- Consumes: `listThreads`, `getThread`, `deleteThread` (thread-api); `listChithis`, `createChithi`, `updateChithi`, `deleteChithi` (chithi-api). All plain `fetch` wrappers, unchanged.
- Produces:
  - `createQueryClient(): QueryClient`
  - `QueryClientProvider({ children }: { children: React.ReactNode })` — wraps TanStack's provider; memoized client via `useState(createQueryClient)`
  - `useThreads(): UseQueryResult<ThreadSummary[], Error>`
  - `useThread(threadId: string | null): UseQueryResult<ThreadDetail | null, Error>` — `enabled: !!threadId`; a 404 (getThread throws) resolves `data: null` via `queryFn` catch, so the chat route treats it as a draft
  - `useChithis(): UseQueryResult<Chithi[], Error>`
  - `useChithi(id: string): UseQueryResult<Chithi, Error>` (available for a future detail page)
  - `useDeleteThreadMutation(): UseMutationResult<void, Error, string>`
  - `useDeleteChithiMutation(): UseMutationResult<void, Error, string>`
  - `useCreateChithiMutation(): UseMutationResult<Chithi, Error, string>`
  - `useUpdateChithiMutation(): UseMutationResult<Chithi, Error, { id: string; content: string }>`
- All mutations `invalidateQueries` their resource on success.

**Steps:**
- [ ] Write `src/lib/query.ts`: `createQueryClient` with `defaultOptions: { queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: true } }`; `QueryClientProvider` uses `useState(createQueryClient)`.
- [ ] Write `src/lib/query-hooks.ts`: hooks thin over api modules with `useQuery`/`useMutation`; `useThread` catches 404 → `null` and uses query key `["thread", threadId]`.
- [ ] Run `pnpm run build` — no type errors.
- [ ] Commit: `git add src/lib/query.ts src/lib/query-hooks.ts && git commit -m "feat: add tanstack query client and resource hooks"`

---

## Task 3: Router + chat route

**Interfaces:**
- Consumes: `BrowserRouter`, `Routes`, `Route`, `Link`, `useSearchParams`, `useNavigate`, `useLocation` (from `react-router`); `useThreads`, `useThread`, `useDeleteThreadMutation` (query-hooks); `createThread`, `getThread` (thread-api).
- Produces: `<Routes>` with `/` → chat shell, `/chithi` → Chithi, and `?thread=` preserved across internal navigation.

**Steps:**
- [ ] In `src/App.tsx`: remove all `window.history.pushState`/`popstate`/`isChithiPath` logic; render `<BrowserRouter><QueryClientProvider><Routes><Route path="/" element={<ChatRoute />} /><Route path="/chithi" element={<ChithiRoute />} /></Routes></QueryClientProvider></BrowserRouter>`.
- [ ] Create `src/routes/chat-route.tsx`: `const [searchParams] = useSearchParams(); const threadId = searchParams.get("thread"); const threadQuery = useThread(threadId); const threadsQuery = useThreads(); const navigate = useNavigate();`
  - `selectThread(id)` → `navigate({ pathname: "/", search: \`?thread=\${id}\` })`.
  - `newChat()` → `navigate({ pathname: "/", search: "" })` plus a `sessionNonce` bump so `ChatBox` remounts to its draft state.
  - `ensureThread()` → `const created = await createThread(); navigate({ pathname: "/", search: \`?thread=\${created.id}\` }, { replace: true }); return created.id;` (threads list refetches via mutation hook invalidation).
  - delete → `useDeleteThreadMutation().mutate(id)` + `ConfirmDialog`; if deleting the active thread, `newChat()`.
  - Render `<ChatBox key={\`\${threadId ?? "draft"}-\${sessionNonce}\`} ...>` (keeps current remount-on-switch behavior); loading when `threadQuery.isLoading`, draft title when `!threadId || !threadQuery.data`, error inline when `threadQuery.isError`.
- [ ] The `?thread=` must survive a `/chithi` round-trip: in `thread-sidebar.tsx` the "Chithi" `<a>` becomes `<Link to={{ pathname: "/chithi", search: location.search }}>` using `useLocation()`; each thread button becomes `<Link to={{ pathname: "/", search: \`?thread=\${thread.id}\` }}>` (keep `activeId` highlight).
- [ ] `pnpm run build` — no new type errors.
- [ ] Commit: `git add src/App.tsx src/routes/chat-route.tsx src/components/thread-sidebar.tsx && git commit -m "feat: declarative routing for chat and chithi"`

---

## Task 4: Chithi integration

**Interfaces:**
- Consumes: `useChithis`, `useCreateChithiMutation`, `useUpdateChithiMutation`, `useDeleteChithiMutation`; `useForm` from `react-hook-form`, `zodResolver` from `@hookform/resolvers/zod`, `chithiSchema` from `chithi-schema`; `ErrorBoundary` from `react-error-boundary`.
- Produces: `chithiSchema` client-side; `ChithiRoute` wrapping `ChithiDashboard` in an `ErrorBoundary`; hook-driven dashboard and form.

**Steps:**
- [ ] Create `src/lib/chithi-schema.ts`: `export const chithiSchema = z.object({ content: z.string().trim().min(1, "Write a letter").max(600, "Up to 600 characters") }); export type ChithiFormValues = z.infer<typeof chithiSchema>;` (mirrors `worker/chithi/validation.ts` rule; does not import from `worker/`).
- [ ] `chithi-dashboard.tsx`: remove the `useEffect` initial fetch; use `useChithis()` for items + loading/error; `useDeleteChithiMutation()` for delete with `ConfirmDialog`; keep create/edit opening `ChithiFormDialog`. Do not change markup/copy beyond what the hooks require.
- [ ] `chithi-form-dialog.tsx`: replace the manual `draft`/`errorState` logic with `useForm<ChithiFormValues>({ resolver: zodResolver(chithiSchema), defaultValues: { content: initial?.content ?? "" } })`; keep the `key={...}` remount on `initial` change, counter, submit disabled while `isSubmitting`, and `onSaved`/`onClose`; call `useCreateChithiMutation`/`useUpdateChithiMutation` in the submit handler.
- [ ] Create `src/routes/chithi-route.tsx`: `<ErrorBoundary FallbackComponent={...}><ChithiDashboard /></ErrorBoundary>`; "Back to chat" is `<Link to={{ pathname: "/", search: location.search }}>` (preserves `?thread=`).
- [ ] `pnpm run build` — no new type errors.
- [ ] Commit: `git add src/lib/chithi-schema.ts src/components/chithi/ src/routes/chithi-route.tsx && git commit -m "feat: wire chithi to react query and hook form"`

---

## Task 5: Verification + browser pass

**Steps:**
- [ ] `pnpm run build` — typecheck clean, no new errors
- [ ] `pnpm run lint` — no new errors (pre-existing ones unchanged)
- [ ] `node --test tests/*.test.ts` — existing backend tests pass
- [ ] Manual browser pass: `/` chat shell opens; `/chithi` lists letters; create/edit/delete Chithi; back/forward between `/` and `/chithi` preserves `?thread=`; a bogus `?thread=missing` lands in draft state; loading/error states render
- [ ] Final commit if any verification fixes were needed

---

## Review Focus

1. **Bogus `?thread=` still lands in `/` as a draft** — `useThread` catches the 404 and returns `data: null`; no unhandled rejection. Pass: `/?thread=does-not-exist` shows "New chat".
2. **Back/forward restores the right view and thread** — `BrowserRouter` handles `popstate`; no manual listener remains. Pass: navigate `/` → `/chithi` → back, thread still loaded.
3. **`?thread=` survives a Chithi round-trip** — internal `Link`s carry `location.search`. Pass: from `/?thread=abc`, open Chithi, click Back to chat → `?thread=abc` still in URL and thread loaded.
4. **Mutation errors don't leave the app stuck** — failed create/update/delete surfaces an inline error and the form stays usable. Pass: simulate a 500, verify error text + retry.
5. **Client-only client creation** — `QueryClient` is created in a `useState` initializer, never during build. Pass: `pnpm run build` completes without `window`/`document` access during build.
