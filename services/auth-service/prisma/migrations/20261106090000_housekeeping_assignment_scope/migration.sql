-- NULL preserves hotel-wide access for existing housekeeping assignments.
ALTER TABLE "HotelStaffAssignment" ADD COLUMN "housekeepingScope" JSONB;
