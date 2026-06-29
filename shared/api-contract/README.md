# API Contract Sync Package

Shared contract package for frontend/backend synchronization.

## Structure

- `API_CATALOG.md`: human-readable endpoint contract (module/request/response).
- `openapi/v1/openapi.json`: source of truth OpenAPI spec.
- `openapi/v1/openapi.yaml`: YAML mirror of the same spec.
- `changelog/CONTRACT_CHANGES.md`: contract change history.
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
