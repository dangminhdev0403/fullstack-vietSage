import type { InvoiceDetail } from "../types/billing-contract";

export const itemTypeLabels: Record<string, string> = {
  ROOM_CHARGE: "Tiền phòng",
  SERVICE: "Dịch vụ",
  MANUAL_CHARGE: "Phụ thu",
  DISCOUNT: "Giảm giá",
  ADJUSTMENT: "Điều chỉnh",
};

export const paymentMethodLabels: Record<string, string> = {
  CASH: "Tiền mặt",
  CARD: "Thẻ ngân hàng / POS",
  BANK_TRANSFER: "Chuyển khoản",
  MOMO: "Ví MoMo",
  VNPAY: "VNPAY",
  STRIPE: "Thẻ quốc tế",
  MANUAL: "Xác nhận tại lễ tân",
  MANUAL_FRONTDESK: "Xác nhận tại lễ tân",
};

export const paymentStatusLabels: Record<string, string> = {
  PENDING: "Đang xử lý",
  PROCESSING: "Đang xử lý",
  SUCCEEDED: "Thành công",
  PAID: "Đã thanh toán",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
  EXPIRED: "Hết hạn",
  REFUNDED: "Đã hoàn tiền",
};

export function labelStatus(labels: Record<string, string>, status?: string | null): string {
  if (!status) return "-";
  return labels[status] ?? status;
}

export function isExternalInvoiceItem(item: InvoiceDetail["items"][number]): boolean {
  if (item.type === "ROOM_CHARGE" || item.type === "DISCOUNT") return false;
  if (item.serviceSource === "EXTERNAL") return true;
  if (item.partnerName && item.partnerName !== "Khách sạn") return true;
  const name = String(item.name ?? "");
  const desc = String(item.description ?? "");
  return /đối tác|bên ngoài|marketplace|external|massage|spa/i.test(name) || /đối tác|bên ngoài|marketplace|external|massage|spa/i.test(desc);
}
