import { BadRequestException } from "@nestjs/common";

export function resolveChannexRateMultiplier(
  baseUrl: string,
  targetCurrency: string | null | undefined,
): number {
  if (targetCurrency === "VND") return 1;
  if (targetCurrency !== "GBP") {
    throw new BadRequestException(
      `Không hỗ trợ quy đổi giá VND sang ${targetCurrency ?? "tiền tệ chưa xác định"}`,
    );
  }
  if (new URL(baseUrl).hostname !== "staging.channex.io") {
    throw new BadRequestException("Tỷ giá VND→GBP chỉ được phép dùng trên Channex staging");
  }

  const majorRate = Number(process.env.CHANNEX_STAGING_VND_TO_GBP_RATE);
  if (!Number.isFinite(majorRate) || majorRate <= 0) {
    throw new BadRequestException("CHANNEX_STAGING_VND_TO_GBP_RATE chưa được cấu hình hợp lệ");
  }

  // ponytail: fixed staging calibration; use a dated FX provider before production multi-currency.
  // Channex ARI uses integer minor units; GBP has 100 pence per pound.
  return majorRate * 100;
}

export function channexMinorUnitScale(currency: string): number {
  return currency === "GBP" ? 100 : 1;
}
