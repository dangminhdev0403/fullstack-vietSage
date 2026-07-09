ALTER TABLE "NotificationRoute"
DROP COLUMN IF EXISTS "requestType";
ALTER TABLE "HotelServiceCategory" DROP COLUMN IF EXISTS "requestType";
DROP TYPE IF EXISTS "GuestRequestType";