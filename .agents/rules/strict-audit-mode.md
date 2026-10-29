# STRICT AUDIT MODE (SYSTEM DESIGN COMPLIANCE AUDIT)

## Activation and scope

Use this mode for an audit/review deliverable or an explicit audit trigger such as `siêu rà soát`, `rà soát khó tính`, `soát code`, `strict audit focus`, or `ACTIVATE STRICT AUDIT MODE ON`.

Audit is read-only by default: inspect and run necessary non-destructive checks; do not edit, install, mutate data, deploy or dispatch implementation workers without authorization. Strictness improves evidence quality, not permissions.

An explicit instruction to fix audited findings authorizes scoped implementation and validation. Code Focus, Focused Execution and remediation are implementation styles; they do not activate this audit workflow, require an activation turn, or require an audit ledger. Reuse the existing findings instead of auditing again. For implementation follow the global [focused-execution](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md) profile and [Efficient Execution and Validation](zero-waste-validation.md).

## Reporting and delegation

- Apply Ponytail ultra to audit reasoning: challenge unnecessary complexity and recommend the smallest root-cause correction.
- Consolidate verified findings into one final audit report, starting with `STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).`. Avoid play-by-play; retain any progress updates and lifecycle messages required by the runtime.
- Delegated audit reviewers inherit the exact review boundary, invariants and read-only policy. Their task brief needs those task-specific facts, not a copy of this ruleset.
- Ordinary implementation workers and their focused tests remain implementation. They report changed behavior, checks and remaining gaps without audit markers, a separate evidence ledger or a settlement essay.
- The host owns the shared map, evidence consolidation and final report. Use the fewest disjoint reviewers only when delegation is authorized. Keep Orca's actual Task/Dispatch lifecycle intact and do not repeat its preamble in task briefs.

## Core Standard

Audit the system the repository actually implements. The audit is **design-first and stack-agnostic**. Technology compliance is one final dimension, not the audit's organizing principle.

Resolve the expected standard in this order:

1. User goal, acceptance criteria, and protected constraints.
2. Current runtime behavior, manifests, schemas, contracts, configuration, and tests.
3. Canonical architecture/rules/ADRs and nearest-scope instructions.
4. Existing shared project primitives and established local patterns.
5. Language/framework/platform idioms.
6. Generic best practices.

Current source is capability truth. Canonical architecture docs are intent truth. A material mismatch is a finding; neither silently overrides the other. Never impose VietSage-specific libraries, folders, commands, or any other project's technology choices on an unrelated project.

Strictness means:

- no finding without a violated invariant or repository-backed standard;
- no `COMPLIANT` claim without positive evidence;
- no scanner/agent opinion treated as proof;
- no personal style, speculative rewrite, or equivalent technology choice reported as a violation;
- no broad file scan substituted for end-to-end system coverage.

## Required Workflow

### 1. Freeze the audit boundary

Record:

- requested repository/module/flow/diff;
- baseline and dirty/untracked state;
- included and excluded paths;
- expected behavior and negative cases;
- protected actions;
- available runtime and test evidence.

For diff review, include tracked changes and relevant untracked files. Never stash, reset, stage, or rewrite unrelated work.

### 2. Build the minimum system map

Map only the scoped flow:

- actors and entry points;
- components/modules and ownership;
- dependency direction and trust boundaries;
- API/contracts/events/data stores/external systems;
- critical state transitions and failure paths;
- deployment/runtime boundary when relevant.

Use Graphify/Repomix under repository policy when available. Start from target symbols or flows; expand one dependency hop at a time. Widen only when the map has a stated evidence gap.

### 3. Define invariants

State the observable rules the system must preserve: authorization, tenancy/ownership, business state, money/precision, idempotency, consistency, compatibility, privacy, failure handling, accessibility, and operational readiness as applicable.

Trace each invariant through producer, transport, consumer, persistence, and verification where relevant.

### 4. Audit in design-first order

