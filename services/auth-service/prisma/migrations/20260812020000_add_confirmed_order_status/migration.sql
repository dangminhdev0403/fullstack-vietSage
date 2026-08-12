-- Add CONFIRMED to MarketplaceOrderStatus enum
-- The Prisma schema already has CONFIRMED but the original migration omitted it
ALTER TYPE "MarketplaceOrderStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED' AFTER 'PENDING';
