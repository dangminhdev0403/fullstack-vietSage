"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

type Props = {
  hotelId: string;
  invoiceId: string;
  isPaid: boolean;
  showPrint?: boolean;
};

export function InvoiceActions({ hotelId, invoiceId, isPaid, showPrint = true }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function collectPayment() {
    const result = await Swal.fire({
      title: "Xác nhận đã thu tiền",
      text: "Thao tác này sẽ đóng folio, check-out khách, tắt QR và chuyển phòng sang chờ dọn.",
      input: "select",
      inputOptions: { CASH: "Tiền mặt", BANK_TRANSFER: "Chuyển khoản", CARD: "Thẻ tại quầy", MANUAL: "Khác" },
      inputValue: "CASH",
      showCancelButton: true,
      confirmButtonText: "Đã thu đủ tiền",
      cancelButtonText: "Hủy",
    });
    if (!result.isConfirmed || !result.value) return;
    setSaving(true);
    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(invoiceId)}/manual-payment`,
        { method: "POST", body: { method: result.value } },
      );
      await Swal.fire({ icon: "success", title: "Checkout hoàn tất", text: "Hóa đơn đã thanh toán và phòng đang chờ dọn." });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể xác nhận thanh toán", text: error instanceof Error ? error.message : "Vui lòng kiểm tra lại." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {!isPaid ? <button type="button" disabled={saving} onClick={() => void collectPayment()} className="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang xử lý..." : "Xác nhận đã thu tiền"}</button> : <span className="rounded-xl bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-800">Đã thanh toán và checkout</span>}
      {showPrint ? <button type="button" onClick={() => window.print()} className="rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 text-sm font-bold text-[var(--primary)]">In hóa đơn</button> : null}
    </div>
  );
}
