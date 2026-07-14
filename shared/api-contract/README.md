# API Contract Sync Package

Shared contract package for frontend/backend synchronization.

## Structure

- `docs/API_CATALOG.md`: human-readable endpoint contract (module/request/response).
- `openapi/v1/openapi.json`: source of truth OpenAPI spec.
- `openapi/v1/openapi.yaml`: YAML mirror of the same spec.
- `docs/CONTRACT_CHANGES.md`: contract change history.
- `scripts/`: verification helpers.

## Export from auth-service

Run from `services/auth-service`:

```bash
npm run openapi:export
```

This updates `shared/api-contract/openapi/v1/openapi.json` and `openapi.yaml`.

## Verify contract package

Run from `shared/api-contract`:

```bash
npm run verify
```

No SDK mirror is maintained in this package. Frontend tooling should consume `openapi/v1/openapi.json` directly.

## Sync frontend OpenAPI types

Run from `frontends/front-end-vietsage` after any OpenAPI contract change:

```bash
npm run sync:api:types
```

This regenerates `src/generated/openapi/v1.ts` from `shared/api-contract/openapi/v1/openapi.json`. Reviewers can verify generated types are current by running the same command and confirming Git reports no generated type diff.
