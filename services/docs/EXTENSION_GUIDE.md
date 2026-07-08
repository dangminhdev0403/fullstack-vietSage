# Backend Service Extension Guide

## Purpose

This guide explains how to create new backend services or extract modules from an existing service.

## When to Keep a Module Inside a Service

Keep a capability as a module when:

- Domain boundaries are still evolving.
- It shares transactions or data ownership with nearby modules.
- It does not need independent deployment or scaling.
- Its external contract is not stable enough to version.

## When to Extract a Service

A module may be ready to become a separate service when:

- It owns a clear business capability.
- Its data can be owned independently.
- Other modules can interact through HTTP/event contracts instead of direct repository calls.
- It has independent scaling, deployment, security, or operational needs.
- Its contract is stable enough to version.

## Creating a New Service

Start with:

```txt
services/[service-name]/
├── src/
│   ├── main.ts
│   ├── app.bootstrap.ts
│   ├── app.module.ts
│   ├── modules/
│   ├── common/
│   ├── shared/
│   └── prisma/ or infrastructure/database/
├── prisma/
├── scripts/
├── docs/
└── package.json
```

Only add persistence folders when the service owns data.

## Extraction Workflow

1. Freeze and document the current module contract.
2. Confirm independent domain/data/API ownership.
3. Create `services/[service-name]` from the standard structure.
4. Move internal calls behind HTTP or event contracts.
5. Migrate data ownership carefully.
6. Keep backward-compatible contracts during transition.
7. Add service-specific docs under that service's `docs/` folder.
8. Add validation gates and operational runbooks.

## Service Documentation Rules

Each service should keep docs in its own `docs/` folder when it has service-specific details.

Core docs should include:

- `ARCHITECTURE.md` for service-specific architecture deviations or boundaries.
- `RULES.md` for service-specific development/validation/security rules.
- `PLANS.md` for implementation plans and milestone tracking.

Do not put service-specific implementation logs in the reusable architecture standard.

## Anti-patterns

- Splitting services only for architectural appearance.
- Sharing database tables across services without clear ownership.
- Extracting before the contract is stable.
- Moving code without moving operational ownership.
- Creating service-specific docs outside the service/docs folder without a clear reason.
