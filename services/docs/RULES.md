# VietSage Backend Rules For Codex

## Scope Rules

- Work only inside `services/` unless the user explicitly expands scope.
- For backend implementation, work primarily inside `services/auth-service/`.
- Do not modify frontend files.
- Do not change existing UI, frontend routes, or frontend user flow.
- Do not refactor unrelated code.
- Only change files required for the current milestone.
- Do not introduce extra services, packages, or infrastructure without a clear reason tied to the milestone.

## Engineering Rules

- Analyze root cause before changing code.
- Propose and execute one optimal direction.
- Keep controllers thin; controllers handle transport only.
- Put orchestration in application services/use cases.
- Keep domain rules out of infrastructure and controllers.
- Keep database access behind repositories or infrastructure services.
- Use DTO validation for request payloads.
- Use consistent error response shape.
- Add or update tests for implemented behavior.

## Patch Reliability Rules

To reduce tool-loop failures such as `repeated_exact_failure_warning`, follow this flow:

- Never retry the exact same patch more than once.
- After any patch failure, re-read the target file and regenerate patch context from current content.
- Keep patches small and atomic; prefer one concern per patch with stable anchor lines.
- Avoid ambiguous anchors that can appear multiple times in the same file.
- If the same failure appears twice, stop patch retry loop and switch strategy (smaller hunk, direct file rewrite, or targeted scripted replace).
- Confirm the exact target path before patching, and patch real file paths only (not markdown link text).
- After patching, verify the result immediately with file readback or diff before the next change.

## Milestone Execution Rule

- Milestone 2 (Auth Core) is finalized and considered release-ready once validation gates are green.
- Milestone 3 stays in Plan Mode until role, permission, and tenant-access contracts are documented and approved.
- Do not start Milestone 4 APIs before Milestone 3 guard/decorator chain is implemented and tested.

## Route Access Rules (Public vs Private)

Default policy:

- Every new endpoint is private by default.
- A route is public only when explicitly listed in `src/common/config/routes.config.ts`.

When creating a new endpoint/module:

- Decide and document route access type: `Public` or `Private`.
- If route is `Public`, add it to `PUBLIC_PATTERNS` first.
- Use `PUBLIC_REGEX` only for unavoidable exceptions.
- Do not add broad wildcards (for example `/api/**`, `/auth/**`) that can expose protected endpoints.
- Keep auth-sensitive routes (`logout`, profile, admin, internal) private unless explicitly approved.

Guard and matcher usage:

- `JwtAuthGuard` is the enforcement point for request authentication.
- `publicMatcher.isPublic(request.path)` is allowlist-only bypass logic.
- Any route not matched by `publicMatcher` must require a valid bearer `accessToken`.
- Match order must stay deterministic and security-first: explicit allowlist, then JWT guard.

Validation requirements for access control changes:

- Add/update e2e tests for route access behavior.
- For `Public` routes: verify success without token.
- For `Private` routes: verify `401` without token and success with valid token.
- Run full validation from `services/auth-service`:
  - `npm run build`
  - `npm run test`
  - `npm run test:e2e`
  - `npm run lint`

## Backend Priorities

- DB schema design first.
- Index strategy must match query patterns.
- Pagination must be explicit and bounded.
- Transaction boundaries must be intentional.
- Security and role checks must be implemented at API boundaries.
- OpenTelemetry tracing must be considered for production hardening.

## Cache Rules

- Do not propose Redis/cache by default.
- Only propose cache when a real bottleneck exists.
- If cache is proposed, document:
  - reason
  - cache key
  - TTL
  - invalidation strategy
  - trade-off and stale-data risk

## Transaction Rules

Use DB transaction for:

- create service request + first request event
- update request status + append status event
- any multi-write operation that must be atomic

Do not use transaction for:

- simple read endpoints
- dashboard read aggregation
- independent logs/telemetry

## Query Rules

Review every list endpoint for:

- N+1 query risk
- missing index
- unbounded pagination
- unnecessary selected fields
- redundant query

## Prisma Migration Rules

Use migration-based Prisma flow as the project default.

Required scripts in `auth-service/package.json`:

```json
"prisma:dev": "npx prisma migrate dev && npx prisma generate",
"prisma:create--create-only": "npx prisma migrate dev --create-only",
"prisma:generate": "npx prisma generate",
"prisma:status": "npx prisma migrate status",
"prisma:check": "npm run prisma:generate && npm run prisma:status",
"prisma:deploy": "npx prisma migrate deploy",
"prisma:reset": "npx prisma migrate reset",
"prisma:push": "npx prisma db push",
"prisma:studio": "npx prisma studio"
```

Environment rules:

- Local development: use `prisma:create--create-only` for reviewable SQL, then apply with `prisma:dev`.
- CI/staging/production-like: run `prisma:check`, then deploy only with `prisma:deploy`.
- Production: never run `prisma migrate dev`; use `prisma:deploy` only.
- `prisma:push` is for local prototyping only, not for release flow.

Pipeline rules:

- Schema change PRs must include generated migration files.
- Fail pipeline when `prisma:check` fails.
- GitHub Actions gate file: `.github/workflows/auth-service-prisma-gate.yml`.
- CI must provide `AUTH_SERVICE_DATABASE_URL` secret for Prisma status checks.
- Do not replace migration flow with ad-hoc schema sync as default process.

## OpenAPI Export Rules

Use OpenAPI as the backend contract source of truth for frontend sync.

- Every active controller must declare `@ApiTags("<module-name>")` for stable grouped docs.
- Keep tag names stable and lowercase (`auth`, `rbac.roles`, `rbac.permissions`, `hotel-users`, `health`).
- Swagger setup must stay enabled in app bootstrap via `src/common/openapi/swagger.config.ts`.
- Export contract from `services/auth-service` using:
  - `npm run openapi:export`
- The canonical output location is:
  - `shared/api-contract/openapi/v1/openapi.json`
  - `shared/api-contract/openapi/v1/openapi.yaml`
- After export, run sync checks in `shared/api-contract`:
  - `npm run verify`
- Do not maintain duplicated SDK schema mirrors; frontend tools must read `shared/api-contract/openapi/v1/openapi.json` directly.
- Keep contract history updated in:
  - `shared/api-contract/docs/CONTRACT_CHANGES.md`
- Do not change tags, paths, or security schema silently; treat them as contract changes and log them.

## Testing Rules

After code changes, run the smallest reliable validation first.

Preferred final validation from `services/auth-service`:

```bash
npm run build
npm run test
npm run test:e2e
npm run lint
```

If a command is not run, report that it was not run. Never claim unexecuted validation passed.

## Progress Tracking Rule

Use `services/docs/PLANS.md` as the source of truth for project progress.

- During execution, mark the active plan item as `processing` directly in `PLANS.md`.
- After implementation and validation, mark the item as `complete` in `PLANS.md`.
- Keep tracking lightweight: update only the relevant milestone/task line, not a verbose session log.
- If validation is skipped or blocked, note that directly on the relevant plan item instead of creating a separate status file.
- Never claim an item is `complete` before the required validation for that scope has run or the validation gap is explicitly documented.

## Codex Output Rule

Every completion report must include:

1. Root cause
2. Files changed
3. Commands run
4. Test/build result
5. Risks or follow-up

Only report actions actually performed.
