-- Add clientMessageId column to GuestMessage
ALTER TABLE "GuestMessage" ADD COLUMN IF NOT EXISTS "clientMessageId" VARCHAR(80);

-- Create unique index on (sessionId, clientMessageId)
CREATE UNIQUE INDEX IF NOT EXISTS "GuestMessage_sessionId_clientMessageId_key" ON "GuestMessage"("sessionId", "clientMessageId");

-- Insert business permissions hotel.messages.view and hotel.messages.manage
INSERT INTO "Permission" ("id", "method", "moduleKey", "path", "description", "createdAt", "updatedAt")
VALUES
  ('perm_' || md5('OPTIONS:hotel.messages.view'), 'OPTIONS', 'hotel-messages', 'hotel.messages.view', 'Xem tin nhắn phòng', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_' || md5('OPTIONS:hotel.messages.manage'), 'OPTIONS', 'hotel-messages', 'hotel.messages.manage', 'Quản lý tin nhắn phòng', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("method", "path") DO UPDATE SET
  "description" = EXCLUDED."description",
  "moduleKey" = EXCLUDED."moduleKey",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Grant permissions to TENANT_OWNER, HOTEL_FRONTDESK, SUPER_ADMIN
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('SUPER_ADMIN', 'TENANT_OWNER', 'HOTEL_FRONTDESK')
  AND p."method" = 'OPTIONS'
  AND p."path" IN ('hotel.messages.view', 'hotel.messages.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
