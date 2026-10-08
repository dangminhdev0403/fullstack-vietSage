-- Migration: 20261009050500_restore_localmate_service_capacity
-- Purpose: Restore max party capacity (10) for LocalMate tour services and ensure capacity is not depleted.

UPDATE "MarketplaceService"
SET "capacityAvailable" = 10
WHERE "localMateProfileId" IS NOT NULL
  AND ("capacityAvailable" IS NULL OR "capacityAvailable" < 10);
