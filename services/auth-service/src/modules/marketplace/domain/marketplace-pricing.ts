import { MarketplaceServiceMode, Prisma } from "@prisma/client";

export function calculateOnSiteServiceFee(
  partnerSubtotal: Prisma.Decimal,
  _mode: MarketplaceServiceMode,
  percentage = new Prisma.Decimal("10.00"),
): Prisma.Decimal {
  return partnerSubtotal.mul(percentage).div(100);
}

export function calculateFeePercentage(
  partnerSubtotal: Prisma.Decimal,
  feeAmount: Prisma.Decimal,
): Prisma.Decimal {
  return partnerSubtotal.isZero() ? new Prisma.Decimal(0) : feeAmount.mul(100).div(partnerSubtotal);
}
