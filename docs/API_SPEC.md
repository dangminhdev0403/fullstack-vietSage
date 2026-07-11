# VietSage API Contract Policy

## Source of truth

Generated OpenAPI from the current backend is the HTTP contract source of truth. Do not maintain a parallel hand-written endpoint catalog in this file.

```bash
cd services/auth-service
npm run openapi:export
```

The exported contract should be consumed or verified through `shared/api-contract`.

## Current runtime

The current backend runtime is the NestJS core API under `services/auth-service`. The historical name does not mean only authentication endpoints are present.

## Contract rules

- API changes must be reflected by controller/schema/OpenAPI changes, then exported.
- Frontend should consume the generated contract or stable documented DTOs, not guessed shapes.
- Breaking response/request changes require explicit approval and a migration note.
- Public routes must be explicit; private routes remain guarded by default.
- Pagination must be bounded.
- Errors must keep the project-standard normalized shape.
- Secrets, tokens, passwords, provider keys, and connection strings must never appear in examples.

## Verification

When HTTP behavior changes:

```bash
cd services/auth-service
npm run build
npm run test
npm run test:e2e
npm run openapi:export
cd ../../shared/api-contract
npm run verify
```

If no HTTP behavior changes, this file can remain policy-only and OpenAPI export is optional.
