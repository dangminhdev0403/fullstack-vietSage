-- Idempotent development/demo data. Run against VietSage PostgreSQL after migrations.
BEGIN;

INSERT INTO "MarketplaceCategory" ("id", "code", "nameVi", "nameEn", "icon", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
  ('demo_cat_transport', 'DEMO_TRANSPORT', 'Di chuyển', 'Transport', 'directions_car', 10, true, now(), now()),
  ('demo_cat_wellness', 'DEMO_WELLNESS', 'Chăm sóc sức khỏe', 'Wellness', 'spa', 20, true, now(), now()),
  ('demo_cat_tour', 'DEMO_TOUR', 'Tour địa phương', 'Local tours', 'map', 30, true, now(), now())
ON CONFLICT ("code") DO UPDATE SET "nameVi" = EXCLUDED."nameVi", "nameEn" = EXCLUDED."nameEn", "isActive" = true, "updatedAt" = now();

INSERT INTO "Tenant" ("id", "code", "name", "type", "createdAt", "updatedAt") VALUES
  ('demo_provider_transport', 'DEMO_PROVIDER_TRANSPORT', 'VietSage Transfer', 'SERVICE', now(), now()),
  ('demo_provider_spa', 'DEMO_PROVIDER_SPA', 'VietSage Spa', 'SERVICE', now(), now()),
  ('demo_provider_tour', 'DEMO_PROVIDER_TOUR', 'VietSage Local Tour', 'SERVICE', now(), now())
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "type" = 'SERVICE', "updatedAt" = now();

WITH base AS (
  SELECT "latitude"::numeric AS lat, "longitude"::numeric AS lon
  FROM "Hotel"
  WHERE "status" = 'ACTIVE' AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL
  ORDER BY "createdAt" LIMIT 1
)
INSERT INTO "ServiceTenantProfile" ("tenantId", "displayName", "description", "phone", "address", "latitude", "longitude", "locationSource", "locationVerifiedAt", "status", "createdAt", "updatedAt")
SELECT 'demo_provider_transport', 'VietSage Transfer', 'Đưa đón sân bay và xe riêng.', '0901000001', 'Gần khách sạn', lat + 0.005, lon + 0.005, 'MANUAL'::"MarketplaceLocationSource", now(), 'ACTIVE'::"MarketplaceRecordStatus", now(), now() FROM base
UNION ALL SELECT 'demo_provider_spa', 'VietSage Spa', 'Massage và chăm sóc sức khỏe.', '0901000002', 'Gần khách sạn', lat + 0.010, lon + 0.010, 'MANUAL'::"MarketplaceLocationSource", now(), 'ACTIVE'::"MarketplaceRecordStatus", now(), now() FROM base
UNION ALL SELECT 'demo_provider_tour', 'VietSage Local Tour', 'Tour thành phố nửa ngày.', '0901000003', 'Gần khách sạn', lat + 0.015, lon + 0.015, 'MANUAL'::"MarketplaceLocationSource", now(), 'ACTIVE'::"MarketplaceRecordStatus", now(), now() FROM base
ON CONFLICT ("tenantId") DO UPDATE SET "displayName" = EXCLUDED."displayName", "description" = EXCLUDED."description", "latitude" = EXCLUDED."latitude", "longitude" = EXCLUDED."longitude", "status" = 'ACTIVE', "updatedAt" = now();

-- 25 nearby providers: enough for three 10-item pagination pages.
INSERT INTO "Tenant" ("id", "code", "name", "type", "createdAt", "updatedAt")
SELECT
  'pagination_provider_' || lpad(n::text, 2, '0'),
  'PAGINATION_PROVIDER_' || lpad(n::text, 2, '0'),
  'Đối tác kiểm thử ' || lpad(n::text, 2, '0'),
  'SERVICE', now(), now()
FROM generate_series(1, 25) AS n
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = now();

WITH base AS (
  SELECT "latitude"::numeric AS lat, "longitude"::numeric AS lon
  FROM "Hotel"
  WHERE "status" = 'ACTIVE' AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL
  ORDER BY "createdAt" LIMIT 1
)
INSERT INTO "ServiceTenantProfile" ("tenantId", "displayName", "description", "phone", "address", "latitude", "longitude", "locationSource", "locationVerifiedAt", "status", "createdAt", "updatedAt")
SELECT
  'pagination_provider_' || lpad(n::text, 2, '0'),
  'Đối tác kiểm thử ' || lpad(n::text, 2, '0'),
  'Dữ liệu local để kiểm chứng phân trang.',
  '0902' || lpad(n::text, 6, '0'),
  n || ' Đường Kiểm Thử',
  lat + (n * 0.001), lon + (n * 0.001),
  'MANUAL'::"MarketplaceLocationSource", now(), 'ACTIVE'::"MarketplaceRecordStatus", now(), now()
FROM base CROSS JOIN generate_series(1, 25) AS n
ON CONFLICT ("tenantId") DO UPDATE SET
  "displayName" = EXCLUDED."displayName", "address" = EXCLUDED."address",
  "latitude" = EXCLUDED."latitude", "longitude" = EXCLUDED."longitude",
  "status" = 'ACTIVE', "updatedAt" = now();

INSERT INTO "MarketplaceService" ("id", "serviceTenantId", "categoryId", "name", "description", "unitPrice", "currency", "imageUrls", "mode", "capacityAvailable", "waitingMinutes", "status", "version", "createdAt", "updatedAt") VALUES
  ('demo_service_airport', 'demo_provider_transport', 'demo_cat_transport', 'Đưa đón sân bay', 'Xe riêng một chiều.', 350000, 'VND', ARRAY[]::text[], 'DELIVERY_TO_HOTEL', 20, 30, 'ACTIVE', 1, now(), now()),
  ('demo_service_spa60', 'demo_provider_spa', 'demo_cat_wellness', 'Massage thư giãn 60 phút', 'Khách đến cơ sở.', 450000, 'VND', ARRAY[]::text[], 'CUSTOMER_AT_SERVICE', 10, 15, 'ACTIVE', 1, now(), now()),
  ('demo_service_citytour', 'demo_provider_tour', 'demo_cat_tour', 'Tour thành phố nửa ngày', 'Đón tại khách sạn.', 650000, 'VND', ARRAY[]::text[], 'DELIVERY_TO_HOTEL', 12, 60, 'ACTIVE', 1, now(), now())
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "unitPrice" = EXCLUDED."unitPrice", "capacityAvailable" = EXCLUDED."capacityAvailable", "status" = 'ACTIVE', "updatedAt" = now();

-- Give every existing Service Tenant one catalog item so its own login has local demo data.
INSERT INTO "MarketplaceService" ("id", "serviceTenantId", "categoryId", "name", "description", "unitPrice", "currency", "imageUrls", "mode", "capacityAvailable", "waitingMinutes", "status", "version", "createdAt", "updatedAt")
SELECT
  'demo_existing_' || substr(md5(t.id), 1, 16),
  t.id,
  CASE
    WHEN lower(t.name) LIKE '%spa%' OR lower(t.name) LIKE '%wellness%' THEN 'demo_cat_wellness'
    WHEN lower(t.name) LIKE '%xe%' OR lower(t.name) LIKE '%transport%' THEN 'demo_cat_transport'
    ELSE 'demo_cat_tour'
  END,
  CASE
    WHEN lower(t.name) LIKE '%spa%' OR lower(t.name) LIKE '%wellness%' THEN 'Massage thư giãn 60 phút'
    WHEN lower(t.name) LIKE '%xe%' OR lower(t.name) LIKE '%transport%' THEN 'Đưa đón sân bay'
    WHEN lower(t.name) LIKE '%nhà hàng%' OR lower(t.name) LIKE '%restaurant%' THEN 'Set menu địa phương'
    ELSE 'Tour trải nghiệm địa phương'
  END,
  'Dữ liệu mẫu local cho Service Tenant.',
  CASE
    WHEN lower(t.name) LIKE '%spa%' OR lower(t.name) LIKE '%wellness%' THEN 450000
    WHEN lower(t.name) LIKE '%xe%' OR lower(t.name) LIKE '%transport%' THEN 350000
    WHEN lower(t.name) LIKE '%nhà hàng%' OR lower(t.name) LIKE '%restaurant%' THEN 280000
    ELSE 650000
  END,
  'VND', ARRAY[]::text[],
  CASE WHEN lower(t.name) LIKE '%spa%' OR lower(t.name) LIKE '%wellness%' THEN 'CUSTOMER_AT_SERVICE'::"MarketplaceServiceMode" ELSE 'DELIVERY_TO_HOTEL'::"MarketplaceServiceMode" END,
  20, 20, 'ACTIVE', 1, now(), now()
FROM "Tenant" t
WHERE t.type = 'SERVICE'
ON CONFLICT ("id") DO UPDATE SET "status" = 'ACTIVE', "updatedAt" = now();

-- Four reusable demo offerings per existing Service Tenant; visible before and after hotel linking.
INSERT INTO "MarketplaceService" ("id", "serviceTenantId", "categoryId", "name", "description", "unitPrice", "currency", "imageUrls", "mode", "capacityAvailable", "waitingMinutes", "status", "version", "createdAt", "updatedAt")
SELECT
  'demo_catalog_' || substr(md5(t.id || offering.slug), 1, 16),
  t.id,
  offering.category_id,
  offering.name,
  offering.description,
  offering.price,
  'VND', ARRAY[]::text[], offering.mode::"MarketplaceServiceMode",
  offering.capacity, offering.waiting_minutes, 'ACTIVE', 1, now(), now()
FROM "Tenant" t
CROSS JOIN (VALUES
  ('airport', 'demo_cat_transport', 'Đưa đón sân bay', 'Xe riêng một chiều, đón hoặc trả tại khách sạn.', 350000, 'DELIVERY_TO_HOTEL', 20, 30),
  ('citycar', 'demo_cat_transport', 'Xe riêng tham quan thành phố', 'Xe riêng 4 giờ kèm tài xế.', 850000, 'DELIVERY_TO_HOTEL', 8, 45),
  ('wellness60', 'demo_cat_wellness', 'Massage thư giãn 60 phút', 'Liệu trình thư giãn dành cho một khách.', 450000, 'CUSTOMER_AT_SERVICE', 12, 15),
  ('localtour', 'demo_cat_tour', 'Tour trải nghiệm địa phương', 'Tour nửa ngày, đón tại khách sạn.', 650000, 'DELIVERY_TO_HOTEL', 15, 60)
) AS offering(slug, category_id, name, description, price, mode, capacity, waiting_minutes)
WHERE t.type = 'SERVICE'
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name", "description" = EXCLUDED."description",
  "unitPrice" = EXCLUDED."unitPrice", "mode" = EXCLUDED."mode",
  "capacityAvailable" = EXCLUDED."capacityAvailable", "waitingMinutes" = EXCLUDED."waitingMinutes",
  "status" = 'ACTIVE', "updatedAt" = now();

-- 25 extra services per tenant: enough for catalog pagination checks.
INSERT INTO "MarketplaceService" ("id", "serviceTenantId", "categoryId", "name", "description", "unitPrice", "currency", "imageUrls", "mode", "capacityAvailable", "waitingMinutes", "status", "version", "createdAt", "updatedAt")
SELECT
  'pagination_service_' || substr(md5(t.id || n::text), 1, 16), t.id,
  CASE n % 3 WHEN 0 THEN 'demo_cat_transport' WHEN 1 THEN 'demo_cat_wellness' ELSE 'demo_cat_tour' END,
  'Dịch vụ kiểm thử ' || lpad(n::text, 2, '0'),
  'Dữ liệu local để kiểm chứng phân trang Service Catalog.', 100000 + n * 25000,
  'VND', ARRAY[]::text[],
  CASE WHEN n % 2 = 0 THEN 'DELIVERY_TO_HOTEL'::"MarketplaceServiceMode" ELSE 'CUSTOMER_AT_SERVICE'::"MarketplaceServiceMode" END,
  10 + n, 10 + n, 'ACTIVE', 1, now(), now()
FROM "Tenant" t CROSS JOIN generate_series(1, 25) AS n
WHERE t.type = 'SERVICE'
ON CONFLICT ("id") DO UPDATE SET "unitPrice" = EXCLUDED."unitPrice", "capacityAvailable" = EXCLUDED."capacityAvailable", "status" = 'ACTIVE', "updatedAt" = now();

-- Demo convenience: link all three providers to the first active hotel only.
WITH hotel AS (SELECT "id" FROM "Hotel" WHERE "status" = 'ACTIVE' ORDER BY "createdAt" LIMIT 1),
providers AS (SELECT unnest(ARRAY['demo_provider_transport','demo_provider_spa','demo_provider_tour']) AS id)
INSERT INTO "HotelServiceLink" ("id", "hotelId", "serviceTenantId", "status", "sortOrder", "createdAt", "updatedAt")
SELECT 'demo_link_' || row_number() OVER (), hotel.id, providers.id, 'ACTIVE', row_number() OVER (), now(), now() FROM hotel CROSS JOIN providers
ON CONFLICT ("hotelId", "serviceTenantId") DO UPDATE SET "status" = 'ACTIVE', "updatedAt" = now();

COMMIT;
