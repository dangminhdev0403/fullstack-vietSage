-- 1. Alter LocalMateProfile: add userId, tenantId, position
ALTER TABLE "LocalMateProfile" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "LocalMateProfile" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "LocalMateProfile" ADD COLUMN IF NOT EXISTS "position" VARCHAR(80) NOT NULL DEFAULT 'GUIDE';

-- 2. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "LocalMateProfile_userId_key" ON "LocalMateProfile"("userId");
CREATE INDEX IF NOT EXISTS "LocalMateProfile_tenantId_idx" ON "LocalMateProfile"("tenantId");
CREATE INDEX IF NOT EXISTS "LocalMateProfile_position_idx" ON "LocalMateProfile"("position");

-- 3. Foreign Keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocalMateProfile_userId_fkey'
  ) THEN
    ALTER TABLE "LocalMateProfile" ADD CONSTRAINT "LocalMateProfile_userId_fkey" 
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocalMateProfile_tenantId_fkey'
  ) THEN
    ALTER TABLE "LocalMateProfile" ADD CONSTRAINT "LocalMateProfile_tenantId_fkey" 
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- 4. Create Roles: LOCALMATE_GUIDE & LOCALMATE_COORDINATOR
INSERT INTO "Role" ("id", "code", "name", "description", "status", "type", "createdAt", "updatedAt")
VALUES 
  (
    'role_' || md5('LOCALMATE_GUIDE'),
    'LOCALMATE_GUIDE',
    'Hướng dẫn viên bản địa',
    'Vai trò hướng dẫn viên bản địa LocalMate tiếp nhận và dẫn tour du lịch trải nghiệm',
    'ACTIVE'::"RoleStatus",
    'SYSTEM_TEMPLATE'::"RoleType",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'role_' || md5('LOCALMATE_COORDINATOR'),
    'LOCALMATE_COORDINATOR',
    'Điều phối viên vùng LocalMate',
    'Vai trò quản lý và điều phối mạng lưới hướng dẫn viên và tour theo địa bàn khu vực',
    'ACTIVE'::"RoleStatus",
    'SYSTEM_TEMPLATE'::"RoleType",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = 'ACTIVE'::"RoleStatus",
  "type" = 'SYSTEM_TEMPLATE'::"RoleType",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 5. Grant base permissions to LOCALMATE_GUIDE & LOCALMATE_COORDINATOR
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" IN ('LOCALMATE_GUIDE', 'LOCALMATE_COORDINATOR')
  AND permission."method" = 'OPTIONS'::"HttpMethod"
  AND permission."path" = 'platform.localmate.view'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Grant manage permission to LOCALMATE_COORDINATOR
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'LOCALMATE_COORDINATOR'
  AND permission."method" = 'OPTIONS'::"HttpMethod"
  AND permission."path" = 'platform.localmate.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
