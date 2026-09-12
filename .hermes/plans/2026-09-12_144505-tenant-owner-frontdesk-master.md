# Tenant owner / frontdesk boundary execution plan

**Goal:** TENANT_OWNER manages, observes, coordinates; HOTEL_FRONTDESK executes check-in/out, guest request handling, and checkout collection.

**Architecture:** Capability-first expand/enforce/contract. Same person may receive both roles but must switch active role; backend session-bound capability and hotel scope remain authoritative. No URL/role-code authorization.

## Waves
1. Contract/migration writer, sequential.
2. Four backend writers in separate Orca worktrees.
3. Three frontend writers in separate Orca worktrees after backend integration.
4. Two read-only reviewers. Findings return to owning lane only.
5. Host final affected tests/lint/build; no push/deploy.

## Capability target
- New: `hotel.rooms.status.manage`, `hotel.stays.check-in`, `hotel.stays.check-out`, `hotel.requests.coordinate`, `hotel.requests.execute`, `hotel.billing.checkout`.
- Owner: view/configure/staff/service/coordinate; no execution capabilities.
- Frontdesk: view + execution; no catalog/partner/tenant administration.
- Finance: billing checkout as existing product policy requires.

## Integration order
contract → property → requests → marketplace/scope → billing → owner FE → staff FE → navigation/deep-link FE → reviews → final gates.

## Stop policy
Any AGY `BLOCKED`, `ERROR`, quota/auth failure, scope expansion, or failed focused check stops that task. Preserve worktree. Ask user with selectable options. Hermes never silently implements or changes model/account.

## Completion evidence
- Owner direct backend and both BFF namespaces deny execution.
- Frontdesk assigned to hotel completes check-in/out.
- Query endpoints are mutation-free.
- Custom capabilities are not rejected by hard-coded role names.
- Existing dirty RBAC/UI work remains present.
