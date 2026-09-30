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
- `GET /health` is dependency-free process liveness. `GET /health/ready` is public readiness and
  returns `503` when PostgreSQL cannot answer the bounded readiness query.
- Pagination must be bounded.
- GuestOS request-list `search` matches the service's canonical name, any localized service-item name, request title, and request description; matching is case-insensitive.
- GuestOS request responses resolve service names from the request locale and fall back to the canonical catalog name when no translation exists.
- Errors must keep the project-standard normalized shape.
- Secrets, tokens, passwords, provider keys, and connection strings must never appear in examples.
- Channex management routes are hotel-scoped and private. The sole public callback is
  `POST /api/v1/channel-manager/channex/webhook`; it requires `X-Channex-Webhook-Secret` and accepts
  only validated booking event payloads. Provider API keys never enter browser/BFF payloads.
- `POST /api/v1/channel-manager/hotels/{hotelId}/channex/channel-session` returns a non-cacheable,
  15-minute one-time Channel IFrame URL after hotel access and `hotel.rooms.manage` authorization.
- Hotel staff administration is tenant-scoped and requires `hotel.staff.view` or
  `hotel.staff.manage`; hotel assignment mutations additionally perform Property resource access
  checks using the session-bound active role ID.
- Role assignment and hotel assignment are separate contracts. Clients must not infer hotel access
  from a role or infer a role from a hotel assignment.
- Google Sheets service-catalog configuration belongs to a hotel, not the process environment.
  Only `SUPER_ADMIN` may set or clear `googleSheetUrl` through `PATCH /hotels/{hotelId}`; tenant
  users may trigger synchronization but cannot change the configured source. The backend
  accepts the URL optionally during Admin hotel creation or later update, normalizes it into
  `googleSheetId`, refuses synchronization for hotels without a configured sheet, and never falls
  back to a shared workbook.

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
