/**
 * Utility functions to handle generic pricing units and customer-facing quantity formatting
 * for External Marketplace Services.
 */

import type {
  MarketplaceOrder,
  MarketplaceOrderFinancials,
  MarketplaceOrderItem,
} from "../types/marketplace-contract";

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

export function isTerminalOrderStatus(status?: string | null): boolean {
  if (!status) return false;
  const upper = status.toUpperCase().trim();
  return (
    upper === "COMPLETED" ||
    upper === "CANCELLED" ||
    upper === "REJECTED" ||
    upper === "EXPIRED" ||
    upper === "CLOSED"
  );
}

export function getCanonicalOrderItems(
  order?: Partial<MarketplaceOrder> | null,
): MarketplaceOrderItem[] {
  if (!order) return [];
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items;
  }

  const quantity = Number(order.quantity) || 1;
  const unitPrice =
    order.unitPriceSnapshot != null
      ? Number(order.unitPriceSnapshot)
      : order.totalAmount != null
      ? Number(order.totalAmount) / quantity
      : 0;

  const pricingUnit =
    order.pricingUnitSnapshot ||
    order.pricingUnit ||
    order.unitSnapshot ||
    getServicePricingUnit(order as any);

  return [
    {
      id: order.id,
      serviceName: order.serviceNameSnapshot || "Dịch vụ đối tác",
      quantity,
      unitPrice,
      pricingUnit,
      totalAmount: order.totalAmount ?? unitPrice * quantity,
      currency: order.currency || "VND",
      serviceTenantId:
        order.serviceTenantId ?? (order.serviceTenant as any)?.id,
      serviceTenantName:
        order.serviceTenant?.serviceProfile?.displayName ||
        "Đối tác dịch vụ",
      serviceMode: order.serviceModeSnapshot,
    },
  ];
}

export function getPartnerAuthorizedOrderItems(
  order?: Partial<MarketplaceOrder> | null,
  partnerIdentity?:
    | { id?: string; displayName?: string }
    | string
    | null,
): MarketplaceOrderItem[] {
  const allItems = getCanonicalOrderItems(order);
  if (!partnerIdentity) return allItems;

  const targetId =
    typeof partnerIdentity === "string" ? partnerIdentity : partnerIdentity.id;
  const targetName =
    typeof partnerIdentity === "string"
      ? partnerIdentity.toLowerCase().trim()
      : partnerIdentity.displayName?.toLowerCase().trim();

  const matched = allItems.filter((item) => {
    if (targetId && item.serviceTenantId && item.serviceTenantId === targetId) {
      return true;
    }
    if (
      targetName &&
      item.serviceTenantName &&
      item.serviceTenantName.toLowerCase().trim() === targetName
    ) {
      return true;
    }
    return false;
  });

  if (matched.length > 0) {
    return matched;
  }

  // Fallback if tenant info matches order level or scoped return
  const orderTenantId =
    order?.serviceTenantId ?? (order?.serviceTenant as any)?.id;
  const orderTenantName =
    order?.serviceTenant?.serviceProfile?.displayName?.toLowerCase().trim();

  if (
    (targetId && orderTenantId && orderTenantId === targetId) ||
    (targetName && orderTenantName && orderTenantName === targetName)
  ) {
    return allItems;
  }

  return allItems;
}

export function calculateOrderFinancials(
  order?: Partial<MarketplaceOrder> | null,
  itemsOverride?: MarketplaceOrderItem[],
): MarketplaceOrderFinancials {
  const currency = order?.currency || "VND";
  const items = itemsOverride ?? getCanonicalOrderItems(order);

  // If specific items are provided (e.g. Partner authorized items), calculate value strictly from these items:
  if (itemsOverride) {
    const partnerSubtotal = items.reduce((sum, item) => {
      const price = Number(item.unitPrice) || 0;
      const qty = Number(item.quantity) || 1;
      return sum + price * qty;
    }, 0);
    const hotelFee = Math.round(partnerSubtotal * 0.10);
    const customerTotal = partnerSubtotal + hotelFee;
    return {
      partnerSubtotal,
      hotelFee,
      customerTotal,
      currency,
    };
  }

  // Otherwise, for Hotel full order view, prioritize backend snapshot totals if present:
  let partnerSubtotal =
    order?.partnerSubtotal != null
      ? Number(order.partnerSubtotal)
      : 0;

  if (partnerSubtotal === 0 && items.length > 0) {
    partnerSubtotal = items.reduce((sum, item) => {
      const price = Number(item.unitPrice) || 0;
      const qty = Number(item.quantity) || 1;
      return sum + price * qty;
    }, 0);
  } else if (partnerSubtotal === 0 && order?.totalAmount != null) {
    partnerSubtotal = Number(order.totalAmount);
  }

  const hotelFee =
    order?.hotelFee != null
      ? Number(order.hotelFee)
      : Math.round(partnerSubtotal * 0.10);

  const customerTotal =
    order?.customerTotal != null
      ? Number(order.customerTotal)
      : order?.totalAmount != null
      ? Number(order.totalAmount)
      : partnerSubtotal + hotelFee;

  return {
    partnerSubtotal,
    hotelFee,
    customerTotal,
    currency,
  };
}
