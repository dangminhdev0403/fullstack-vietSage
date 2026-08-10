INSERT INTO "Code" ("id", "name", "sequenceNext", "isActive", "createdAt", "updatedAt")
VALUES
  ('code_marketplace_category', 'MARKETPLACE_CATEGORY', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('code_service_tenant', 'SERVICE_TENANT', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;