-- CreateEnum
CREATE TYPE "KbttDeclarationStatus" AS ENUM ('DRAFT', 'READY', 'SENDING', 'SUBMITTED', 'FAILED', 'UNKNOWN', 'CANCELLED');

-- CreateTable
CREATE TABLE "KbttGuestDeclaration" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "occupantId" TEXT NOT NULL,
    "declarationKind" "CitizenshipKind" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "KbttDeclarationStatus" NOT NULL DEFAULT 'DRAFT',
    "draftPayloadJson" JSONB,
    "submittedPayloadJson" JSONB,
    "submittedPayloadFingerprint" VARCHAR(64),
    "providerCode" VARCHAR(32),
    "providerMessage" VARCHAR(500),
    "providerResponseJson" JSONB,
    "submittedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbttGuestDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KbttGuestDeclaration_hotelId_stayId_occupantId_revision_key" ON "KbttGuestDeclaration"("hotelId", "stayId", "occupantId", "revision");

-- CreateIndex
CREATE INDEX "KbttGuestDeclaration_hotelId_status_idx" ON "KbttGuestDeclaration"("hotelId", "status");

-- CreateIndex
CREATE INDEX "KbttGuestDeclaration_occupantId_idx" ON "KbttGuestDeclaration"("occupantId");

-- CreateIndex
CREATE INDEX "KbttGuestDeclaration_stayId_idx" ON "KbttGuestDeclaration"("stayId");

-- AddForeignKey
ALTER TABLE "KbttGuestDeclaration" ADD CONSTRAINT "KbttGuestDeclaration_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbttGuestDeclaration" ADD CONSTRAINT "KbttGuestDeclaration_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbttGuestDeclaration" ADD CONSTRAINT "KbttGuestDeclaration_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "GuestStayOccupant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Register declaration permissions
WITH new_permissions("path", "description") AS (
  VALUES
    ('hotel.kbtt.declarations.view', 'Xem danh sách khai báo tạm trú'),
    ('hotel.kbtt.declarations.manage', 'Quản lý và lập hồ sơ khai báo tạm trú')
)
INSERT INTO "Permission" ("id", "method", "moduleKey", "path", "description", "createdAt", "updatedAt")
SELECT 'bp_' || md5("path"), 'OPTIONS'::"HttpMethod", 'hotel-kbtt', "path", "description", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM new_permissions
ON CONFLICT ("method", "path") DO UPDATE SET
  "moduleKey" = EXCLUDED."moduleKey", "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

-- Grant declaration permissions to authorized operational roles
WITH role_presets("roleCode", "permissionKey") AS (
  VALUES
    ('SUPER_ADMIN', 'hotel.kbtt.declarations.view'),
    ('SUPER_ADMIN', 'hotel.kbtt.declarations.manage'),
    ('TENANT_OWNER', 'hotel.kbtt.declarations.view'),
    ('TENANT_OWNER', 'hotel.kbtt.declarations.manage'),
    ('HOTEL_OWNER', 'hotel.kbtt.declarations.view'),
    ('HOTEL_OWNER', 'hotel.kbtt.declarations.manage'),
    ('HOTEL_MANAGER', 'hotel.kbtt.declarations.view'),
    ('HOTEL_MANAGER', 'hotel.kbtt.declarations.manage'),
    ('HOTEL_FRONTDESK', 'hotel.kbtt.declarations.view'),
    ('HOTEL_FRONTDESK', 'hotel.kbtt.declarations.manage')
)
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(role."id" || ':' || permission."id"),
  role."id",
  permission."id"
FROM role_presets preset
JOIN "Role" role ON role."code" = preset."roleCode"
JOIN "Permission" permission
  ON permission."method" = 'OPTIONS'::"HttpMethod"
 AND permission."path" = preset."permissionKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
