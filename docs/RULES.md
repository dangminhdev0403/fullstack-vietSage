# VietSage Documentation Rules

This file is the single place for documentation governance across frontend, backend, shared contracts, and root cross-system docs.

## Scope

Applies to markdown files under:

- `docs/`
- `services/docs/`
- `frontends/front-end-vietsage/docs/`
- `shared/api-contract/docs/`

## Canonical Documentation Locations

| Scope | Location | Examples |
| --- | --- | --- |
| Cross-system docs | `docs/` | `ARCHITECTURE.md`, `RULES.md`, `SERVICE_BOUNDARY.md`, `EVENT_FLOW.md`, `RBAC_ARCHITECTURE.md`, `DEPLOYMENT.md`, `SECRETS.md` |
| Backend docs | `services/docs/` | `ARCHITECTURE.md`, `RULES.md`, `PLANS.md`, `MODULE_GUIDE.md`, `CONTRACT_GUIDE.md`, `EXTENSION_GUIDE.md` |
| Frontend docs | `frontends/front-end-vietsage/docs/` | `ARCHITECTURE.md`, `RULES.md`, `PLANS.md`, `MODULE_GUIDE.md`, `CONTRACT_GUIDE.md`, `RUNTIME_UI_GUIDE.md`, `DESIGN.md` |
| Shared API contract docs | `shared/api-contract/docs/` | `API_CATALOG.md`, `CONTRACT_CHANGES.md` |

README files may remain at package/folder roots only when they are entry points for that package or directory. Detailed architecture, plans, rules, runbooks, and guides should live in the matching `docs/` folder.

## Global Execution Rule: Delegation-Aware Approval

This repository uses a two-layer approval model: direct user-facing planning remains guarded, while delegated specialist/Codex workers may execute inside an already-approved scope.

### Direct user-facing sessions

When the assistant is speaking directly with the user and no prior approval has been granted for the current scope, stay read-only until explicit approval.

Do not edit, create, delete, move, rename, format, refactor, overwrite, install, migrate, auto-fix, update docs, update git state, or modify any file before approval.

Allowed before approval only:

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

For direct user-facing sessions, approval may be an exact command such as:

- EXECUTE MODE
- APPLY PLAN
- CHO PHÉP SỬA
- TIẾN HÀNH SỬA

or an unambiguous user approval message that explicitly accepts execution for the proposed scope.

### Delegated specialist / Codex worker sessions

When a specialist/đệ, Kanban worker, or Codex process is launched by Hermes after the user has already approved the task, do not stop to request `PLAN MODE`, `EXECUTE MODE`, `CHO PHÉP SỬA`, or another confirmation from the user again.

Treat the delegation prompt as approved execution context when it states that user/Hermes has approved the scoped task. Execute only that scoped task.

The delegated worker must still:

- preserve unrelated dirty worktree changes;
- keep changes limited to the approved scope;
- avoid destructive database, Prisma reset, Docker cleanup, deployment, credential, or git-history operations unless those are explicitly approved in the delegated prompt;
- inspect the resulting diff;
- run the smallest reliable validation command;
- report files inspected, files changed, validation results, docs updated, and remaining risks/blockers.

If a delegated Codex process still pauses at an approval guard, restart it with the approval context at the top of the prompt instead of waiting for an interactive approval inside the process.

PLAN MODE output format for direct planning-only sessions:

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

## Source of Truth Rules

- Do not duplicate the same normative rule in multiple files.
- If rules conflict, prioritize in this order:
  1. `docs/RULES.md`
  2. nearest scope-specific `RULES.md`
  3. nearest scope-specific `ARCHITECTURE.md`
  4. task-specific guide in the same `docs/` folder
  5. `PLANS.md` or historical notes
- Keep API contract and runtime behavior aligned; update docs when behavior changes.

## Mandatory Update Rules

After every completed implementation:

- Update the corresponding `PLANS.md` only when the task affects tracked milestones/progress.
- If endpoint behavior changes, update the relevant contract/API doc in the same task.
- If ownership or module boundary changes, update the relevant `ARCHITECTURE.md` or guide.
- If lifecycle/transaction/event behavior changes, update `docs/EVENT_FLOW.md` or the relevant backend guide.
- Do not mark work complete when required docs are stale.

## Writing Standard

- Keep headings and naming consistent across docs.
- Use concrete paths and commands that exist in the repository.
- Prefer concise, testable statements over generic guidance.
- Explicitly mark unknown items as `TBD` instead of guessing.
- Keep core architecture files short; move details to topic-specific guide files in the same `docs/` folder.

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
