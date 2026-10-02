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
| Backend docs | `services/docs/` | `ARCHITECTURE.md`, `RULES.md`, `MODULE_GUIDE.md`, `CONTRACT_GUIDE.md`, `EXTENSION_GUIDE.md` |
| Frontend docs | `frontends/front-end-vietsage/docs/` | `ARCHITECTURE.md`, `RULES.md`, `MODULE_GUIDE.md`, `CONTRACT_GUIDE.md`, `RUNTIME_UI_GUIDE.md`, `DESIGN.md` |
| Shared API contract docs | `shared/api-contract/docs/` | `API_CATALOG.md`, `CONTRACT_CHANGES.md` |

README files may remain at package/folder roots only when they are entry points for that package or directory. Detailed architecture, rules, runbooks, and guides should live in the matching `docs/` folder; task plans live only in root `.hermes/plans/`.

## Source of Truth Rules

- Do not duplicate the same normative rule in multiple files.
- If project rules conflict, prioritize in this order:
  1. `docs/RULES.md`
  2. nearest scope-specific `RULES.md`
  3. nearest scope-specific `ARCHITECTURE.md`
  4. task-specific guide in the same `docs/` folder
  5. selected `.hermes/plans/<timestamp>-<slug>.md` when the task is complex
- Keep API contract and runtime behavior aligned; update docs when behavior changes.

## Plan lifecycle

- Root `.hermes/plans/` is the only task-plan and cross-session continuation source. Do not create legacy planning documents or nested plan directories elsewhere.
- Simple tasks need no plan. For complex work, create one English `.hermes/plans/<timestamp>-<slug>.md` before code and update that same file only at phase boundaries, blockers, decisions, or verification changes.
- Required frontmatter: `status: processing|blocked|success`, `current_phase`, `updated_at`, `next`, and `verification: pending|blocked|passed`.
- Split large work into phases marked `[pending]`, `[processing]`, `[blocked]`, or `[success]`; only one phase may be `[processing]`.
- Keep a compact `## Resume` with `Completed`, `Decisions`, `Changed files`, `Verification`, `Blocker`, and `Next action`.
- A new session reads only the frontmatter, `Resume`, and current phase before checking live source. `success` means do not re-execute; `processing` or `blocked` continues from `next` after minimal state verification.
- Completion requires every phase `[success]`, `status: success`, and `verification: passed`. Keep the successful plan as the compact completion marker; Git/PR history remains the detailed work log.
- Legacy plans without this frontmatter are archival and must not be resumed automatically.
- `.hermes/plans/` is workspace-local continuation state; do not rely on it after a fresh clone. Git/PR history and permanent docs remain shared history.
- `.hermes/tasks/` is temporary execution scratch; remove scoped task files when their parent plan succeeds.

## Mandatory Update Rules

After every completed implementation:

- Update the selected root `.hermes/plans` file only when the task is complex.
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
