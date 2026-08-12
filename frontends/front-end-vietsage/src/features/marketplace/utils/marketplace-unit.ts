/**
 * Utility functions to handle generic pricing units and customer-facing quantity formatting
 * for External Marketplace Services.
 */

export function getServicePricingUnit(item?: {
  unit?: string | null;
  unitSnapshot?: string | null;
  name?: string | null;
  serviceNameSnapshot?: string | null;
  category?: { name?: string; nameVi?: string } | null;
} | null): string {
  if (!item) return "lượt";
  const explicitUnit = item.unit || item.unitSnapshot;
  if (explicitUnit?.trim()) {
    return explicitUnit.trim().replace(/^\//, "").trim();
  }
  const text = `${item.name || item.serviceNameSnapshot || ""} ${item.category?.nameVi || item.category?.name || ""}`.toLowerCase();
  if (text.includes("người") || text.includes("khách") || text.includes("tour")) {
    return "người";
  }
  if (text.includes("vé")) return "vé";
  if (text.includes("xe") || text.includes("chuyến") || text.includes("đưa đón")) return "xe";
  if (text.includes("suất") || text.includes("phần") || text.includes("combo") || text.includes("món") || text.includes("ăn")) return "suất";
  if (text.includes("lượt") || text.includes("lần") || text.includes("giờ") || text.includes("phút") || text.includes("massage") || text.includes("spa")) return "lượt";
  if (text.includes("đơn") || text.includes("gói")) return "đơn";
  return "lượt";
}

export function formatQuantityWithUnit(quantity: number, unit: string): string {
  return `Số lượng: ${quantity} ${unit}`;
}

export function formatUnitPriceWithUnit(
  unitPrice: string | number,
  currency: string,
  unit: string,
): string {
  const formatted = Number(unitPrice).toLocaleString("vi-VN");
  return `${formatted} ${currency} / ${unit}`;
}

export function formatSubtotalAmount(
  unitPrice: string | number,
  quantity: number,
  currency: string,
): string {
  const total = Number(unitPrice) * quantity;
  return `${total.toLocaleString("vi-VN")} ${currency}`;
}
