-- Persist the canonical itinerary selected by public LocalMate at order creation.
-- Candidate only; do not apply automatically.
ALTER TABLE "MarketplaceOrder"
ADD COLUMN "tripSnapshot" JSONB;
