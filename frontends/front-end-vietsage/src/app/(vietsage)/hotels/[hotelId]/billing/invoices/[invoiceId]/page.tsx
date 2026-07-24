import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { billingService } from "@/features/billing/service/billing-service-instance";
import { formatDateTime, formatMoney } from "@/features/billing/utils/money";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { InvoiceActions } from "./invoice-actions";

type PageProps = { params: Promise<{ hotelId: string; invoiceId: string }> | { hotelId: string; invoiceId: string } };
export const dynamic = "force-dynamic";

export default async function StaffInvoicePage({ params }: PageProps) {
  const { hotelId, invoiceId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/billing/invoices/${invoiceId}` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  if (!canUseHotelId(context, hotelId) || !context.permissions.includes("hotel.billing.view")) notFound();
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const detail = await authorizedApi("get staff invoice", (accessToken) =>
    billingService.getInvoiceDetail(hotelId, invoiceId, { accessToken }),
  );
  const { invoice, folio, stay, items, payments } = detail;
  const isPaid = invoice.status === "PAID" || Number(invoice.balanceAmount ?? 0) <= 0;

  return (
    <>
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-end sm:justify-between">
        <div><Link href={`/hotels/${hotelId}/billing`} className="text-sm font-bold text-[var(--primary)]">Quay lại thanh toán</Link><h1 className="mt-2 text-3xl font-black text-[var(--primary)]">Hóa đơn {invoice.invoiceNumber}</h1></div>
        <InvoiceActions hotelId={hotelId} invoiceId={invoiceId} isPaid={isPaid} />
      </div>

      <article className="invoice-a4 mx-auto w-full max-w-[850px] rounded-lg border border-slate-200 bg-white p-7 text-slate-950 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">VietSage Hotel Invoice</p><h2 className="mt-2 text-3xl font-black">{invoice.invoiceNumber}</h2><p className="mt-2 text-sm text-slate-600">Phòng {stay.roomNumber ?? "-"} · {stay.guestName ?? "Khách lưu trú"}</p></div>
          <div className="rounded-lg bg-slate-100 px-4 py-3"><p className="text-xs font-bold text-slate-500">Trạng thái</p><p className={`mt-1 font-black ${isPaid ? "text-emerald-700" : "text-amber-700"}`}>{isPaid ? "Đã thanh toán" : "Chờ thanh toán"}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(invoice.issuedAt)}</p></div>
        </header>

        <section className="grid gap-5 border-b border-slate-200 py-5 sm:grid-cols-2">
          <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Folio</dt><dd className="font-bold">{folio.folioNumber}</dd></div><div><dt className="text-xs text-slate-500">Khách</dt><dd className="font-bold">{stay.guestName ?? "-"}</dd></div><div><dt className="text-xs text-slate-500">Check-in</dt><dd className="font-bold">{formatDateTime(stay.checkInAt)}</dd></div><div><dt className="text-xs text-slate-500">Check-out</dt><dd className="font-bold">{formatDateTime(stay.checkOutAt)}</dd></div></dl>
          <dl className="rounded-lg bg-slate-50 p-4 text-sm"><div className="flex justify-between"><dt>Tạm tính</dt><dd className="font-bold">{formatMoney(invoice.subtotalAmount, invoice.currency)}</dd></div><div className="mt-2 flex justify-between"><dt>Thuế</dt><dd className="font-bold">{formatMoney(invoice.taxAmount, invoice.currency)}</dd></div><div className="mt-2 flex justify-between"><dt>Giảm giá</dt><dd className="font-bold">{formatMoney(invoice.discountAmount, invoice.currency)}</dd></div><div className="mt-3 flex justify-between border-t pt-3 text-lg"><dt className="font-black">Tổng</dt><dd className="font-black text-emerald-700">{formatMoney(invoice.totalAmount, invoice.currency)}</dd></div></dl>
        </section>

        <section className="py-5"><h3 className="text-lg font-black">Chi tiết chi phí</h3><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-slate-100"><tr><th className="p-2">Nội dung</th><th className="p-2">Loại</th><th className="p-2 text-right">SL</th><th className="p-2 text-right">Đơn giá</th><th className="p-2 text-right">Tổng</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="p-2 font-bold">{item.name}</td><td className="p-2">{item.type}</td><td className="p-2 text-right">{item.quantity}</td><td className="p-2 text-right">{formatMoney(item.unitPrice, invoice.currency)}</td><td className="p-2 text-right font-bold">{formatMoney(item.total, invoice.currency)}</td></tr>)}</tbody></table></div></section>

        <section className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2"><div><h3 className="font-black">Thanh toán</h3>{payments.length ? payments.map((payment) => <p key={payment.id} className="mt-2 text-sm">{payment.method} · {payment.status} · {formatMoney(payment.paidAmount, invoice.currency)}</p>) : <p className="mt-2 text-sm text-slate-500">Chưa ghi nhận thanh toán.</p>}</div><dl className="rounded-lg border p-4 text-sm"><div className="flex justify-between"><dt>Đã thanh toán</dt><dd className="font-bold">{formatMoney(invoice.paidAmount ?? 0, invoice.currency)}</dd></div><div className="mt-3 flex justify-between border-t pt-3"><dt className="font-black">Còn lại</dt><dd className="font-black text-emerald-700">{formatMoney(invoice.balanceAmount ?? invoice.totalAmount, invoice.currency)}</dd></div></dl></section>
      </article>
    </>
  );
}
