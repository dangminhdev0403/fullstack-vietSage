# Frontend Sync Validation Guide

Use this checklist for every frontend synchronization task to keep UI, route behavior, and API contract aligned.

## Scope

- Frontend app: `frontends/font-end-vietsage`
- Main route group: `src/app/(vietsage)`
- This guide applies to Stitch sync tasks and manual UI update tasks.

## Phase 1 - Pre-Sync Checks

- Confirm target screens and routes before editing.
- Confirm source references exist (Stitch screen, template, or approved design reference).
- Identify impacted files:
  - route page files under `src/app/(vietsage)/**/page.tsx`
  - shared UI components under `src/app/(vietsage)/_components/*`
  - mock data modules under `src/app/(vietsage)/_data/*`
- Verify if backend contract changes are needed; if yes, update `docs/API_SPEC.md` in the same task.

## Phase 2 - Implementation Checks

- Preserve existing route paths and navigation behavior.
- Reuse shared components before creating new ones.
- Keep business logic outside presentational components.
- Do not introduce unrelated refactors.
- Keep mobile-first behavior intact for all affected screens.

## Phase 3 - Validation Commands

Run from `frontends/font-end-vietsage`:

```bash
npm run lint
npm run build
```

If a command is skipped, explicitly report it and explain why.

## Phase 4 - Route QA Checklist

Validate all impacted routes in browser at mobile and desktop sizes:

- Guest
  - `/guest/welcome`
  - `/guest/services`
  - `/guest/request-detail`
  - `/guest/tracking`
- Staff
  - `/staff/dashboard`
  - `/staff/requests`
- Admin
  - `/admin/dashboard`

For each touched route, check:

- No layout break on small screens.
- Header/top bar and bottom nav behavior are correct.
- Key actions and links navigate correctly.
- Text content and status labels are readable and consistent.
- No console errors in normal interactions.

## Phase 5 - Contract Alignment Checks

When screen behavior depends on backend data:

- Compare UI field names with `docs/API_SPEC.md`.
- Confirm status/priority labels map to documented enum values.
- Confirm list views use documented pagination/filter semantics.
- If mismatch is found, update docs or add a temporary mapping note in the status report.

## Completion Evidence (Required)

A sync task is complete only when all items below exist:

1. Files changed in frontend codebase.
2. Validation command result (`lint`, and `build` when relevant).
3. Route QA result summary.
4. Status document updated:
   - `frontends/font-end-vietsage/docs/PROJECT_STATUS.md`
5. If contracts changed, corresponding root docs updated.

## Report Template

Use this structure in completion notes:

```md
Root cause:
- ...

Files changed:
- ...

Commands run:
- npm run lint -> ...
- npm run build -> ...

Route QA:
- /guest/welcome -> ...
- ...

Risks/Follow-up:
- ...
```
