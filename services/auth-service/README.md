# VietSage Core API (`auth-service` historical path)

This NestJS service is the current VietSage backend core API. The folder/package name `auth-service` is historical; the runtime now includes identity/RBAC, tenant/hotel operations, GuestOS, billing, emergency workflows, notifications, health, and shared backend infrastructure.

## Architecture status

- Runtime model: modular monolith.
- Current service path: `services/auth-service`.
- Do not split microservices, add a broker, or rename this service without a dedicated approved phase.
- OpenAPI export is the HTTP contract source of truth.
- Repositories are internal to modules; cross-module access should use public services/ports.

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL for DB-backed flows

## Setup

```bash
npm install
```

Runtime environment values belong in ignored secret/env files, not in git. See root `docs/SECRETS.md`.

## Run

```bash
npm run start:dev
```

Service starts on the configured `PORT`.

## Health check

```bash
curl http://localhost:${PORT:-3000}/health
```

## Contract export

```bash
npm run openapi:export
```

## Validation commands

```bash
npm run build
npm run test -- --runInBand
npm run test:e2e
npx eslint "{src,apps,libs,test}/**/*.ts"
```

Note: the package `lint` script currently includes `--fix`; use `npx eslint ...` for non-mutating checks during refactors.
