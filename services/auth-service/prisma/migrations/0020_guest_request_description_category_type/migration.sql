ALTER TABLE "GuestRequest" RENAME COLUMN "details" TO "description";

ALTER TABLE "HotelServiceCategory"
  ADD COLUMN "requestType" "GuestRequestType" NOT NULL DEFAULT 'HOUSEKEEPING';

CREATE INDEX "HotelServiceCategory_requestType_status_idx" ON "HotelServiceCategory"("requestType", "status");
