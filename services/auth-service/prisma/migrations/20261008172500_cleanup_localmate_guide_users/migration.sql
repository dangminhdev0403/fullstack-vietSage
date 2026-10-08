-- Migration: 20261008172500_cleanup_localmate_guide_users
-- Purpose: Remove redundant guide user login accounts and LOCALMATE_GUIDE role.
-- Guides operate directly via Telegram Bot; only localmate_manager accesses the web portal.

-- 1. Unlink userId and clear auto-generated dummy emails from LocalMateProfile
UPDATE "LocalMateProfile"
SET "userId" = NULL
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@localmate.vietsage.vn'
    AND email != 'localmate@vietsage.vn'
);

UPDATE "LocalMateProfile"
SET "email" = NULL
WHERE "email" LIKE '%@localmate.vietsage.vn';

-- 2. Delete user roles for dummy guide users
DELETE FROM "UserRole"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@localmate.vietsage.vn'
    AND email != 'localmate@vietsage.vn'
);

-- 3. Delete tenant links for dummy guide users
DELETE FROM "TenantUser"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@localmate.vietsage.vn'
    AND email != 'localmate@vietsage.vn'
);

-- 4. Delete tokens and sessions for dummy guide users
DELETE FROM "RefreshToken"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@localmate.vietsage.vn'
    AND email != 'localmate@vietsage.vn'
);

DELETE FROM "AuthSession"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@localmate.vietsage.vn'
    AND email != 'localmate@vietsage.vn'
);

-- 5. Delete dummy guide accounts from User table
DELETE FROM "User"
WHERE email LIKE '%@localmate.vietsage.vn'
  AND email != 'localmate@vietsage.vn';

-- 6. Delete RolePermission for LOCALMATE_GUIDE
DELETE FROM "RolePermission"
WHERE "roleId" IN (
  SELECT id FROM "Role"
  WHERE code = 'LOCALMATE_GUIDE'
);

-- 7. Delete LOCALMATE_GUIDE role from Role table
DELETE FROM "Role"
WHERE code = 'LOCALMATE_GUIDE';
