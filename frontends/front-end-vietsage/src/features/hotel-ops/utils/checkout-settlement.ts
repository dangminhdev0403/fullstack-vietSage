type InvoiceBalance = { id: string; balanceAmount: number | string };

export async function settleCheckout(input: {
  folioId?: string;
  amount: number;
  autoMarkReady: boolean;
  issueInvoice: () => Promise<InvoiceBalance>;
  confirmPayment: (invoiceId: string, amount?: number) => Promise<{ invoice: { status: string; balanceAmount: number | string } }>;
  checkOutStay: () => Promise<unknown>;
  markRoomReady: () => Promise<unknown>;
}) {
  if (input.folioId) {
    const invoice = await input.issueInvoice();
    const balance = Number(invoice.balanceAmount);
    if (!Number.isFinite(balance) || balance < 0 || (balance > 0 && input.amount !== balance)) {
      throw new Error("CHECKOUT_BALANCE_CHANGED");
    }
    const result = await input.confirmPayment(invoice.id, balance > 0 ? balance : undefined);
    if (result.invoice.status !== "PAID" || Number(result.invoice.balanceAmount) !== 0) {
      throw new Error("CHECKOUT_NOT_SETTLED");
    }
  } else {
    await input.checkOutStay();
  }

  if (input.autoMarkReady) {
    try {
      await input.markRoomReady();
      return { roomReady: true };
    } catch {
      // Checkout is confirmed, but readiness is a separate operation.
      return { roomReady: false };
    }
  }
  return { roomReady: false };
}

export function checkoutErrorMessage(error: unknown): string {
  let code = "";
  if (error instanceof Error) {
    code = error.message;
  }
  if (error && typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    const data = errObj.data as Record<string, unknown> | undefined;
    const errData = data?.error as Record<string, unknown> | undefined;
    if (typeof data?.code === "string") code = data.code;
    else if (typeof errData?.code === "string") code = errData.code;
    else if (typeof errObj.code === "string") code = errObj.code;
  }
  const messages: Record<string, string> = {
    CHECKOUT_BALANCE_CHANGED: "Số dư hóa đơn đã thay đổi. Vui lòng tải lại thông tin thu ngân trước khi thanh toán.",
    CHECKOUT_NOT_SETTLED: "Hóa đơn chưa được tất toán. Vui lòng kiểm tra kết quả thanh toán trước khi thử lại.",
    RECEIVABLE_AMOUNT_MISMATCH: "Số dư công nợ đã thay đổi. Vui lòng tải lại thông tin.",
    NO_OUTSTANDING_DEBT: "Lượt lưu trú không còn số dư cần chuyển công nợ.",
    FOLIO_NOT_TRANSFERABLE: "Hồ sơ thanh toán đã đóng hoặc bị hủy. Vui lòng kiểm tra tại Thu ngân.",
    INVOICE_FOLIO_TOTAL_MISMATCH: "Hóa đơn chưa khớp các khoản phí hiện tại. Vui lòng kiểm tra tại Thu ngân.",
    INVALID_RECEIVABLE_ASSIGNEE: "Nhân viên được chọn không còn được phân công cho khách sạn này.",
  };
  return messages[code] ?? (error instanceof Error && messages[error.message] ? messages[error.message] : "Không thể hoàn tất thao tác. Vui lòng tải lại thông tin và kiểm tra kết quả tại Thu ngân trước khi thử lại.");
}
