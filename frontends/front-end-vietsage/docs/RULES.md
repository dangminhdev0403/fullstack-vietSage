# PROJECT RULES

## Core Rules

- Before starting implementation, read and follow `docs/RULES.md` plus any relevant file in `docs/` for the task.
- For each implementation task, set a short mission name and keep the working plan aligned to that mission until completion.
- Prefer Server Components by default
- Do not fetch APIs directly inside UI components
- Use TanStack Query for async server state
- Keep business logic outside page components
- Reuse existing UI primitives before creating new ones
- Do not modify unrelated logic during UI redesign

## API Logging Rule (Mandatory)

- Every backend request MUST emit a response log (`res log`) with prefix `[API_RES]`.
- Required log fields: `method`, `url`, `status`, `ok`, `durationMs`, and `response` payload.
- Apply logging centrally in `src/core/http/http-client.ts`; do not duplicate ad-hoc per page.
- Do not remove response logging during feature work. If format changes, update this RULES file in the same task.

## API Transport Rule (Mandatory)

- Always use the central HTTP transports for backend API calls.
- Use `src/core/http/http-client.ts` (`httpClient` / `HttpClient`) as a pure browser/public/backend transport. It does not own auth refresh, retry loops, navigation, or browser logout event dispatch.
- Use `src/core/http/internal-api-client.ts` for same-origin authenticated browser BFF flows. It owns one retry through `POST /api/auth/refresh-session` and emits the single logout-required signal when refresh/retry fails.
- Use `src/core/http/http-server.ts` (`httpServer`) as a pure server transport for backend API calls that run in Route Handlers or server-only service paths with explicit `Authorization` or `accessToken`.
- Do not call backend APIs with raw `fetch`, raw `axios`, or ad-hoc request helpers from pages, layouts, UI components, or feature services.
- Keep APIs that do not require authentication in the `httpClient` flow.
- Keep authenticated server calls in the `httpServer` flow.
- Keep refresh + `unstable_update` only in cookie-writable Route Handler or Server Action boundaries.

## UI Theme Direction

The application should follow a:

- follow file `@DESIGN.md`
- fresh
- bright
- friendly
- modern café-style UI

Design feeling:

- clean and spacious
- soft modern colors
- approachable restaurant experience
- premium but not luxury-dark

UI style preferences:

- large rounded cards
- soft shadows
- comfortable spacing
- clean typography
- product-focused visuals
- minimal visual clutter
- responsive-first layouts

Avoid:

- overly dark UI
- black/white corporate dashboards
- crowded marketplace-style layouts
- excessive gradients or glassmorphism

## Data Fetching

- Use queries/\* hooks
- Use feature repositories for backend/BFF calls; existing service loaders may migrate incrementally.
- Avoid duplicate fetching

## React Query Rule (Mandatory)

