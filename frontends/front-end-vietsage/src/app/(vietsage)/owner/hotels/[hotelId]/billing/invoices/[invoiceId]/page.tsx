import Link from "next/link";

import { auth } from "@/auth";
import { billingService } from "@/features/billing/service/billing-service-instance";
import type { InvoiceDetail, MoneyValue } from "@/features/billing/types/billing-contract";
import { formatDateTime, formatMoney } from "@/features/billing/utils/money";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import { readServerSessionTokens } from "@/lib/server-session-tokens";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

import { OwnerShell } from "../../../../../_components/owner-shell";
import { InvoicePrintButton } from "./invoice-print-button";

type PageProps = {
  params:
    | Promise<{ hotelId: string; invoiceId: string }>
    | { hotelId: string; invoiceId: string };
};

const invoiceStatusLabels: Record<string, string> = {
  DRAFT: "Bản nháp",
  ISSUED: "Đã phát hành",
  PAID: "Đã thanh toán",
  PARTIALLY_PAID: "Thanh toán một phần",
  VOID: "Đã hủy",
  CANCELLED: "Đã hủy",
};

const folioStatusLabels: Record<string, string> = {
  OPEN: "Đang mở",
  CHECKOUT_PENDING: "Đã đóng",
  CLOSED: "Đã đóng",
  VOID: "Đã đóng",
};

const itemTypeLabels: Record<string, string> = {
  ROOM_CHARGE: "Tiền phòng",
  SERVICE: "Dịch vụ",
};

function labelStatus(labels: Record<string, string>, status?: string | null): string {
  if (!status) return "-";
  return labels[status] ?? status;
}

