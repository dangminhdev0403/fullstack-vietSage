-- Service Tenant has one operator-facing name. Keep Tenant.name because the shared Tenant model requires it.
UPDATE "Tenant" AS tenant
SET "name" = profile."displayName",
    "updatedAt" = now()
FROM "ServiceTenantProfile" AS profile
WHERE profile."tenantId" = tenant."id"
  AND tenant."type" = 'SERVICE'
  AND tenant."name" IS DISTINCT FROM profile."displayName";
