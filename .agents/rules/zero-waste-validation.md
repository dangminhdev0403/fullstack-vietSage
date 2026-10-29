# Efficient Execution and Validation

Mandatory for Codex, Antigravity and every runner in this repository. Optimize elapsed time by removing duplicate work. Preserve scope, protected approvals and evidence for correctness.

## 1. Decide the work once

- Default to one agent. A local correction or Markdown/rules task needs no worker, new plan file, broad audit or graph refresh.
- For an implementation task, identify the requested behavior, allowed files/owners, important negative cases, contract impact and smallest verification set before editing. Keep this in a short internal checklist or the existing plan; do not create extra tracking documents.
- Reuse an existing audit's verified findings and source map for authorized remediation. Refresh only changed evidence; do not audit the entire project again. A check inside implementation does not reactivate a separate strict audit workflow.
- Local tasks normally touch 1-3 files. Cross-file root-cause fixes may include necessary callers, focused tests and contract artifacts within the authorized outcome; name that bounded set before editing. The file count alone does not require another approval. Explicit user file limits and UI/data/ops boundaries still apply. New independent issues remain report-only.

## 2. Read and navigate only what changes the decision

- Reuse loaded rules and source excerpts. Read relevant ranges once; reread only an edited/concurrently changed range, a specific error location, or a missing caller needed to validate the fix. Record the reason briefly in the tool intent. No repeated whole-file or whole-rule dumps.
- For code discovery, use the existing Graphify map and one scoped Repomix pack. Add only newly required files. After at most two unsuccessful targeted navigation attempts, name the exact graph/pack gap and use a bounded source search; do not rebuild indexes or repeat the same query. Never bypass Repomix's security exclusions.
- Exact-path documentation/rules edits and exact user command execution need no symbol graph or Repomix pack. Do not read application source for these tasks.
- Batch independent reads/checks, inspect each result, and cap output to relevant excerpts, summaries and errors. Do not print complete generated contracts, manifests, environment variables or process command lines.

## 3. Make each implementation handoff complete

- Delegation requires the user's request or an applicable explicit instruction. Tool availability alone is not authorization. If the user requests Orca/Antigravity, use its existing terminal/context before launching another.
- Assign one writer per file. The host may work on independent files; it must not edit a worker-owned file until that worker has acknowledged stopping writes there. Never discard existing dirty work to obtain a clean baseline.
- Give the worker the exact outcome, ownership, invariants, negative cases, existing primitives, contract obligations and allowed checks in one initial message. For authorization: allowed/denied/mixed-resource cases. For money: date boundaries, sparse/missing prices and transaction failure. Include only applicable cases.
- Determine API impact before coding. The same owner completes runtime validation, affected callers, Swagger/OpenAPI, generated types and required changelog together. Freeze schemas before exporting and generating once; regenerate only if a later semantic change invalidates them.
- Require one handoff with files changed, behavior, exact commands/exit results, unique test counts and remaining gaps. The host reviews the resulting diff and missing evidence; it reuses completed valid checks.
- Consolidate review feedback into one batch. After two unsuccessful correction rounds for the same acceptance criterion, take back only that scope after the worker stops writing, then finish it directly. Do not restart another general review or ask the user to reauthorize the same fix.

## 4. Detect stalls and keep making progress

- Prefer completion notifications or bounded waits. Do not repeatedly poll unchanged terminal output; use 30-60 second waits while working on independent scope. An accepted prompt is not a completed task.
- Five minutes without a new diff, check result or concrete blocker triggers one diagnosis of the active stage. Ten minutes without measurable progress requires changing the approach, narrowing the worker task or taking ownership after writes stop. These are stall checkpoints, not a deadline to abandon correct implementation.
- A failed command gets a diagnosis from its actual stderr and installed project configuration. Do not repeat an unchanged failing command, guess dependency exports, install tools or expand into unrelated layers.
- **100% Silent Execution (Zero Pre-Tool & Mid-Turn Commentary)**: Do NOT emit pre-tool announcements (e.g., *"Tôi sẽ sửa các lỗi..."*, *"Tôi sẽ dùng skill orca-cli..."*), progress updates, or intermediate tool-call commentary in Codex or Antigravity. Keep all planning, worker coordination, and step transitions strictly inside internal reasoning (`<thought>`) and tool payloads. Emit **only ONE consolidated Final Report** after all inspections, edits, subagent/`orca-cli` fan-in, and verification gates finish.
- **Verified Evidence Output (`VIOLATION | GAP | COMPLIANT`)**: For any audit, review, or post-audit remediation / focused execution (`Tập trung thực thi`), the single Final Report MUST begin with `STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).` and report a verified evidence matrix classifying every item as `VIOLATION | GAP | COMPLIANT` with exact `file:line`, diff summary, and executed command exit results.

## 5. Select checks by the changed behavior

| Scope | Required validation | Do not run by default |
|---|---|---|
| Markdown/rules only | Review the diff of changed documents and referenced local paths | Tests, lint, build, typecheck, UI gate, Graphify/Repomix |
| Pure UI/CSS/Tailwind/layout/copy/presentation | Root UI gate: node scripts/verify-ui-rules.cjs | Test suites, full lint/build, typecheck for styling/text only |
| New UI TypeScript imports/props/types | UI gate plus relevant typecheck when needed | UI test suites or production build for presentation-only work |
| Backend behavior/authorization/money | Smallest existing regression test set covering changed behavior and meaningful negative cases; relevant typecheck when types/imports/contracts change | Full repository suite, blanket lint/build |
| API runtime/schema/generated types | Focused behavior checks, one export/type generation after schema freeze, contract gate and affected consumer typecheck | Re-exporting unchanged schemas; full UI/backend suites |
| Prisma schema file | Existing scoped Prisma validation command | Applying migrations, reset, seed or backfill without separate approval |
| Nginx/deployment config | Relevant existing static configuration gate | Live reload/deploy/provider calls without authorization |
| DB/data/VPS/Docker operations | Requested environment command and its focused result check | Application source edits, app suites/build, extra data operations |

- Pure presentation changes must not run test suites or full lint/build. Typecheck is allowed only when new imports/props/types justify it. Never format the entire repository for a scoped task.
- Discover exact commands from existing manifests/configuration. Execute at the repository root using root scripts or pnpm -C; do not cd into subdirectories. Retain project package/install and protected-action gates.
- Run focused regressions during the fix, then remaining applicable integration gates once after the affected files freeze. Batch independent gates where resource usage permits.
- Maintain a small evidence record: command, scoped files/revision, exit result and tests checked. A passing result remains valid until a relevant implementation/input/configuration changes. The host must not rerun a worker's passing command just to claim ownership.
- After a failure or later edit, rerun only checks affected by that change. A documentation-only change does not invalidate tests; a type-only metadata fix needs the affected typecheck, not all business suites again.
- Do not add tests for Markdown, cosmetic changes or checks that merely mirror implementation. Add a focused regression only when needed to establish changed behavior. Never trade away authorization, money, transaction or compatibility evidence to meet a time target.
- Count unique tests from the final scoped run or deduplicated suites; never add overlapping command totals. Distinguish static/unit evidence from browser/database/provider runtime evidence.

## 6. Finish when the outcome is verified

The task is complete when the requested behavior, necessary callers/contracts and applicable gates are satisfied, and real remaining gaps are stated. Update the existing plan/comment once if one is in use, then send a concise completion. Do not start another audit, polish unrelated code, broaden tests, refresh graphs, or write extra reports after that point.

If a required check cannot run, state its exact blocker and complete independent authorized work. Never mark unrun checks passed or claim runtime coverage from static checks.
