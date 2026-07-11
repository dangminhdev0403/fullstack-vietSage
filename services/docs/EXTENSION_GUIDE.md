# VietSage Backend Extension and Service Evolution Guide

## Default choice

Add new backend capabilities as modules inside the current core API unless extraction criteria are met. The current deployed backend is `services/auth-service` even though its name is historical.

## Add a new module when

- The capability shares request/transaction/data ownership with existing core workflows.
- There is no independent scaling/deployment need.
- API contract is still changing.
- A simple module boundary is enough.

## Extract a service only when

- Contract is stable and versioned.
- Data ownership is clear.
- Cross-context transactions are resolved.
- Operational ownership is defined.
- There is a concrete scaling, reliability, security, integration, or team boundary reason.

See root `docs/SERVICE_EVOLUTION.md` for the full checklist.

## New module checklist

- [ ] Define bounded context and owner models.
- [ ] Add controller/service/repository only if needed.
- [ ] Keep repositories internal.
- [ ] Export only public services/ports.
- [ ] Add tests before behavior changes.
- [ ] Update OpenAPI export when HTTP contract changes.
- [ ] Update docs only where they remain source-of-truth; avoid endpoint drift.

## Service extraction checklist

- [ ] ADR written.
- [ ] OpenAPI/event contracts versioned.
- [ ] Data migration plan exists.
- [ ] Auth/service-to-service strategy exists.
- [ ] Secrets/config isolated.
- [ ] Health/metrics/logs/runbooks exist.
- [ ] Rollback plan exists.
- [ ] Frontend/shared contract verification passes.
