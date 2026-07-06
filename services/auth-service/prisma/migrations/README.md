# Auth Service Migration Ordering

Prisma treats an applied migration's identity as the full migration directory
name, not just the numeric prefix. Once a migration has been applied to any
database, that directory name must remain stable so `prisma migrate status` can
match local files to rows in `_prisma_migrations`.

Keep the existing applied migration directory names as-is, including duplicate
numeric prefixes:

- `0007_guest_os_service_catalog`
- `0007_simplify_guest_request_priority`
- `0026_add_room_max_active_guest_devices`
- `0026_telegram_guest_request_notifications`
- `0027_drop_guest_request_type_enum`
- `0027_service_catalog_translations`
- `0028_add_service_catalog_import_keys`
- `0028_guest_request_telegram_confirm`

The canonical applied ordering is the lexical order of the full directory names
currently present in this `services/auth-service/prisma/migrations` directory.
Do not rename already-applied directories to make numeric prefixes unique.

The nested path
`services/auth-service/services/auth-service/prisma/migrations/0025_remove_service_category_request_type`
was accidental. Prisma ignores it because it is outside this canonical
migrations directory.