- For new or materially changed client-side API modules, declare server-state capabilities with `@/libs/query-resource`, then consume its options through `useQuery`, `useInfiniteQuery`, or `useMutation` in queries/* or feature hooks.
- Existing direct TanStack Query modules may migrate incrementally; do not rewrite unrelated realtime/cache code merely to satisfy this rule.
- Do not call backend APIs directly with raw fetch/axios inside page, layout, or presentational components.
- Repositories own transport selection, endpoints, DTO mapping, transforms, and pagination normalization. The `src/libs/query-resource` factory must remain independent of `fetch`, Axios, VietSage clients, and backend response envelopes.
- Resources own key factories, query/infinite options, mutations, local invalidation, prefetch/ensure, and cache patch/rollback operations.
- Feature hooks own permission checks, feature flags, enabled guards, filter normalization, cross-resource coordination, navigation, and UI feedback.
- Every response-affecting scope value and input must be represented in `scopeKey` or `inputKey`. Keys must be deterministic and JSON-serializable.
- Declare only supported capabilities. Domain commands are named mutations; do not add an untyped `extra` namespace or assume every module has full CRUD.
- Keep same-resource invalidation declarative in the mutation definition. Cross-resource effects must be explicit in a feature hook.
- Realtime handlers must use resource-generated keys/cache operations when a resource exists; do not duplicate key arrays.
- Use enabled guards for missing params/session to avoid premature requests and unnecessary 401 retries.
- Server-side (RSC/layout) fetches stay in server layers; React Query is the client cache/interaction layer.
- Frontend dependency management is rooted at `front-end-vietsage/package.json`. Do not create nested `package.json`, nested `node_modules`, or `packages/*` workspaces for app-internal resource utilities unless the team explicitly starts a publish/release task.
- Cross-project reuse before publishing means copying `src/libs/query-resource` as infrastructure code. Each project still writes its own repositories/resources around its own API contract.

## State Management

- Use Zustand for global client state, shared UI state, and storage-backed client state.
- Do not introduce ad-hoc global state through React Context, module-level mutable variables, or duplicated `useState` chains when the state must be shared across routes/components.
- Do not read/write `localStorage` or `sessionStorage` directly from feature components for shared/persistent state; wrap persistent client state in a Zustand store using `persist` / `createJSONStorage` or a dedicated storage utility used by that store.
- Keep Zustand stores minimal and client-only. Store UI/session preferences, persisted client selections, and cross-component client state there; do not mirror backend resources in Zustand.
- TanStack Query for server state

## Auth & Routing Rules

- Keep route permission policy in one place: `src/lib/rbac.ts`.
- For Next.js 16 auth edge handling, use `src/proxy.ts` (not legacy `middleware.ts`).
- Protected route behavior is mandatory: unauthenticated user -> redirect to `/login?callbackUrl=<current-path>`.
- Protected route behavior is mandatory: authenticated but unauthorized role -> render `404` via `notFound()`.
- Enforce role checks in server layouts for protected route groups (`/guest`, `/staff`, `/admin`).
- Never redirect directly from raw `callbackUrl`; always resolve through `resolveSafeRedirect(...)`.
- Reject external callback URLs and unknown internal paths; fallback to role default path.

## UI Rules

- Use skill `/design-taste-frontend` + `/ui-ux-pro-max` only when creating brand new screens, layouts, or visual concepts
- Use skill `/design-taste-frontend` +`/frontend-design` only when improving or redesigning existing UI
- Keep responsive design mobile-friendly
- Reuse `components/ui/*` primitives first
- Do not modify unrelated business logic during UI redesign
- For synchronization tasks, follow root validation checklist at `docs/FRONTEND_SYNC_VALIDATION.md`

Avoid duplicating query boilerplate already handled by the resource system.

## Change Tracking Rule (Mandatory)

For every completed implementation/fix, you MUST update documentation in the same task:

- update file `docs/PLANS.md` with:
  - date
  - what changed
  - verification result
  - remaining blockers/risks
- if behavior/rules/process changed, update `docs/RULES.md` in the same PR/commit.
- If `docs/PLANS.md` is not updated, the task is NOT considered complete.
  After complete a module, run a cleanup pass for lint warnings to keep the project clean.

Do not mark work as complete until documentation sync is finished.

## Git Commit Rule (Mandatory)

- Follow the project's git commit rules whenever the user asks to commit or prepare commit-ready work.
- Inspect `git status --short` before committing.
- Do not include unrelated modified/untracked files in a commit.
- Do not revert user changes or generated work unless explicitly requested.
- Keep commits scoped to the mission name and completed plan.
- Use clear conventional commit-style messages when no stricter project-specific commit format is provided, for example `fix: stabilize auth refresh boundary` or `docs: update project rules`.
- Before reporting commit-ready work, list changed files, validation commands, and documentation updates.

## Execution Contract (Mandatory)

This frontend scope follows the repository-level delegation-aware approval rule in `../../../../docs/RULES.md`.

For direct user-facing sessions, stay read-only until the user explicitly approves the proposed scope.

For delegated specialist/đệ/Kanban/Codex worker sessions, do not ask for another confirmation when the launch prompt states that user/Hermes has already approved execution. Treat that prompt as the approved execution context and work only inside the delegated scope.

If Codex stops at a stale approval guard, restart Codex with the approved execution context at the top of the prompt instead of waiting for an interactive `CHO PHÉP SỬA` inside the process.

After explicit approval:

- Do not stop after describing intent.
- Do not answer with planning only.
- Inspect relevant files.
- Apply the approved code/docs change only.
- Run the smallest reliable validation command.
- Update `docs/PLANS.md` only when the task affects tracked milestones/progress.
- Only then provide the final report.

A task is not complete until all completion evidence exists:

1. Files inspected
2. Files changed
3. Validation command run, or a concrete blocker if validation cannot run
4. Result captured
5. Required docs updated when applicable
6. Final report delivered

Do not end with future-tense statements like:

- `I will implement`
- `I'll now implement`
- `I'm going to implement`
- `Next I will`

Use evidence-based past-tense statements only:

- `Changed ...`
- `Ran ...`
- `Updated ...`
- `Verified ...`

If blocked, report the concrete blocker:

- missing file
- failing command
- permission issue
- missing dependency
- unclear required input
