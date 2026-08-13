import Link from "next/link";

import { auth } from "@/auth";
import { billingService } from "@/features/billing/service/billing-service-instance";
import type { InvoiceDetail, MoneyValue } from "@/features/billing/types/billing-contract";
import { formatDateTime, formatMoney } from "@/features/billing/utils/money";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";

import { InvoicePrintButton } from "./invoice-print-button";
import { InvoiceActions } from "@/app/(vietsage)/hotels/[hotelId]/billing/invoices/[invoiceId]/invoice-actions";

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
  CHECKOUT_PENDING: "Chờ checkout",
  CLOSED: "Đã đóng",
  VOID: "Đã hủy",
};

const itemTypeLabels: Record<string, string> = {
  ROOM_CHARGE: "Tiền phòng",
  SERVICE: "Dịch vụ",
  MANUAL_CHARGE: "Phụ thu",
  DISCOUNT: "Giảm giá",
  ADJUSTMENT: "Điều chỉnh",
};

const paymentMethodLabels: Record<string, string> = {
  CASH: "Tiền mặt",
  CARD: "Thẻ ngân hàng / POS",
  BANK_TRANSFER: "Chuyển khoản",
  MOMO: "Ví MoMo",
  VNPAY: "VNPAY",
  STRIPE: "Thẻ quốc tế (Stripe)",
  MANUAL: "Xác nhận tại lễ tân",
  MANUAL_FRONTDESK: "Xác nhận tại lễ tân",
};

