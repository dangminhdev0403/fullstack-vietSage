import { MarketplaceServiceMode, Prisma } from "@prisma/client";

export function calculateOnSiteServiceFee(
  partnerSubtotal: Prisma.Decimal,
  mode: MarketplaceServiceMode,
  percentage = new Prisma.Decimal("10.00"),
): Prisma.Decimal {
  return mode === MarketplaceServiceMode.DELIVERY_TO_HOTEL
    ? partnerSubtotal.mul(percentage).div(100)
    : new Prisma.Decimal(0);
}

export function calculateFeePercentage(
  partnerSubtotal: Prisma.Decimal,
  feeAmount: Prisma.Decimal,
): Prisma.Decimal {
  return partnerSubtotal.isZero() ? new Prisma.Decimal(0) : feeAmount.mul(100).div(partnerSubtotal);
}
