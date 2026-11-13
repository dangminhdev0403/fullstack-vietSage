# Efficient Execution and Validation

Mandatory for every runner in this repository. This file owns project check selection; the shared [focused-execution profile](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md) owns mode activation, briefs, dispatch, stall handling and completion. Runtime-required progress, approval and runner lifecycle messages take precedence over a quiet-output preference.

## Scope and execution

- Follow [CODE MODE](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md#code-mode) and its mandatory [parallel execution contract](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md#parallel-execution-contract) for authorized implementation; audit-only reviewers remain read-only. Reuse verified findings/maps instead of starting a fresh audit. Documentation format and stable shared read-only dependencies are not solo exemptions.
- Apply [database-first and end-to-end optimization](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md#database-first-and-end-to-end-optimization) to relevant data-heavy work, preserving whole-flow correctness; cosmetic changes need no database discovery.
- Freeze the requested outcome, ownership/write fences, important negative cases, contract impact and necessary checks internally. No arbitrary file quota or new plan for a local correction. Complete necessary callers/contracts within authorization; preserve unrelated dirty work, explicit file limits, TEST MODE locks and protected-action gates.
- Use shared [audit/remediation tracking](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/references/audit-remediation.md) for substantial authorized queues. A simple review/fix needs no new ledger, duplicated plan or phase approvals.

## Read and coordinate once

- Follow [scoped source navigation](../AGENTS.md#scoped-source-navigation). Reuse loaded instructions/current evidence, batch independent reads and return only decision-relevant ranges or errors. Do not dump complete generated contracts, manifests, environment variables or process command lines.
- Worker ownership, briefs, real result receipts, takeover and progress handling follow the shared parallel contract; use an existing suitable runner/context when requested. The host reviews returned changes and missing evidence without repeating the worker's investigation.
- Determine API impact before edits. One owner completes runtime validation, affected callers, Swagger/OpenAPI, generated types and required contract changelog together. Freeze schemas before exporting/generating; regenerate only after a semantic change invalidates the artifacts.

## Select checks by the changed behavior

| Scope | Required validation | Do not run by default |
|---|---|---|
| Markdown/rules only | Review the changed-document diff and referenced local paths | Tests, lint, build, typecheck, UI gate, Graphify/Repomix |
| Pure UI/CSS/Tailwind/layout/copy/presentation | Root UI gate: `node scripts/verify-ui-rules.cjs` | Test suites, full lint/build, typecheck for styling/text only |
| New UI TypeScript imports/props/types | UI gate plus relevant typecheck when needed | UI test suites or production build for presentation-only work |
| Backend behavior/authorization/money | Smallest sufficient existing regressions covering behavior and meaningful negative cases; relevant typecheck when types/imports/contracts change | Full repository suite, blanket lint/build |
| Query/data-flow performance optimization | Focused correctness checks plus comparable scoped before/after runtime evidence under the shared [optimization policy](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/references/database-first.md); missing runtime/DB evidence remains GAP | Unapproved load/data/migration operations; treating mocks or typechecks as database performance proof |
| API runtime/schema/generated types | Focused behavior checks, export/type generation after schema freeze, contract gate and affected consumer typecheck | Re-exporting unchanged schemas; full UI/backend suites |
| Prisma schema file | Existing scoped Prisma validation command | Applying migrations, reset, seed or backfill without separate approval |
| Nginx/deployment config | Relevant existing static configuration gate | Live reload/deploy/provider calls without authorization |
| DB/data/VPS/Docker operations | Requested environment command and focused result check | Application source edits, app suites/build, extra data operations |
| Test authoring / UI browser testing (`TEST MODE`) | Follow the canonical [TEST MODE reference](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/references/test-mode.md): select code/browser verification from user intent; run already-authorized browser scope without asking again; preserve test-only or current test+fix boundaries | Unapproved browser/provider/data operations, superficial page-only checks, mid-sweep single-defect fixing, unbounded DOM/log output |

- Discover exact commands from installed manifests/configuration. Execute from the repository root through root scripts or `pnpm -C`; do not change directories or install tools to make a failed check pass.
- Run sufficient focused regressions and applicable shared gates as their inputs stabilize; no exact-one-check ceiling. Preserve denial, tenant isolation, money, transaction, concurrency and compatibility evidence where relevant.
- Record command, inspected files/revision, exit result and unique test count. Reuse a worker's valid results; rerun only checks invalidated by a relevant edit, input/configuration change or failure. Deduplicate overlapping test totals.
- Do not add tests for Markdown, cosmetic changes or assertions that merely mirror implementation. Reuse sufficient existing coverage; add focused regressions where changed behavior needs proof. Never format the whole repository for scoped work.
- Separate static/unit evidence from browser, database and provider evidence. A blocked or unrun check is not PASS; name the exact blocker while completing independent authorized work.

## Finish

Complete the approved outcome, necessary callers/contracts and applicable checks, then report changed behavior, actual results and remaining gaps. Update existing tracking once when used; do not add unrelated polish, a fresh audit, graph refresh or duplicate report after verification. Audit deliverables retain the [project evidence standard](strict-audit-mode.md).
