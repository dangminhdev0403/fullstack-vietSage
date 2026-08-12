/**
 * Utility functions to handle generic pricing units and customer-facing quantity formatting
 * for External Marketplace Services.
 */

type GuestTranslator = (key: string, replacements?: Record<string, string | number>) => string;

const VI_UNITS: Record<string, string> = {
  turn: "lượt",
  person: "khách",
  ticket: "vé",
  vehicle: "xe",
  portion: "suất",
  order: "đơn",
  hour: "giờ",
  day: "ngày",
  item: "món",
  service: "dịch vụ",
};

export function localizeUnitVi(unitRaw: string): string {
  const normalized = unitRaw.trim().toLowerCase();
  return VI_UNITS[normalized] ?? unitRaw;
}

export function getServicePricingUnit(
  item?: {
    unit?: string | null;
    unitSnapshot?: string | null;
    pricingUnit?: string | null;
    pricingUnitSnapshot?: string | null;
    name?: string | null;
    serviceNameSnapshot?: string | null;
    category?: { name?: string; nameVi?: string } | null;
  } | null,
  t?: GuestTranslator,
): string {
  const explicitUnit = item?.pricingUnitSnapshot || item?.pricingUnit || item?.unit || item?.unitSnapshot;
  if (explicitUnit?.trim()) {
    const raw = explicitUnit.trim().replace(/^\//, "").trim();
    if (t) return raw;
    return localizeUnitVi(raw);
  }
  const text = `${item?.name || item?.serviceNameSnapshot || ""} ${item?.category?.name || item?.category?.nameVi || ""}`.toLowerCase();
  
  let unitKey = "turn";
  if (text.includes("người") || text.includes("khách") || text.includes("tour") || text.includes("person") || text.includes("pax")) {
    unitKey = "person";
  } else if (text.includes("vé") || text.includes("ticket")) {
    unitKey = "ticket";
  } else if (text.includes("xe") || text.includes("chuyến") || text.includes("đưa đón") || text.includes("vehicle") || text.includes("car")) {
    unitKey = "vehicle";
  } else if (text.includes("suất") || text.includes("phần") || text.includes("combo") || text.includes("món") || text.includes("portion") || text.includes("meal")) {
    unitKey = "portion";
  } else if (text.includes("lượt") || text.includes("lần") || text.includes("giờ") || text.includes("phút") || text.includes("massage") || text.includes("spa")) {
    unitKey = "turn";
  } else if (text.includes("đơn") || text.includes("gói") || text.includes("order")) {
    unitKey = "order";
  }

  if (t) return t(`units.${unitKey}`);
  return VI_UNITS[unitKey] ?? unitKey;
}

export function formatQuantityWithUnit(
  quantity: number,
  unit: string,
  t?: GuestTranslator,
): string {
  if (t) {
    return t("services.quantityFormat", { quantity, unit });
  }
  return `${quantity} ${unit}`;
}

export function formatUnitPriceWithUnit(
  unitPrice: string | number,
  currency: string,
  unit: string,
  intlLocale: string = "vi-VN",
): string {
  const numericPrice = Number(unitPrice);
  const formatted = Number.isFinite(numericPrice)
    ? numericPrice.toLocaleString(intlLocale)
    : String(unitPrice);
  return `${formatted} ${currency} / ${unit}`;
}

export function formatSubtotalAmount(
  unitPrice: string | number,
  quantity: number,
  currency: string,
  intlLocale: string = "vi-VN",
): string {
  const numericPrice = Number(unitPrice);
  const total = Number.isFinite(numericPrice) ? numericPrice * quantity : 0;
  return `${total.toLocaleString(intlLocale)} ${currency}`;
}
