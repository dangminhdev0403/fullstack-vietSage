"use client";

import { useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HttpError } from "@/core/http/http-error";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
} from "@/libs/swal";
import { useRevenueBook } from "../hooks/use-revenue-book";
import type {
  RevenueBook,
  RevenueBookCategory,
  RevenueBookEntry,
  RevenueBookQuery,
  RevenueBookSource,
  RevenuePaymentMethod,
  RevenueSettlementStatus,
} from "../types/revenue-book-contract";
import {
  ReportsGroupSegmentedBar,
  ReportsPrimaryMobileNav,
} from "./reports-navigation-bars";
import { addMoney } from "../utils/revenue-book-export";
import { RevenueBookDialog } from "./revenue-book-dialog";
import { RevenueBookSpreadsheet } from "./revenue-book-spreadsheet";
import {
  RevenueEntryDialog,
  REVENUE_METHODS,
  revenueButtonClass,
  revenueInputClass,
  revenuePrimaryClass,
} from "./revenue-entry-dialog";

function money(amount: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "VND" ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
function formatDateVi(value?: string) {
  if (!value) return "—";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
function errorMessage(error: unknown) {
  if (error instanceof HttpError && error.status >= 500)
    return "Không thể tải hoặc lưu sổ doanh thu. Vui lòng thử lại sau.";
  return error instanceof Error
    ? error.message
    : "Không thể thực hiện thao tác. Vui lòng thử lại.";
}
const sourceLabels: Record<RevenueBookSource, string> = {
  FOLIO: "Hóa đơn tự động",
  MANUAL: "Bổ sung",
  DEPOSIT: "Tiền cọc",
  RECEIVABLE: "Công nợ",
};

const CATEGORY_FILTER_OPTIONS: ReadonlyArray<{
  value: "" | RevenueBookCategory;
  label: string;
}> = [
  { value: "", label: "Tất cả" },
  { value: "ROOM", label: "Tiền phòng" },
  { value: "MINIBAR", label: "Minibar" },
  { value: "LAUNDRY", label: "Giặt ủi" },
  { value: "OTHER", label: "Dịch vụ khác" },
];

const PAYMENT_METHOD_FILTER_OPTIONS: ReadonlyArray<{
  value: "" | RevenuePaymentMethod;
  label: string;
}> = [
  { value: "", label: "Tất cả" },
  { value: "CASH", label: "Tiền mặt" },
  { value: "BANK_TRANSFER", label: "Chuyển khoản" },
  { value: "CARD", label: "Thẻ" },
  { value: "OTHER", label: "Khác" },
];

const SOURCE_FILTER_OPTIONS: ReadonlyArray<{
  value: "" | RevenueBookSource;
  label: string;
}> = [
  { value: "", label: "Tất cả" },
  { value: "FOLIO", label: "Hóa đơn tự động" },
  { value: "MANUAL", label: "Bổ sung" },
  { value: "DEPOSIT", label: "Tiền cọc" },
  { value: "RECEIVABLE", label: "Công nợ" },
];

const SETTLEMENT_FILTER_OPTIONS: ReadonlyArray<{
  value: "" | RevenueSettlementStatus;
  label: string;
}> = [
  { value: "", label: "Tất cả" },
  { value: "SETTLED", label: "Đã quyết toán" },
  { value: "UNPAID", label: "Còn phải thu" },
  { value: "OVERPAID", label: "Trả trước · Dư cọc" },
];

function parseFilterParam<T extends string>(
  raw: string | null,
  options: ReadonlyArray<{ value: "" | T }>,
): T | undefined {
  if (!raw) return undefined;
  return options.some((opt) => opt.value === raw) ? (raw as T) : undefined;
}

export function RevenueBookWorkspace({ hotelId }: { hotelId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const queryInput = useMemo<RevenueBookQuery>(
    () => ({
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      category: parseFilterParam(
        params.get("category"),
        CATEGORY_FILTER_OPTIONS,
      ),
      paymentMethod: parseFilterParam(
        params.get("paymentMethod"),
        PAYMENT_METHOD_FILTER_OPTIONS,
      ),
      source: parseFilterParam(params.get("source"), SOURCE_FILTER_OPTIONS),
      settlementStatus: parseFilterParam(
        params.get("settlementStatus"),
        SETTLEMENT_FILTER_OPTIONS,
      ),
    }),
    [params],
  );
  const query = useRevenueBook(hotelId, queryInput);
  const book = query.data;
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const rangeKey = `${queryInput.from ?? ""}:${queryInput.to ?? ""}`;
  const [previousRangeKey, setPreviousRangeKey] = useState(rangeKey);
  if (previousRangeKey !== rangeKey) {
    setPreviousRangeKey(rangeKey);
    setFrom(null);
    setTo(null);
  }
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    mode: "create" | "edit" | "collect";
    entry?: RevenueBookEntry;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const selected = book?.entries.find((entry) => entry.id === selectedId);
  const currency = book?.currency ?? "VND";
  const navFrom = queryInput.from ?? book?.from;
  const navTo = queryInput.to ?? book?.to;

  const activeFilterSummary = useMemo(() => {
    const labels: string[] = [];
    if (queryInput.category) {
      const label = CATEGORY_FILTER_OPTIONS.find(
        (opt) => opt.value === queryInput.category,
      )?.label;
      if (label) labels.push(`Loại: ${label}`);
    }
    if (queryInput.paymentMethod) {
      const label = PAYMENT_METHOD_FILTER_OPTIONS.find(
        (opt) => opt.value === queryInput.paymentMethod,
      )?.label;
      if (label) labels.push(`Kênh TT: ${label}`);
    }
    if (queryInput.source) {
      const label = SOURCE_FILTER_OPTIONS.find(
        (opt) => opt.value === queryInput.source,
      )?.label;
      if (label) labels.push(`Nguồn: ${label}`);
    }
    if (queryInput.settlementStatus) {
      const label = SETTLEMENT_FILTER_OPTIONS.find(
        (opt) => opt.value === queryInput.settlementStatus,
      )?.label;
      if (label) labels.push(`Quyết toán: ${label}`);
    }
    return labels;
  }, [
    queryInput.category,
    queryInput.paymentMethod,
    queryInput.source,
    queryInput.settlementStatus,
  ]);
  const hasActiveServerFilters = activeFilterSummary.length > 0;

  function updateServerFilter(
    key: "category" | "paymentMethod" | "source" | "settlementStatus",
    value: string,
  ) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "book");
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSelectedId(null);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function clearServerFilters() {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "book");
    next.delete("category");
    next.delete("paymentMethod");
    next.delete("source");
    next.delete("settlementStatus");
    setSelectedId(null);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function applyRange(event: FormEvent) {
    event.preventDefault();
    const nextFrom = from ?? book?.from ?? queryInput.from ?? "";
    const nextTo = to ?? book?.to ?? queryInput.to ?? "";
    if (!nextFrom || !nextTo || nextFrom > nextTo) {
      setRangeError("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
      return;
    }
    setRangeError("");
    const next = new URLSearchParams(params.toString());
    next.set("tab", "book");
    next.set("from", nextFrom);
    next.set("to", nextTo);
    setSelectedId(null);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }
  async function download() {
    if (!book || exporting) return;
    try {
      setExporting(true);
      const { exportRevenueBook } =
        await import("../utils/revenue-book-export");
      exportRevenueBook(book);
    } catch (error) {
      await showErrorAlert("Không thể xuất Excel", errorMessage(error));
    } finally {
      setExporting(false);
    }
  }
  async function cancelEntry(entry: RevenueBookEntry, reason: string) {
    setSelectedId(null);
    const confirmation = await showConfirmDialog({
      title: "Hủy khoản bổ sung",
      confirmText: "Hủy khoản",
      cancelText: "Giữ lại",
      confirmVariant: "danger",
      details: [
        { label: "Khoản phát sinh", value: entry.description },
        { label: "Số tiền", value: money(entry.amount ?? 0, currency) },
        { label: "Lý do", value: reason },
      ],
    });
    if (!confirmation.isConfirmed) return;
    try {
      await query.voidEntry(entry.id, { reason, version: entry.version! });
      await showSuccessAlert(
        "Đã hủy khoản bổ sung",
        "Lịch sử khoản phát sinh được giữ lại.",
      );
    } catch (error) {
      await showErrorAlert("Không thể hủy khoản", errorMessage(error));
    }
  }

  async function handleUpdateNote(
    accountKey: string,
    notes: string,
    roomId?: string | null,
    expectedPriorNote?: string | null,
  ) {
    try {
      await query.updateNote(accountKey, notes, roomId, expectedPriorNote);
    } catch (error) {
      await showErrorAlert("Không thể lưu ghi chú", errorMessage(error));
      await query.refetch();
    }
  }
  return (
    <section className="space-y-5">
      {book && (
        <div className="hidden border-b-2 border-slate-900 pb-4 print:block">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                {book.hotelName}
              </p>
              <h1 className="text-2xl font-bold text-slate-900 text-balance">
                Sổ doanh thu
              </h1>
            </div>
            <p className="text-sm font-semibold text-slate-800 tabular-nums">
              Kỳ báo cáo: {formatDateVi(book.from)} – {formatDateVi(book.to)}
            </p>
          </div>
          <p className="mt-1.5 text-sm text-slate-700 text-pretty">
            Bộ lọc áp dụng:{" "}
            <strong className="font-semibold text-slate-900">
              {hasActiveServerFilters
                ? activeFilterSummary.join(" · ")
                : "Toàn bộ bút toán trong kỳ"}
            </strong>
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-4 border-t border-slate-200 pt-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-600">
                Tổng phát sinh trong kỳ
              </dt>
              <dd className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                {money(book.summary.revenueTotal, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-600">
                Đã thu trong kỳ
              </dt>
              <dd className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                {money(book.summary.collectedTotal, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-600">
                Số dư cuối kỳ
              </dt>
              <dd className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                {money(book.summary.closingBalance, currency)}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-balance">Sổ doanh thu</h1>
          {book && (
            <p className="mt-1 text-base text-[var(--on-surface-variant)] text-pretty">
              {book.hotelName}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!book || query.isFetching}
            onClick={() => window.print()}
            className={revenueButtonClass}
          >
            <VsIcon name="print" className="text-xl" />
            In / Xuất PDF
          </button>
          <button
            type="button"
            disabled={!book || query.isFetching || exporting}
            onClick={() => void download()}
            className={revenueButtonClass}
          >
            <VsIcon name="download" className="text-xl" />
            {exporting ? "Đang xuất…" : "Xuất Excel cả kỳ"}
          </button>
          {book?.canManage && (
            <button
              type="button"
              disabled={query.busy || query.isFetching}
              onClick={() => setEditor({ mode: "create" })}
              className={revenuePrimaryClass}
            >
              <VsIcon name="add" className="text-xl" />
              Thêm khoản phát sinh
            </button>
          )}
        </div>
      </header>

      <ReportsPrimaryMobileNav
        activeTab="book"
        pathname={pathname}
        from={navFrom}
        to={navTo}
      />
      <ReportsGroupSegmentedBar
        activeTab="book"
        pathname={pathname}
        from={navFrom}
        to={navTo}
      />

      <form
        onSubmit={applyRange}
        className="flex flex-wrap items-end gap-3 print:hidden"
      >
        <label className="space-y-1">
          <span className="block text-sm font-medium">Từ ngày</span>
          <input
            required
            type="date"
            value={from ?? queryInput.from ?? book?.from ?? ""}
            onChange={(event) => setFrom(event.target.value)}
            className={revenueInputClass}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-medium">Đến ngày</span>
          <input
            required
            type="date"
            value={to ?? queryInput.to ?? book?.to ?? ""}
            onChange={(event) => setTo(event.target.value)}
            className={revenueInputClass}
          />
        </label>
        <button
          type="submit"
          disabled={query.isFetching}
          className={revenueButtonClass}
        >
          Xem báo cáo
        </button>
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          className={revenueButtonClass}
          aria-label="Cập nhật sổ doanh thu"
        >
          <VsIcon name="refresh" className="text-xl" />
        </button>
      </form>

      {/* Server-Backed Filter Bar */}
      <section
        aria-label="Bộ lọc sổ doanh thu"
        className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs print:hidden"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <VsIcon name="filter_list" className="text-lg text-emerald-700" />
            <span>Bộ lọc bút toán</span>
            {hasActiveServerFilters && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 whitespace-nowrap">
                {activeFilterSummary.length} đang lọc
              </span>
            )}
          </div>
          {hasActiveServerFilters && (
            <button
              type="button"
              disabled={query.isFetching}
              onClick={clearServerFilters}
              className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50"
            >
              <VsIcon name="filter_alt_off" className="text-lg" />
              Xóa bộ lọc
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="block text-sm font-medium text-slate-700">
              Loại doanh thu
            </span>
            <select
              value={queryInput.category ?? ""}
              disabled={query.isFetching}
              onChange={(event) =>
                updateServerFilter("category", event.target.value)
              }
              className={revenueInputClass}
            >
              {CATEGORY_FILTER_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-sm font-medium text-slate-700">
              Kênh thanh toán
            </span>
            <select
              value={queryInput.paymentMethod ?? ""}
              disabled={query.isFetching}
              onChange={(event) =>
                updateServerFilter("paymentMethod", event.target.value)
              }
              className={revenueInputClass}
            >
              {PAYMENT_METHOD_FILTER_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-sm font-medium text-slate-700">
              Nguồn chứng từ
            </span>
            <select
              value={queryInput.source ?? ""}
              disabled={query.isFetching}
              onChange={(event) =>
                updateServerFilter("source", event.target.value)
              }
              className={revenueInputClass}
            >
              {SOURCE_FILTER_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-sm font-medium text-slate-700">
              Quyết toán
            </span>
            <select
              value={queryInput.settlementStatus ?? ""}
              disabled={query.isFetching}
              onChange={(event) =>
                updateServerFilter("settlementStatus", event.target.value)
              }
              className={revenueInputClass}
            >
              {SETTLEMENT_FILTER_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {rangeError && (
        <p role="alert" className="text-base text-red-700 text-pretty">
          {rangeError}
        </p>
      )}
      {query.isPending && (
        <p
          role="status"
          className="py-10 text-base text-[var(--on-surface-variant)]"
        >
          Đang tải sổ doanh thu…
        </p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-base text-red-800"
        >
          <p className="text-pretty">{errorMessage(query.error)}</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className={`${revenueButtonClass} mt-3`}
          >
            Thử lại
          </button>
        </div>
      )}
      {book && !query.isError && (
        <>
          {/* Executive Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-3 print:hidden">
            {/* Card 1: Doanh thu phát sinh */}
            <div className="rounded-2xl border border-sky-100 bg-linear-to-br from-sky-50/60 to-white p-4.5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-800">
                  Phát sinh trong kỳ
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <VsIcon name="trending_up" className="text-xl" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {money(book.summary.revenueTotal, currency)}
              </div>
              <p className="mt-1 text-xs text-slate-500 text-pretty">
                Tổng doanh thu dịch vụ & tiền phòng
              </p>
            </div>

            {/* Card 2: Đã thu trong kỳ */}
            <div className="rounded-2xl border border-emerald-100 bg-linear-to-br from-emerald-50/60 to-white p-4.5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  Đã thu trong kỳ
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <VsIcon name="payments" className="text-xl" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-700 tabular-nums">
                {money(book.summary.collectedTotal, currency)}
              </div>
              <p className="mt-1 text-xs text-slate-500 text-pretty">
                Tiền mặt, chuyển khoản & các nguồn thu khác
              </p>
            </div>

            {/* Card 3: Số dư cuối kỳ */}
            <div
              className={`rounded-2xl border p-4.5 shadow-xs transition-shadow hover:shadow-sm ${
                book.summary.closingBalance < 0
                  ? "border-amber-200 bg-linear-to-br from-amber-50/60 to-white"
                  : "border-slate-200 bg-linear-to-br from-slate-50/60 to-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    book.summary.closingBalance < 0 ? "text-amber-800" : "text-slate-700"
                  }`}
                >
                  Số dư công nợ cuối kỳ
                </span>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    book.summary.closingBalance < 0
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <VsIcon name="account_balance_wallet" className="text-xl" />
                </span>
              </div>
              <div
                className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${
                  book.summary.closingBalance < 0 ? "text-amber-900" : "text-slate-900"
                }`}
              >
                {money(book.summary.closingBalance, currency)}
              </div>
              <p className="mt-1 text-xs text-slate-500 text-pretty">
                {book.summary.closingBalance < 0
                  ? "Khách trả trước hoặc còn dư tiền đặt cọc"
                  : "Tổng công nợ còn phải thu của khách"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
            <label className="block w-full max-w-sm space-y-1">
              <span className="block text-sm font-medium">
                Tìm nội dung, phòng hoặc chứng từ
              </span>
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className={revenueInputClass}
                placeholder="Nhập số phòng, tên khách, chứng từ..."
              />
            </label>
          </div>

          <RevenueBookSpreadsheet
            book={book}
            currency={currency}
            filter={filter}
            canManage={Boolean(book.canManage)}
            onSelectEntry={(id) => setSelectedId(id)}
            onUpdateNote={handleUpdateNote}
          />
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--on-surface-variant)]">
            <div>
              <dt className="inline">Số dư đầu kỳ: </dt>
              <dd className="inline tabular-nums">
                {money(book.summary.openingBalance, currency)}
              </dd>
            </div>
            <div>
              <dt className="inline">Tiền mặt: </dt>
              <dd className="inline tabular-nums">
                {money(book.summary.cashTotal, currency)}
              </dd>
            </div>
            <div>
              <dt className="inline">Chuyển khoản: </dt>
              <dd className="inline tabular-nums">
                {money(book.summary.bankTransferTotal, currency)}
              </dd>
            </div>
            <div>
              <dt className="inline">Thẻ / Khác: </dt>
              <dd className="inline tabular-nums">
                {money(book.summary.otherCollectedTotal, currency)}
              </dd>
            </div>
          </dl>
        </>
      )}
      {book && selected && !editor && (
        <RevenueEntryDetail
          book={book}
          entry={selected}
          busy={query.busy}
          onClose={() => setSelectedId(null)}
          onEdit={(mode) => {
            setSelectedId(null);
            setEditor({ mode, entry: selected });
          }}
          onVoid={(reason) => void cancelEntry(selected, reason)}
        />
      )}
      {book && editor && (
        <RevenueEntryDialog
          key={`${editor.mode}:${editor.entry?.id ?? "new"}`}
          book={book}
          entry={editor.entry}
          mode={editor.mode}
          busy={query.busy}
          onClose={() => setEditor(null)}
          onCreate={query.createEntry}
          onUpdate={query.updateEntry}
          onCollect={query.collectEntry}
        />
      )}
    </section>
  );
}

function RevenueEntryDetail({
  book,
  entry,
  busy,
  onClose,
  onEdit,
  onVoid,
}: {
  book: RevenueBook;
  entry: RevenueBookEntry;
  busy: boolean;
  onClose: () => void;
  onEdit: (mode: "edit" | "collect") => void;
  onVoid: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const editable =
    book.canManage && entry.source === "MANUAL" && !entry.voidedAt;
  const values = [
    ["Phòng", entry.roomNumber || "Không gắn phòng"],
    ["Chứng từ", entry.documentNumber || "—"],
    ["Nguồn", sourceLabels[entry.source]],
    ["Số dư đầu kỳ", money(entry.openingBalance, book.currency)],
    ["Tiền phòng", money(entry.roomRevenue, book.currency)],
    ["Giặt ủi", money(entry.laundryRevenue, book.currency)],
    [
      "Dịch vụ khác",
      money(addMoney(entry.otherRevenue, entry.minibarRevenue), book.currency),
    ],
    [
      "Phân bổ cọc / Chuyển công nợ",
      money(entry.balanceAdjustment, book.currency),
    ],
    ["Số dư cuối kỳ", money(entry.closingBalance, book.currency)],
  ];
  return (
    <RevenueBookDialog title={entry.description} busy={busy} onClose={onClose}>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {values.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-wrap justify-between gap-2 border-b border-[var(--outline-variant)] py-2"
          >
            <dt className="text-sm text-[var(--on-surface-variant)]">
              {label}
            </dt>
            <dd className="text-base font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {entry.notes && (
        <p className="mt-4 whitespace-pre-wrap text-base text-pretty">
          {entry.notes}
        </p>
      )}
      <h3 className="mt-6 text-lg font-semibold text-balance">
        Thanh toán trong kỳ
      </h3>
      {entry.collections.length ? (
        <ul className="mt-3 divide-y divide-[var(--outline-variant)]">
          {entry.collections.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap justify-between gap-2 py-3 text-base"
            >
              <div>
                <p>
                  {new Intl.DateTimeFormat("vi-VN", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: book.timeZone,
                  }).format(new Date(payment.receivedAt))}{" "}
                  ·{" "}
                  {REVENUE_METHODS[
                    payment.method as keyof typeof REVENUE_METHODS
                  ] ?? "Khác"}
                </p>
                {payment.reference && (
                  <p className="break-all text-sm text-[var(--on-surface-variant)]">
                    {payment.reference}
                  </p>
                )}
              </div>
              <span className="font-medium tabular-nums">
                {money(payment.amount, book.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-base text-[var(--on-surface-variant)]">
          Chưa thu tiền trong kỳ.
        </p>
      )}
      {editable && (
        <div className="mt-6 space-y-4 border-t border-[var(--outline-variant)] pt-4">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => onEdit("edit")}
              className={revenueButtonClass}
            >
              Sửa khoản bổ sung
            </button>
            {entry.closingBalance > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onEdit("collect")}
                className={revenuePrimaryClass}
              >
                Thu tiền
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 space-y-1">
              <span className="block text-sm font-medium">Lý do hủy khoản</span>
              <input
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={revenueInputClass}
              />
            </label>
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={(event) => {
                event.currentTarget.closest("dialog")?.close();
                onVoid(reason.trim());
              }}
              className={`${revenueButtonClass} text-red-700`}
            >
              Hủy khoản
            </button>
          </div>
        </div>
      )}
      <footer className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className={revenueButtonClass}
        >
          Đóng
        </button>
      </footer>
    </RevenueBookDialog>
  );
}