const paymentStatusLabels: Record<string, string> = {
  PENDING: "Đang xử lý",
  PROCESSING: "Đang xử lý",
  SUCCEEDED: "Thành công",
  PAID: "Đã thanh toán",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
  EXPIRED: "Hết hạn",
  REFUNDED: "Đã hoàn tiền",
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

function isExternalInvoiceItem(item: InvoiceDetail["items"][number]): boolean {
  if (item.type === "ROOM_CHARGE") return false;
  if (item.serviceSource === "EXTERNAL") return true;
  if (item.partnerName && item.partnerName !== "Khách sạn") return true;
  const name = String(item.name ?? "");
  const desc = String(item.description ?? "");
  return /đối tác|bên ngoài|marketplace|external|massage|spa/i.test(name) || /đối tác|bên ngoài|marketplace|external|massage|spa/i.test(desc);
}

function InvoiceDetailView({ detail }: { detail: InvoiceDetail }) {
  const { invoice, folio, stay, items, payments } = detail;
  const currency = invoice.currency;
  const paidTotal = sumMoney(payments.map((payment) => payment.paidAmount ?? payment.amount));

  const hotelServicesTotal = items
    .filter((item) => !isExternalInvoiceItem(item))
    .reduce((sum, item) => sum + Number(item.total), 0);

  const externalServicesTotal = items
    .filter((item) => isExternalInvoiceItem(item))
    .reduce((sum, item) => sum + Number(item.total), 0);

  return (
    <article className="invoice-a4 mx-auto w-full max-w-[794px] overflow-hidden bg-white text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.12)] print:shadow-none">
      <header className="invoice-section border-b border-slate-200 px-8 py-7 print:px-0 print:pt-0">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">HÓA ĐƠN KHÁCH SẠN VIETSAGE</p>
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
            <col className="w-[20%]" />
            <col className="w-[14%]" />
            <col className="w-[9%]" />
            <col className="w-[5%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="border-y border-slate-300 bg-slate-100 text-[10px] uppercase tracking-[0.04em] text-slate-600 print:bg-white">
              <th className="px-2 py-2 text-left">Dịch vụ</th>
              <th className="px-2 py-2 text-left">Phân loại nguồn</th>
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
            {items.map((item) => {
              const isExternal = isExternalInvoiceItem(item);
              return (
                <tr key={item.id} className="invoice-table-row border-b border-slate-200 align-top">
                  <td className="break-words px-2 py-2 font-bold leading-4 text-slate-950">
                    <div>{item.name}</div>
                    {item.description ? <div className="mt-0.5 text-[10px] font-normal leading-normal text-slate-500">{item.description}</div> : null}
                  </td>
                  <td className="break-words px-2 py-2 leading-4">
                    {isExternal ? (
                      <div className="space-y-0.5">
                        <span className="inline-block rounded border border-purple-300 bg-purple-100 px-1.5 py-0.5 text-[10px] font-extrabold text-purple-900">
                          🌐 Ngoài khách sạn
                        </span>
                        {item.partnerName ? (
                          <div className="text-[10px] font-semibold text-purple-800">🤝 {item.partnerName}</div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="inline-block rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-900">
                        🏨 Trong khách sạn
                      </span>
                    )}
                  </td>
                  <td className="break-words px-2 py-2 leading-4 text-slate-600">{labelItemType(item.type)}</td>
                  <td className="px-1 py-2 text-center font-semibold">{formatQuantity(item.quantity)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatMoney(item.unitPrice, currency)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatMoney(item.subtotal, currency)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatMoney(item.taxAmount, currency)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatMoney(item.discountAmount, currency)}</td>
                  <td className="px-2 py-2 text-right font-black tabular-nums">{formatMoney(item.total, currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">Chưa có dòng hóa đơn.</div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs print:border-slate-300 print:bg-white">
              <div className="flex items-center justify-between font-black text-emerald-950">
                <span>🏨 Tổng dịch vụ trong khách sạn</span>
                <span className="text-sm tabular-nums">{formatMoney(hotelServicesTotal, currency)}</span>
              </div>
              <p className="mt-1 text-[11px] text-emerald-700">Bao gồm tiền phòng, dịch vụ nội bộ & các khoản thu trực tiếp từ KS</p>
            </div>
            <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3.5 text-xs print:border-slate-300 print:bg-white">
              <div className="flex items-center justify-between font-black text-purple-950">
                <span>🌐 Tổng dịch vụ ngoài khách sạn (Đối tác)</span>
                <span className="text-sm tabular-nums">{formatMoney(externalServicesTotal, currency)}</span>
              </div>
              <p className="mt-1 text-[11px] text-purple-700">Các dịch vụ liên kết đối tác bên ngoài / thu hộ đối tác dịch vụ</p>
            </div>
          </div>
        )}
      </section>

      <section className="invoice-section grid gap-5 border-t border-slate-200 px-8 py-5 md:grid-cols-[1fr_260px] print:grid-cols-[1fr_240px] print:px-0">
        <div>
          <h2 className="text-base font-black text-slate-950">Thanh toán</h2>
          {payments.length ? (
            <table className="mt-3 w-full table-fixed border-collapse text-[11px]">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[22%]" />
                <col className="w-[24%]" />
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
                    <td className="break-words px-2 py-2 font-bold">{labelStatus(paymentMethodLabels, payment.method)}</td>
                    <td className="break-words px-2 py-2 text-slate-600">{labelStatus(paymentStatusLabels, payment.status)}</td>
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
    const callbackUrl = `/owner/hotels/${hotelId}/billing/invoices/${invoiceId}` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
    
  const invoiceDetail = await authorizedApi("get owner invoice detail", (accessToken) =>
    billingService.getInvoiceDetail(hotelId, invoiceId, { accessToken }),
  );

  return (
    <>
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
          <div className="flex flex-wrap gap-2">
            <InvoiceActions
              hotelId={hotelId}
              invoiceId={invoiceId}
              isPaid={invoiceDetail.invoice.status === "PAID" || Number(invoiceDetail.invoice.balanceAmount ?? 0) <= 0}
              showPrint={false}
            />
            <InvoicePrintButton />
          </div>
        </div>

        <InvoiceDetailView detail={invoiceDetail} />
      </div>
    </>
  );
}
