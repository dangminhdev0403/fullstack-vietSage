"use client";

import { useEffect, useState } from "react";
import { VsIcon } from "./vs-icon";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { runtimeConsole } from "@/core/logging/runtime-console";

export type DebtStatementData = {
  statementNumber: string;
  issuedAt: string;
  period: {
    id: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    total: number;
    subtotal?: number;
    dueAt?: string;
    settledAmount?: number;
    outstandingAmount?: number;
    paymentState?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    isOverdue?: boolean;
    debtNoticeCount?: number;
    debtNoticeSentAt?: string | null;
  };
  hotel: {
    id: string;
    name: string;
    code: string;
    address?: string | null;
    phoneNumber?: string | null;
    tenantId: string;
    tenantName?: string;
  };
  contract: {
    id: string;
    status: string;
    pricingModel: string;
    roomDayUnitPrice: number;
    currency: string;
    billableDaysCount: number;
  };
  lineItems?: Array<{
    description: string;
    pricingModel: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    currency: string;
  }>;
  adjustments?: Array<{
    id: string;
    reasonCode: string;
    amount: number;
    currency: string;
    note?: string;
  }>;
  noticeHistory: Array<{
    id: string;
    noticeCount: number;
    channel: string;
    issuedAt: string;
    actorName?: string;
    note?: string;
  }>;
  platformBankInfo: {
    bankName: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    transferMemo: string;
  } | null;
};

interface DebtStatementModalProps {
  periodId: string;
  isOpen: boolean;
  onClose: () => void;
  apiPathPrefix?: "admin" | "owner";
}

