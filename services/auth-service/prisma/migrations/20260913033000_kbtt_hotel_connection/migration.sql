CREATE TABLE "KbttHotelConnection" (
  "hotelId" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "iv" VARCHAR(24) NOT NULL,
  "authTag" VARCHAR(32) NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(20) NOT NULL DEFAULT 'CONNECTED',
  "csltId" VARCHAR(32) NOT NULL,
  "csltKhuVuc" INTEGER NOT NULL,
  "csltDonVi" INTEGER NOT NULL,
  "maTTCuaCslt" VARCHAR(32) NOT NULL,
  "maPxCuaCslt" VARCHAR(32) NOT NULL,
  "isCsltChinh" BOOLEAN NOT NULL,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL,
  "lastConnectedAt" TIMESTAMP(3) NOT NULL,
  "lastErrorCode" VARCHAR(40),
  "lastErrorMessage" VARCHAR(200),
  CONSTRAINT "KbttHotelConnection_pkey" PRIMARY KEY ("hotelId"),
  CONSTRAINT "KbttHotelConnection_status_check" CHECK ("status" IN ('CONNECTED', 'AUTH_FAILED')),
  CONSTRAINT "KbttHotelConnection_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

WITH new_permissions("path", "description") AS (
  VALUES
    ('hotel.kbtt.view', 'Xem kết nối khai báo tạm trú'),
    ('hotel.kbtt.manage', 'Quản lý kết nối khai báo tạm trú')
)
INSERT INTO "Permission" ("id", "method", "moduleKey", "path", "description", "createdAt", "updatedAt")
SELECT 'bp_' || md5("path"), 'OPTIONS'::"HttpMethod", 'hotel-kbtt', "path", "description", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM new_permissions
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey", "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT 'rp_' || md5(role."id" || ':' || permission."id"), role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" IN ('SUPER_ADMIN', 'TENANT_OWNER', 'HOTEL_OWNER')
  AND permission."method" = 'OPTIONS'::"HttpMethod"
  AND permission."path" IN ('hotel.kbtt.view', 'hotel.kbtt.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