| Area | Required questions |
|---|---|
| Requirements | Does behavior satisfy the stated goal and negative cases? |
| Architecture and boundaries | Is ownership clear? Are dependency directions and public interfaces respected? |
| End-to-end flow | Do actors, entry points, services, contracts, data, UI/clients, and failure paths agree? |
| Data and state | Are invariants, transactions, concurrency, ordering, idempotency, lifecycle, migration, and recovery correct? |
| Trust and safety | Are validation, authn/authz, tenant/resource isolation, secrets/PII, abuse controls, and auditability correct? |
| Reliability | Are timeouts, retries, partial failure, restart behavior, fallbacks, and data-loss prevention explicit? |
| Operability | Are configuration, deployment, compatibility, observability, diagnostics, rollback, and support paths adequate? |
| Performance | Are bottlenecks, fan-out, unbounded work, scaling assumptions, and resource ceilings acceptable for the real workload? |
| User boundary | When applicable: accessibility, error/loading/empty states, locale/i18n hygiene, responsive behavior, safe feedback, clean professional copywriting (zero technical/dev leakage, no wireframe numbering, no raw enums/HTTP errors, no test strings), **UI Design Gate compliance**: typography floor >= 12px (strictly no sub-12px micro-fonts), zero fluff/boilerplate sentences, ruthless UI pruning (no nested cards, no duplicate actions, no banner/blur bloat), verified via `node scripts/verify-ui-rules.cjs`. |
| Maintainability | **Ponytail Max (`ultra`) compliance**: Is complexity necessary, or can code/abstractions be deleted outright (deletion before addition)? Are shared primitives reused? Does duplication create inconsistent behavior or duplicate/orphan i18n keys? |
| Technology fit | Does implementation follow the current project's actual stack, installed dependencies, platform primitives, and local conventions? |

Technology fit comes last. A preferred library does not excuse a broken system invariant. A raw platform primitive is not automatically wrong when the repository permits it or the abstraction cannot satisfy the requirement.

### 5. Verify every finding

A `VIOLATION` requires:

1. an explicit invariant or repository-backed expected design;
2. exact source/runtime evidence;
3. a concrete system effect or credible failure path;
4. the minimum correction direction;
5. a verification method.

Use `GAP` when evidence or test coverage is missing. Use `COMPLIANT` only with positive evidence. Run only project-defined, non-destructive checks needed for the scoped claims. Discover commands from manifests/docs; never hardcode one language's gates. Typecheck/build alone does not prove business behavior, authorization, async behavior, or runtime integration.

## Agent Coordination

When agents are requested or orchestration is available:

1. One host orchestrator owns scope, system map, invariant ledger, shared assumptions, evidence rules, and final deduplication.
2. Use the fewest useful reviewers. A small local diff may need one specialist. A cross-layer/module/repository audit normally uses 2–4 disjoint read-only lanes.
3. Split by system boundary or invariant, not merely by language: architecture/dependencies; contracts/data/state; trust/security/reliability; runtime/UX/QA.
4. Every lane receives exact paths/flows, invariants, allowed non-destructive commands, forbidden actions, and the finding schema below.
5. Do not launch duplicate general reviewers or all available agents by default.
6. The host verifies every candidate finding against current source/runtime. Agent consensus is not evidence.
7. Use one independent tester/reviewer at the frozen combined boundary only when explicit or justified by high-risk/shared-contract scope.
8. Review cards remain read-only. Create remediation cards only after the user explicitly requests fixes; writers then get disjoint ownership and focused checks.
9. If agents are unavailable, the host performs the same matrix directly and reports that orchestration was skipped.

## Finding & Remediation Verification Format

```text
ID:
Classification: VIOLATION | GAP | COMPLIANT
Impact: Blocking | Non-blocking
Confidence: High | Medium | Low
Location: file:line, symbol, endpoint, schema, or runtime boundary
Invariant / expected design:
Evidence (or Applied Root-Cause Fix + Diff):
System effect / failure path:
Minimum correction:
Verification (exact command, exit code, unique test count, or runtime proof):
```

Do not emit severity labels disconnected from a violated invariant. Impact controls remediation order; Confidence states evidence quality. Keep missing runtime evidence explicit.

## Final Report

For an audit deliverable, emit one consolidated final report starting with `STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).`:

1. `Verdict: PASS | FAIL | PARTIAL | BLOCKED`.
2. Scope, baseline, and compact system map.
3. Coverage & Verification Matrix: `COMPLIANT | VIOLATION | GAP | N/A`, each backed by concrete source/test/runtime evidence.
4. Deduplicated findings ledger (`VIOLATION | GAP | COMPLIANT`) ordered by dependency and user impact.
5. Commands/tools run with real outcomes (exact command, exit code, unique test count).
6. Agents/`orca-cli` tabs used or skipped, exact lane ownership, and disagreements resolved.
7. Untested surfaces, blockers, and protected next actions.

## Closure

The **audit** is complete when the scoped system map and invariants are explicit, every applicable matrix area has evidence or a declared gap, findings are verified/deduplicated, and skipped checks are named. Audit completion does not require code changes.

**Remediation / Focused Execution** uses the shared focused-execution profile and project validation policy: fix confirmed causes, validate affected behavior, and report changes, checks and remaining gaps concisely. Do not require another audit report or matrix unless the user requested one. Never claim success from line coverage, a scanner-only result or one generic build command.