export function DebtStatementModal({
  periodId,
  isOpen,
  onClose,
  apiPathPrefix = "admin",
}: DebtStatementModalProps) {
  const [statement, setStatement] = useState<DebtStatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !periodId) return;

    let isMounted = true;

    async function loadStatement() {
      try {
        const path =
          apiPathPrefix === "admin"
            ? `/api/admin/platform-billing/periods/${periodId}/statement`
            : `/api/owner/platform-billing/periods/${periodId}/statement`;

        const res = await requestInternalApiEnvelope<DebtStatementData>(path, {
          method: "GET",
        });

        if (isMounted) {
          if (res.data) {
            setStatement(res.data);
          } else {
            setError("Không nhận được dữ liệu phiếu báo công nợ.");
          }
        }
      } catch (err: unknown) {
        runtimeConsole.error(err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Lỗi tải phiếu báo nợ");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadStatement();
    return () => {
      isMounted = false;
    };
  }, [isOpen, periodId, apiPathPrefix]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyMemo = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-3 sm:p-5 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="statement-dialog-title"
    >
      <div className="relative w-full max-w-3xl rounded-3xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 my-auto overflow-hidden">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold text-base">
            <VsIcon
              name="receipt_long"
              className="text-xl text-emerald-600 dark:text-emerald-400"
            />
            <span id="statement-dialog-title">
              Phiếu báo công nợ &amp; đối soát cước phí VietSage
            </span>
          </div>
          <div className="flex items-center gap-2">
            {statement && (
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white min-h-11 px-3 py-2 text-base font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <VsIcon name="print" className="text-base" />
                <span>In phiếu</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng bảng đối soát"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <VsIcon name="close" className="text-xl" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="max-h-[80vh] overflow-y-auto p-6 sm:p-8 space-y-6">
          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-flex h-10 w-10 animate-spin items-center justify-center rounded-full border-4 border-emerald-500 border-t-transparent text-emerald-500"></div>
              <p className="mt-3 text-sm font-semibold text-slate-500">
                Đang chuẩn bị bảng kê đối soát công nợ...
              </p>
            </div>
          ) : error || !statement ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">
                {error || "Không tìm thấy dữ liệu"}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header Statement Document Style */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-extrabold text-sm">
                      VS
                    </span>
                    <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                      VietSage Platform
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    Cổng dịch vụ quản trị &amp; vận hành khách sạn thông minh
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="inline-block font-mono text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
                    {statement.statementNumber}
                  </span>
                  <p className="text-sm text-slate-500 mt-1">
                    Ngày tạo bảng:{" "}
                    {new Date(statement.issuedAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>
              </div>

              {/* Recipient / Hotel details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-5 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="space-y-1">
                  <p className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    Đơn vị tiếp nhận (Khách sạn)
                  </p>
                  <p className="text-base font-extrabold text-slate-900 dark:text-white">
                    {statement.hotel.name} ({statement.hotel.code})
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Pháp nhân:{" "}
                    <strong>
                      {statement.hotel.tenantName || "Chủ đơn vị"}
                    </strong>
                  </p>
                  {statement.hotel.address && (
                    <p className="text-sm text-slate-500">
                      Địa chỉ: {statement.hotel.address}
                    </p>
                  )}
                </div>
                <div className="space-y-1 md:text-right">
                  <p className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    Thời gian kỳ cước đối soát
                  </p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {new Date(statement.period.periodStart).toLocaleDateString(
                      "vi-VN",
                    )}{" "}
                    —{" "}
                    {new Date(statement.period.periodEnd).toLocaleDateString(
                      "vi-VN",
                    )}
                  </p>
                  <div className="mt-1 flex md:justify-end gap-1.5 items-center">
                    <span className="text-sm text-slate-500">
                      Hạn thanh toán:
                    </span>
                    <strong className="text-xs font-bold text-slate-900 dark:text-white">
                      {statement.period.dueAt
                        ? new Date(statement.period.dueAt).toLocaleDateString(
                            "vi-VN",
                          )
                        : "Theo thỏa thuận"}
                    </strong>
                    {statement.period.isOverdue && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-sm font-extrabold text-red-800 dark:bg-red-950 dark:text-red-300">
                        Quá hạn
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Statement Breakdown Table */}
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100/80 text-sm font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-5 py-3">Hạng mục dịch vụ</th>
                      <th className="px-5 py-3 text-center">Số lượng</th>
                      <th className="px-5 py-3 text-right">Đơn giá</th>
                      <th className="px-5 py-3 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                    {statement.lineItems && statement.lineItems.length > 0 ? (
                      statement.lineItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-5 py-4">
                            <p className="font-bold text-slate-900 dark:text-white">
                              {item.description}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-center font-mono font-bold text-slate-900 dark:text-white">
                            {item.quantity} ngày
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                            {item.unitPrice.toLocaleString("vi-VN")}
                            {item.pricingModel === "PERCENTAGE"
                              ? "%"
                              : ` ${item.currency}`}
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                            {item.amount.toLocaleString("vi-VN")}{" "}
                            {item.currency}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-900 dark:text-white">
                            Phí sử dụng nền tảng VietSage SaaS
                          </p>
                          <p className="text-sm text-slate-500 mt-0.5">
                            Tính theo số ngày phòng vận hành thực tế trong kỳ
                          </p>
                        </td>
                        <td className="px-5 py-4 text-center font-mono font-bold text-slate-900 dark:text-white">
                          {statement.contract.billableDaysCount} ngày
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                          {statement.contract.roomDayUnitPrice.toLocaleString(
                            "vi-VN",
                          )}{" "}
                          {statement.contract.currency}
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                          {(
                            statement.period.subtotal ?? statement.period.total
                          ).toLocaleString("vi-VN")}{" "}
                          {statement.contract.currency}
                        </td>
                      </tr>
                    )}
                    {statement.adjustments &&
                      statement.adjustments.length > 0 &&
                      statement.adjustments.map((adj) => (
                        <tr
                          key={adj.id}
                          className="bg-amber-50/50 dark:bg-amber-950/20"
                        >
                          <td
                            colSpan={3}
                            className="px-5 py-3 text-sm font-semibold text-amber-900 dark:text-amber-200"
                          >
                            Điều chỉnh cước: {adj.reasonCode}{" "}
                            {adj.note ? `(${adj.note})` : ""}
                          </td>
                          <td className="px-5 py-3 text-right font-mono font-bold text-amber-700 dark:text-amber-300">
                            {adj.amount > 0
                              ? `+${adj.amount.toLocaleString("vi-VN")}`
                              : adj.amount.toLocaleString("vi-VN")}{" "}
                            {adj.currency}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
                    <tr className="border-t border-slate-200 dark:border-slate-800">
                      <td
                        colSpan={3}
                        className="px-5 py-3 text-right text-xs font-bold text-slate-600 dark:text-slate-300"
                      >
                        Tổng phí kỳ hóa đơn:
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                        {statement.period.total.toLocaleString("vi-VN")}{" "}
                        {statement.contract.currency}
                      </td>
                    </tr>
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-2.5 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        Đã thanh toán (Settled):
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                        -
                        {(statement.period.settledAmount ?? 0).toLocaleString(
                          "vi-VN",
                        )}{" "}
                        {statement.contract.currency}
                      </td>
                    </tr>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-amber-500/10 text-base">
                      <td
                        colSpan={3}
                        className="px-5 py-3.5 text-right font-extrabold text-amber-900 dark:text-amber-200"
                      >
                        DƯ NỢ CÒN LẠI PHẢI THANH TOÁN:
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-lg font-black text-amber-600 dark:text-amber-400">
                        {(
                          statement.period.outstandingAmount ?? 0
                        ).toLocaleString("vi-VN")}{" "}
                        {statement.contract.currency}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Payment Details Box (rendered only if bank info is available) */}
              {statement.platformBankInfo && (
                <div className="rounded-2xl border border-emerald-300/80 bg-emerald-50/70 p-5 dark:border-emerald-800/60 dark:bg-emerald-950/30 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-extrabold text-sm">
                    <VsIcon
                      name="account_balance"
                      className="text-xl text-emerald-600 dark:text-emerald-400"
                    />
                    <span>Thông tin chuyển khoản thanh toán VietSage SaaS</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700 dark:text-slate-300">
                    <div>
                      <span className="text-slate-500 block">Ngân hàng:</span>
                      <strong className="font-bold text-slate-900 dark:text-white">
                        {statement.platformBankInfo.bankName}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">
                        Số tài khoản thụ hưởng:
                      </span>
                      <strong className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">
                        {statement.platformBankInfo.accountNumber}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">
                        Tên chủ tài khoản:
                      </span>
                      <strong className="font-bold text-slate-900 dark:text-white">
                        {statement.platformBankInfo.accountName}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">
                        Nội dung chuyển khoản (Memo):
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono font-black text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-300 dark:border-slate-700">
                          {statement.platformBankInfo.transferMemo}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyMemo(
                              statement.platformBankInfo!.transferMemo,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95"
                        >
                          <VsIcon
                            name={copiedMemo ? "check" : "content_copy"}
                            className="text-xs"
                          />
                          <span>{copiedMemo ? "Đã chép" : "Sao chép"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Debt Notice History */}
              {statement.noticeHistory &&
                statement.noticeHistory.length > 0 && (
                  <div className="space-y-2 border-t border-slate-200/80 pt-4 dark:border-slate-800">
                    <p className="text-sm font-bold uppercase tracking-wider text-slate-500">
                      Lịch sử nhắc nợ thủ công ({statement.noticeHistory.length}{" "}
                      lần)
                    </p>
                    <div className="space-y-1.5">
                      {statement.noticeHistory.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-center justify-between rounded-xl bg-slate-100/70 px-3.5 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-400"
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-800 dark:text-slate-200">
                              Lần {h.noticeCount}:
                            </span>
                            <span>
                              {h.note || "Đã ghi nhận nhắc nợ thủ công"}
                            </span>
                          </span>
                          <span className="font-mono text-sm text-slate-500">
                            {new Date(h.issuedAt).toLocaleString("vi-VN")} —{" "}
                            {h.actorName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
