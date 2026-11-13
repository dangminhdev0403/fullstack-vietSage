# STRICT AUDIT MODE (SYSTEM DESIGN COMPLIANCE AUDIT)

## Activation and scope

Use for an audit/review deliverable or an explicit trigger such as `siêu rà soát`, `rà soát khó tính`, `soát code`, `strict audit focus`, or `ACTIVATE STRICT AUDIT MODE ON`. Apply Ponytail ultra: challenge unnecessary complexity and seek the smallest complete root-cause correction.

Audit-only is read-only: inspect and run necessary non-destructive checks; do not change application source/configuration/data, install tools, deploy or dispatch implementation workers. Scoped read-only reviewers are permitted unless the user prohibits delegation. Write report artifacts only when that artifact/destination is requested or authorized; do not create navigation packs, indexes or tracking files merely to conduct the audit.

Approval to fix automatically selects [CODE MODE](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md#code-mode) for the approved boundary through validation and completion, without another activation or restarted audit. Audit+fix uses the shared [continuous workflow](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md#continuous-audit-and-remediation) and [tracking reference](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/references/audit-remediation.md). Retain project evidence below; do not add whole-project, severity-group or phase approval barriers. Protected operations retain their separate gates.

## Standard and proportionate evidence

Audit the system actually implemented, beginning with the user goal and system invariants rather than preferred technologies. Resolve expected behavior from:

1. User acceptance criteria and protected constraints.
2. Current runtime, source, manifests, schemas, contracts, configuration and tests.
3. Canonical architecture/rules/ADRs and nearest-scope instructions.
4. Existing shared primitives and established local patterns.
5. Language/framework/platform idioms, then generic best practices.

Current source proves capability; architecture documents express intent. A material mismatch is a finding, not permission to silently replace either. Do not impose another project's technology choices or report personal style/equivalent alternatives as violations.

Scale the investigation and report to the scoped decision. A small diff review needs its affected flow, negative cases and source-to-effect evidence; it does not need a full-system map, empty matrix, separate ledger or universal checklist. Broader audits cover the applicable areas below, with explicit gaps. These are coverage obligations, not sequential phases.

### Scope, baseline and flow

Identify the requested repository/module/flow/diff, inspected baseline and dirty state, included/excluded boundaries, expected behavior/negative cases, protected actions and available evidence. Include relevant untracked files in a diff review; never stash, reset, stage or rewrite unrelated work.

Map only the affected actors/entry points, ownership, dependencies/trust boundaries, contracts/events/stores, critical transitions/failures and relevant runtime boundary. Follow [scoped navigation](../AGENTS.md#scoped-source-navigation); expand only to close a stated evidence gap.

State applicable observable invariants: authorization, tenancy/ownership, business state, money/precision, idempotency, consistency, compatibility, privacy, failure handling, accessibility and operational readiness. Trace producer, transport, consumer, persistence and verification where the invariant crosses them.

### Applicable coverage

| Area | Required questions |
|---|---|
| Requirements | Does behavior satisfy the stated goal and important negative cases? |
| Architecture and boundaries | Are ownership, dependency direction and public interfaces respected? |
| End-to-end flow | Do actors, entry points, services, contracts, data, clients and failure paths agree? |
| Data and state | Are transactions, concurrency, ordering, idempotency, lifecycle, migration and recovery correct? |
| Trust and safety | Are validation, authn/authz, tenant/resource isolation, secrets/PII, abuse controls and auditability correct? |
| Reliability | Are timeouts, retries, partial failures, restart behavior, fallbacks and data-loss prevention explicit? |
| Operability | Are configuration, deployment, compatibility, observability, diagnostics, rollback and support paths adequate? |
| Performance | Are bottlenecks, fan-out, unbounded work and scaling/resource ceilings acceptable for the real workload? Apply [database-first and end-to-end optimization](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md#database-first-and-end-to-end-optimization) to relevant data-heavy scopes, including queues, date/overdue rules, counts and multi-source lists. Trace source of truth, DB queries, backend orchestration and frontend consumption; correct the root bottleneck without shifting costs or breaking consistency. Runtime improvement claims need comparable scoped before/after evidence; missing DB/runtime proof remains GAP. |
| User boundary | Where UI applies, check accessibility, responsive/loading/empty/error states, locale/i18n and decision-relevant copy under the [project UI rules and quality routing](../AGENTS.md#mandatory-uiux-quality-routing). Preserve the 12px font floor, no technical/dev leakage and required UI gate `node scripts/verify-ui-rules.cjs`. |
| Maintainability | Challenge unnecessary complexity; prefer deletion/reuse over new abstractions. Check duplicated behavior and duplicate/orphan i18n keys. |
| Technology fit | Follow this project's actual stack, installed dependencies, platform primitives and local conventions. |

Technology fit comes last; an approved library does not excuse a broken invariant. Never substitute broad scans, scanner output or agent consensus for system evidence.

### Finding verification

A `VIOLATION` needs an explicit invariant/repository-backed expectation, exact source/runtime evidence, a concrete effect or credible failure path, the minimum correction and a verification method. Record pre-change evidence before an authorized fix.

Use `GAP` for missing evidence/coverage and `COMPLIANT` only with positive proof. Run only sufficient project-defined, non-destructive checks under [project validation policy](zero-waste-validation.md). Typecheck/build alone does not prove business behavior, authorization, async/runtime integration or DB performance.

## Coordination and findings

Apply the shared mandatory [parallel execution contract](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md#parallel-execution-contract) from the initial scoped map. Assign cohesive flows/invariants, not files or severity teams; preserve read-only audit authorization. The host verifies returned evidence, deduplicates root causes and integrates the result. Optimization owners share whole-flow correctness/performance acceptance criteria.

Give findings stable IDs when tracking several causes. Each finding records classification (`VIOLATION | GAP | COMPLIANT`), impact (`Blocking | Non-blocking`), confidence, exact location, invariant, evidence, effect, minimum correction and verification. Include applied changes/checks when authorized; use compact prose for a simple review rather than repeating an empty form. Impact determines order; confidence describes evidence quality.

## Final report and closure

For an audit-only deliverable, begin `STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).` and give `Verdict: PASS | FAIL | PARTIAL | BLOCKED`, verified findings and real evidence gaps. Add only the detail needed to support the scoped conclusion.

A broad audit also includes scope/baseline and compact flow map, applicable coverage matrix, deduplicated findings ordered by dependency/impact, exact checks/outcomes and unique test counts, actual delegated outcomes/results or concrete solo limitation, and remaining protected actions. Keep this in one authorized report artifact when requested; otherwise report in chat.

For audit+fix, use one shared register when the queue warrants it, retain before/after evidence there and provide concise changed-behavior/check/gap reporting. Ordinary implementation workers need no audit activation marker, separate ledger or system-wide report. Follow runtime-required progress and runner lifecycle messages without copying their mechanics into briefs.

The audit is complete when applicable scoped invariants have evidence or declared gaps and findings are verified/deduplicated; code changes are not required. Remediation completes only after approved findings are verified or disproven. Unmet prerequisites mean PARTIAL/BLOCKED, never an unqualified PASS. Reuse valid evidence and existing tracking; do not start a new audit or phase after completion.
