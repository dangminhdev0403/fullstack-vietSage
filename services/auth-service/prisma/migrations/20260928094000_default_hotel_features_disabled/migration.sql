-- Keep both opt-in hotel features disabled until a platform admin enables them.
-- Hotels without entitlement rows already resolve to DISABLED at runtime.
UPDATE "hotel_feature_entitlements"
SET
    "status" = 'DISABLED'::"HotelFeatureStatus",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "featureKey" IN (
    'guest.ai_floating_chat',
    'frontdesk.hn2n_cccd_scanner'
)
AND "status" <> 'DISABLED'::"HotelFeatureStatus";