function labelItemType(type: string): string {
  return itemTypeLabels[type] ?? type;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function sumMoney(values: MoneyValue[]): number {
  return values.reduce<number>((total, value) => {
    const amount = typeof value === "number" ? value : Number(value);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function InvoiceInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] font-bold leading-5 text-slate-950">{value}</dd>
    </div>
  );
}

function InvoiceDetailView({ detail }: { detail: InvoiceDetail }) {
  const { invoice, folio, stay, items, payments } = detail;
  const currency = invoice.currency;
  const paidTotal = sumMoney(payments.map((payment) => payment.paidAmount ?? payment.amount));

  return (
    <article className="invoice-a4 mx-auto w-full max-w-[794px] overflow-hidden bg-white text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.12)] print:shadow-none">
      <header className="invoice-section border-b border-slate-200 px-8 py-7 print:px-0 print:pt-0">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">VietSage Hotel Invoice</p>
            <h1 className="mt-2 text-[30px] font-black leading-none tracking-[-0.02em] text-slate-950">
              {invoice.invoiceNumber}
            </h1>
            <p className="mt-2 text-[13px] font-semibold text-slate-600">
              Phòng {stay.roomNumber ?? "-"} · {stay.guestName ?? "Khách lưu trú"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left sm:min-w-44 sm:text-right print:bg-white">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Trạng thái hóa đơn</p>
            <p className="mt-1 text-lg font-black text-emerald-800">{labelStatus(invoiceStatusLabels, invoice.status)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(invoice.issuedAt)}</p>
          </div>
        </div>
      </header>

      <section className="invoice-section grid gap-5 border-b border-slate-200 px-8 py-5 md:grid-cols-[1fr_240px] print:grid-cols-[1fr_220px] print:px-0">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
          <InvoiceInfo label="Folio" value={folio.folioNumber} />
          <InvoiceInfo label="Trạng thái folio" value={labelStatus(folioStatusLabels, folio.status)} />
          <InvoiceInfo label="Khách" value={stay.guestName ?? "Khách lưu trú"} />
          <InvoiceInfo label="Phòng" value={stay.roomNumber ?? "-"} />
          <InvoiceInfo label="Check-in" value={formatDateTime(stay.checkInAt)} />
          <InvoiceInfo label="Check-out" value={formatDateTime(stay.checkOutAt)} />
          <InvoiceInfo label="Tiền tệ" value={currency} />
        </dl>

        <dl className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm print:bg-white">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">Tạm tính</dt>
            <dd className="font-bold">{formatMoney(invoice.subtotalAmount, currency)}</dd>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <dt className="text-slate-600">Thuế</dt>
            <dd className="font-bold">{formatMoney(invoice.taxAmount, currency)}</dd>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <dt className="text-slate-600">Giảm giá</dt>
            <dd className="font-bold">{formatMoney(invoice.discountAmount, currency)}</dd>
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <div className="flex justify-between gap-4 text-base">
              <dt className="font-black">Tổng</dt>
              <dd className="font-black text-emerald-800">{formatMoney(invoice.totalAmount, currency)}</dd>
            </div>
          </div>
        </dl>
      </section>

      <section className="invoice-section px-8 py-5 print:px-0">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Dịch vụ và chi phí</p>
            <h2 className="mt-0.5 text-lg font-black text-slate-950">Chi tiết dòng hóa đơn</h2>
          </div>
          <span className="text-xs font-bold text-slate-500">{items.length} dòng</span>
        </div>

        <table className="invoice-items-table w-full table-fixed border-collapse text-[11px]">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[11%]" />
            <col className="w-[6%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead>
            <tr className="border-y border-slate-300 bg-slate-100 text-[10px] uppercase tracking-[0.04em] text-slate-600 print:bg-white">
              <th className="px-2 py-2 text-left">Dịch vụ</th>
              <th className="px-2 py-2 text-left">Loại</th>
              <th className="px-1 py-2 text-center">SL</th>
              <th className="px-2 py-2 text-right">Đơn giá</th>
              <th className="px-2 py-2 text-right">Tạm tính</th>
              <th className="px-2 py-2 text-right">Thuế</th>
              <th className="px-2 py-2 text-right">Giảm</th>
              <th className="px-2 py-2 text-right">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="invoice-table-row border-b border-slate-200 align-top">
                <td className="break-words px-2 py-2 font-bold leading-4 text-slate-950">{item.name}</td>
                <td className="break-words px-2 py-2 leading-4 text-slate-600">{labelItemType(item.type)}</td>
                <td className="px-1 py-2 text-center font-semibold">{formatQuantity(item.quantity)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMoney(item.unitPrice, currency)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMoney(item.subtotal, currency)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMoney(item.taxAmount, currency)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMoney(item.discountAmount, currency)}</td>
                <td className="px-2 py-2 text-right font-black tabular-nums">{formatMoney(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">Chưa có dòng hóa đơn.</div>
        ) : null}
      </section>

      <section className="invoice-section grid gap-5 border-t border-slate-200 px-8 py-5 md:grid-cols-[1fr_260px] print:grid-cols-[1fr_240px] print:px-0">
        <div>
          <h2 className="text-base font-black text-slate-950">Thanh toán</h2>
          {payments.length ? (
            <table className="mt-3 w-full table-fixed border-collapse text-[11px]">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[22%]" />
                <col className="w-[28%]" />
                <col className="w-[26%]" />
              </colgroup>
              <thead>
                <tr className="border-y border-slate-300 bg-slate-100 text-[10px] uppercase tracking-[0.04em] text-slate-600 print:bg-white">
                  <th className="px-2 py-2 text-left">Phương thức</th>
                  <th className="px-2 py-2 text-left">Trạng thái</th>
                  <th className="px-2 py-2 text-right">Đã trả</th>
                  <th className="px-2 py-2 text-left">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="invoice-table-row border-b border-slate-200">
                    <td className="break-words px-2 py-2 font-bold">{payment.method}</td>
                    <td className="break-words px-2 py-2 text-slate-600">{payment.status}</td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">{formatMoney(payment.paidAmount ?? payment.amount, currency)}</td>
                    <td className="px-2 py-2 text-slate-600">{formatDateTime(payment.confirmedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="mt-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">Chưa có thanh toán.</div>
          )}
        </div>

        <dl className="self-start rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm print:bg-white">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">Tổng hóa đơn</dt>
            <dd className="font-black tabular-nums">{formatMoney(invoice.totalAmount, currency)}</dd>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <dt className="text-slate-600">Đã thanh toán</dt>
            <dd className="font-black tabular-nums">{formatMoney(invoice.paidAmount ?? paidTotal, currency)}</dd>
          </div>
          <div className="mt-3 border-t border-slate-300 pt-3">
            <div className="flex justify-between gap-4 text-base">
              <dt className="font-black">Còn lại</dt>
              <dd className="font-black text-emerald-800 tabular-nums">{formatMoney(invoice.balanceAmount, currency)}</dd>
            </div>
          </div>
        </dl>
      </section>
    </article>
  );
}

export const dynamic = "force-dynamic";

export default async function OwnerInvoiceDetailPage({ params }: PageProps) {
  const { hotelId, invoiceId } = await Promise.resolve(params);
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const callbackUrl = `/owner/hotels/${hotelId}/billing/invoices/${invoiceId}` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  const sidebarItems = buildWorkspaceNavigationForContext({ ...workspaceContext, hotelId });

  const invoiceDetail = await authorizedApi("get owner invoice detail", (accessToken) =>
    billingService.getInvoiceDetail(hotelId, invoiceId, { accessToken }),
  );

  return (
    <OwnerShell activePath={`/owner/hotels/${hotelId}/billing`} navItems={sidebarItems} subtitle="Chi tiết hóa đơn">
      <div className="space-y-6 print:space-y-0">
        <div className="mx-auto flex w-full max-w-[794px] flex-col justify-between gap-4 print:hidden md:flex-row md:items-end">
          <div>
            <Link href={`/owner/hotels/${hotelId}/billing`} className="text-sm font-black text-[var(--primary)] hover:underline">
              Quay lại folio
            </Link>
            <h1 className="mt-2 text-3xl font-black text-[var(--on-surface)]">Hóa đơn {invoiceDetail.invoice.invoiceNumber}</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-variant)]">
              Nút xuất sẽ in trực tiếp nội dung hóa đơn đang hiển thị.
            </p>
          </div>
          <InvoicePrintButton />
        </div>

        <InvoiceDetailView detail={invoiceDetail} />
      </div>
    </OwnerShell>
  );
}
