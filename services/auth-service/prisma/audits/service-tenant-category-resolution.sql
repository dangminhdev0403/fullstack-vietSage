SELECT
  p."tenantId",
  t."code" AS "tenantCode",
  t."name" AS "tenantName",
  p."categoryId",
  COUNT(DISTINCT s."categoryId") AS "legacyCategoryCount",
  ARRAY_AGG(DISTINCT s."categoryId") FILTER (WHERE s."categoryId" IS NOT NULL) AS "legacyCategoryIds"
FROM "ServiceTenantProfile" p
JOIN "Tenant" t ON t."id" = p."tenantId"
LEFT JOIN "MarketplaceService" s ON s."serviceTenantId" = p."tenantId"
WHERE t."type" = 'SERVICE' AND p."categoryId" IS NULL
GROUP BY p."tenantId", t."code", t."name", p."categoryId"
ORDER BY t."name";
