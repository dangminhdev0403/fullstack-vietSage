## Architecture Principles

Follow:

- Domain Driven Design (DDD)
- Modular Monolith first
- Microservice-ready boundaries
- Event-driven communication
- API-first design
- Database per service
- OpenTelemetry tracing
- Clean Architecture

Avoid:

- Distributed transactions
- Shared database between services
- Circular dependency
- Business logic in controller
- Premature microservices split

---

## System Structure

```txt
vietsage/

frontend/
    web-admin/
    web-guest/
    shared-ui/

services/
    api-gateway/

    auth-service/
    hotel-service/
    ...service/

shared/
    contracts/
    types/
    utils/
    constants/

infra/
docs/
```

---

## Documentation Governance

- Documentation rules: `docs/RULES.md`
- Frontend synchronization validation: `docs/FRONTEND_SYNC_VALIDATION.md`