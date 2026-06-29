# VietSage Documentation Rules

This file is the single place for documentation governance across frontend and backend.

## Scope

- Applies to all markdown files under `docs/`, `services/docs/`, and `frontends/font-end-vietsage/docs/`.
- Use root `docs/` for cross-system documents (architecture, API contract, service boundary, event flow, validation).
- Use service or frontend local docs only for implementation progress and local workflow details.

## Global Execution Rule: STRICT PLAN MODE

STRICT PLAN MODE.

Read-only until explicit approval.

Do not edit, create, delete, move, rename, format, refactor, overwrite, install, migrate, auto-fix, update docs, update git state, or modify any file.

Allowed only:

- read
- search
- inspect
- analyze
- ask targeted clarification
- produce implementation plan

Collaborate with the user before editing:

1. inspect code
2. explain findings
3. identify root cause
4. list impacted files
5. propose safest plan
6. state risks/trade-offs
7. wait for explicit approval

Do not switch to editing unless the user writes exactly one of:

- EXECUTE MODE
- APPLY PLAN
- CHO PHÉP SỬA
- TIẾN HÀNH SỬA

Words like "ok", "tiếp", "làm đi", "được" are not enough.

PLAN MODE output format:

- Files inspected
- Current issue
- Root cause
- Proposed plan
- Files that would be changed later
- What will not be changed
- Risks/trade-offs
- Verification steps
- Rollback strategy
- Approval required

Final line must be:

`Plan complete. No files modified. Send EXECUTE MODE or CHO PHÉP SỬA to apply changes.`

Post-plan confirmation is mandatory:

- After the PLAN MODE output, the assistant must ask exactly: `Cho phép sửa?`
- `Cho phép sửa?` is a confirmation question only and does not grant edit permission by itself.
- Editing is still allowed only when the user then sends one exact approval command from the approved list.

## Source of Truth Rules

- Do not duplicate the same normative rule in multiple files.
- If rules conflict, prioritize in this order:
  1. `docs/RULES.md`
  2. `docs/API_SPEC.md`
  3. `docs/SERVICE_BOUNDARY.md`
  4. `docs/EVENT_FLOW.md`
  5. local progress files (`services/docs/STATUS.md`, `frontends/font-end-vietsage/docs/PROJECT_STATUS.md`)
- Keep API contract and runtime behavior aligned; update docs when code behavior changes.

## Mandatory Update Rules

After every completed implementation:

- Update the corresponding status doc with date, changed files, validation commands, and risks.
- If endpoint behavior changes, update `docs/API_SPEC.md` in the same task.
- If ownership or module boundary changes, update `docs/SERVICE_BOUNDARY.md`.
- If lifecycle/transaction/event behavior changes, update `docs/EVENT_FLOW.md`.
- If architecture direction changes, update `docs/ARCHITECTURE.md`.

Do not mark work complete when required docs are stale.

## Writing Standard

- Keep headings and naming consistent across docs.
- Use concrete paths and commands that exist in the repository.
- Prefer concise, testable statements over generic guidance.
- Explicitly mark unknown items as `TBD` instead of guessing.

## Validation Reference

- Frontend synchronization and validation flow is defined in `docs/FRONTEND_SYNC_VALIDATION.md`.
- Any UI sync task should follow that checklist before completion.

## Review Checklist

Before finalizing a task, verify:

1. Changed behavior is documented in the correct file.
2. File paths and command examples are valid.
3. Error shape examples match current backend behavior.
4. Status documents include real commands and real outcomes.
5. No broken references to missing markdown files.

## Non-Goals

- Do not introduce a separate `docs/CONTRIBUTING_DOCS.md`.
- Do not keep parallel duplicated rule files for the same scope.
- Do not claim validation commands passed unless they were actually run.
