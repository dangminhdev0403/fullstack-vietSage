# STRICT AUDIT MODE (SYSTEM DESIGN COMPLIANCE AUDIT)

## Activation

Activate when the user requests an audit/review or says:

- `ACTIVATE STRICT AUDIT MODE ON`
- `BẬT CHẾ ĐỘ RÀ SOÁT KHÓ TÍNH`
- `RÀ SOÁT SIÊU KHÓ TÍNH`
- `SOAT CODE`

Deactivate only on:

- `TURN OFF STRICT AUDIT MODE`
- `TẮT CHẾ ĐỘ RÀ SOÁT KHÓ TÍNH`

A review request is read-only by default. Non-destructive inspection and verification are allowed. Do not edit, autofix, install dependencies, mutate data, commit, deploy, or create remediation tasks unless the user explicitly requests implementation/fixes. Strict mode increases evidence quality; it does not expand authorization.

### Mandatory agent auto-activation

Any delegated agent assigned audit, review, verification, architecture assessment, code review, QA review, or security review MUST activate this mode from task intent. This is mandatory, not subjective.

Every review card/prompt MUST include:

```text
STRICT_AUDIT_MODE: true
AUDIT_SCOPE: <exact paths, symbols, flows, or boundary>
AUDIT_INVARIANTS: <repository-backed behavior to verify>
WRITE_POLICY: read-only | remediation-authorized
```

The reviewer starts its first substantive response/handoff with `STRICT AUDIT MODE: ACTIVE.` and continues the review in the same turn. Missing marker: self-activate, report orchestration drift, never downgrade to an informal review. Descendant review cards inherit the marker and exact boundary. Unrelated implementation cards do not. Combined review-and-fix tasks audit first; fixes run only under explicit remediation authorization and existing protected gates.

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
| User boundary | When applicable: accessibility, error/loading/empty states, locale/i18n hygiene, responsive behavior, safe feedback, and clean professional copywriting (zero technical/dev leakage, no wireframe numbering, no raw enums/HTTP errors, no test strings). |
| Maintainability | Is complexity necessary? Are shared primitives reused? Does duplication create inconsistent behavior or duplicate/orphan i18n keys? |
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

## Finding Format

```text
ID:
Classification: VIOLATION | GAP
Impact: Blocking | Non-blocking
Confidence: High | Medium | Low
Location: file:line, symbol, endpoint, schema, or runtime boundary
Invariant / expected design:
Evidence:
System effect / failure path:
Minimum correction:
Verification:
```

Do not emit severity labels disconnected from a violated invariant. `Impact` controls remediation order; `Confidence` states evidence quality.

## Final Report

Report:

1. `Verdict: PASS | FAIL | PARTIAL | BLOCKED`.
2. Scope, baseline, and compact system map.
3. Coverage matrix: `COMPLIANT | VIOLATION | GAP | N/A`, each with evidence.
4. Deduplicated findings ordered by dependency and user impact.
5. Commands/tools run with real outcomes.
6. Agents used/skipped, exact lane ownership, and disagreements resolved.
7. Untested surfaces, blockers, and protected next actions.

## Closure

The **audit** is complete when the scoped system map and invariants are explicit, every applicable matrix area has evidence or a declared gap, findings are verified/deduplicated, and skipped checks are named. Audit completion does not require code changes.

**Remediation** is separate: confirmed violations fixed at the root cause, invalidated checks rerun, integrated behavior verified, and remaining gaps stated. Never claim audit or remediation success from 100% line coverage, a scanner-only result, or one generic build command.
