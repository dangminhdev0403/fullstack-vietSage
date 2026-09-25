-- 1. Create LocalMateStatus enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LocalMateStatus') THEN
    CREATE TYPE "LocalMateStatus" AS ENUM ('PENDING', 'QUALIFIED', 'SUSPENDED');
  END IF;
END$$;

-- 2. Create LocalMateProfile table
CREATE TABLE IF NOT EXISTS "LocalMateProfile" (
    "id" TEXT NOT NULL,
    "guideCode" VARCHAR(40) NOT NULL,
    "fullName" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "email" VARCHAR(120),
    "avatarUrl" VARCHAR(500) NOT NULL,
    "status" "LocalMateStatus" NOT NULL DEFAULT 'PENDING',
    "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "operatingRegions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "bio" VARCHAR(1000),
    "dailyRateVnd" INTEGER NOT NULL DEFAULT 1000000,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalMateProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocalMateProfile_guideCode_key" ON "LocalMateProfile"("guideCode");
CREATE INDEX IF NOT EXISTS "LocalMateProfile_status_idx" ON "LocalMateProfile"("status");
CREATE INDEX IF NOT EXISTS "LocalMateProfile_guideCode_idx" ON "LocalMateProfile"("guideCode");

-- 3. Create LocalMateTourKnowledge table
CREATE TABLE IF NOT EXISTS "LocalMateTourKnowledge" (
    "id" TEXT NOT NULL,
    "tourCode" VARCHAR(80) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "duration" VARCHAR(80) NOT NULL,
    "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "content" TEXT NOT NULL,
    "sourceFileName" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalMateTourKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocalMateTourKnowledge_tourCode_key" ON "LocalMateTourKnowledge"("tourCode");
CREATE INDEX IF NOT EXISTS "LocalMateTourKnowledge_destination_idx" ON "LocalMateTourKnowledge"("destination");
CREATE INDEX IF NOT EXISTS "LocalMateTourKnowledge_tourCode_idx" ON "LocalMateTourKnowledge"("tourCode");

-- 4. Create Role LOCALMATE_MANAGER
INSERT INTO "Role" ("id", "code", "name", "description", "status", "type", "createdAt", "updatedAt")
VALUES (
  'role_' || md5('LOCALMATE_MANAGER'),
  'LOCALMATE_MANAGER',
  'Quản trị viên LocalMate',
  'Vai trò quản trị mạng lưới hướng dẫn viên bản địa và kho tri thức AI',
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

-- 5. Create Permissions
WITH target_permissions("path", "moduleKey", "description") AS (
  VALUES
    ('platform.localmate.view', 'platform-localmate', 'Xem danh sách và hồ sơ LocalMate'),
    ('platform.localmate.manage', 'platform-localmate', 'Quản lý LocalMate và kho tri thức')
)
INSERT INTO "Permission" ("id", "method", "moduleKey", "path", "description", "createdAt", "updatedAt")
SELECT
  'bp_' || md5("path"),
  'OPTIONS'::"HttpMethod",
  "moduleKey",
  "path",
  "description",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM target_permissions
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Grant to LOCALMATE_MANAGER
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'LOCALMATE_MANAGER'
  AND permission."method" = 'OPTIONS'::"HttpMethod"
  AND permission."path" IN (
    'platform.localmate.view',
    'platform.localmate.manage'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Grant to SUPER_ADMIN
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'SUPER_ADMIN'
  AND permission."method" = 'OPTIONS'::"HttpMethod"
  AND permission."path" IN (
    'platform.localmate.view',
    'platform.localmate.manage'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 6. Insert User localmate@vietsage.vn
INSERT INTO "User" ("id", "email", "passwordHash", "fullName", "status", "userType", "createdAt", "updatedAt")
VALUES (
  'usr_' || md5('localmate@vietsage.vn'),
  'localmate@vietsage.vn',
  '$argon2id$v=19$m=65536,t=3,p=4$c9xrsMewkvICL0snx5J5kw$LBHAYzwjciV/3CkH7CEddPcvJgkYiTc2WQUfzDau9RI',
  'Quản trị viên LocalMate',
  'ACTIVE'::"UserStatus",
  'VIETSAGE_ADMIN'::"UserType",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  "fullName" = EXCLUDED."fullName",
  "status" = 'ACTIVE'::"UserStatus",
  "userType" = 'VIETSAGE_ADMIN'::"UserType",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Assign role LOCALMATE_MANAGER
INSERT INTO "UserRole" ("id", "userId", "roleId", "status", "assignedAt")
SELECT
  'ur_' || md5(u."id" || ':' || r."id"),
  u."id",
  r."id",
  'ACTIVE'::"UserRoleStatus",
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Role" r
WHERE u."email" = 'localmate@vietsage.vn'
  AND r."code" = 'LOCALMATE_MANAGER'
ON CONFLICT ("userId", "roleId") DO UPDATE SET
  "status" = 'ACTIVE'::"UserRoleStatus",
  "revokedAt" = NULL,
  "revokedById" = NULL;

-- Link to root tenant if exists
INSERT INTO "TenantUser" ("id", "tenantId", "userId", "status", "joinedAt", "createdAt", "updatedAt")
SELECT
  'tu_' || md5(t."id" || ':' || u."id"),
  t."id",
  u."id",
  'ACTIVE'::"TenantUserStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN "User" u
WHERE t."code" = 'VIETSAGE_ROOT'
  AND u."email" = 'localmate@vietsage.vn'
ON CONFLICT ("tenantId", "userId") DO UPDATE SET
  "status" = 'ACTIVE'::"TenantUserStatus",
  "updatedAt" = CURRENT_TIMESTAMP;
