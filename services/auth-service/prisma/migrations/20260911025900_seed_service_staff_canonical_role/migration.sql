-- Ensure the service-provider access class exists before canonical-role validation.
-- This migration is intentionally ordered before 20260911030000_immutable_canonical_roles
-- and is safe on databases where the role was already seeded.
INSERT INTO "Role" (
  "id",
  "code",
  "name",
  "description",
  "status",
  "type",
  "createdAt",
  "updatedAt"
)
VALUES (
  'role_' || md5('SERVICE_STAFF'),
  'SERVICE_STAFF',
  'Nhân viên đối tác dịch vụ',
  'Vận hành cổng dịch vụ dành cho đối tác',
  'ACTIVE'::"RoleStatus",
  'SYSTEM_TEMPLATE'::"RoleType",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "type" = 'SYSTEM_TEMPLATE'::"RoleType",
  "updatedAt" = CURRENT_TIMESTAMP;
