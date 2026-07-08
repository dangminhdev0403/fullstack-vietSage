# Multilingual Backend Plan

## Scope

The service supports Vietnamese (`vi`) and English (`en`) API messages through a shared i18n layer. The current rollout localizes common success messages and centralized error details while keeping existing controller decorators and thrown exception strings compatible.

## Request Locale

Locale is resolved in this order:

1. `?lang=vi|en`
2. `x-lang: vi|en`
3. `Accept-Language`
4. Default locale: `vi`

Unsupported locales fall back to `vi`.

## Module Migration

For new and migrated module endpoints:

1. Add stable keys to `src/common/i18n/i18n.catalog.ts`.
2. Use `@SuccessMessageKey("module.action.success")` in controllers.
3. Prefer throwing exceptions with stable error codes in the response body, or add known legacy strings to `LEGACY_MESSAGE_KEYS` while migrating.
4. Keep user-facing text out of service logic when possible; services should expose stable failure codes and relevant metadata.

## Catalog Naming

Use dotted keys grouped by domain:

- `auth.login.success`
- `hotels.rooms.create.success`
- `guestOs.requests.cancel.error.invalidStatus`
- `errors.database.duplicateField`

## Response Contract

Successful responses keep the existing shape:

```json
{
  "status": 200,
  "error": null,
  "message": "Localized message",
  "data": {}
}
```

Error responses keep the existing shape and localize `data.detail` when a catalog entry is known:

```json
{
  "status": 400,
  "message": "RECORD_NOT_FOUND",
  "data": {
    "detail": "Localized detail"
  }
}
```
