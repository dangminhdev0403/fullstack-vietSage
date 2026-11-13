"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
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
  RevenueBookEntry,
  RevenueBookQuery,
} from "../types/revenue-book-contract";
import { RevenueBookDialog } from "./revenue-book-dialog";
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
function dateLabel(value: string) {
  return value.split("-").reverse().join("/");
}
function errorMessage(error: unknown) {
  if (error instanceof HttpError && error.status >= 500)
    return "Không thể tải hoặc lưu sổ doanh thu. Vui lòng thử lại sau.";
  return error instanceof Error
    ? error.message
    : "Không thể thực hiện thao tác. Vui lòng thử lại.";
}
const sourceLabels = {
  FOLIO: "Tự động",
  MANUAL: "Bổ sung",
  DEPOSIT: "Tiền cọc",
  RECEIVABLE: "Công nợ",
};

export function RevenueBookWorkspace({ hotelId }: { hotelId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const queryInput = useMemo<RevenueBookQuery>(
    () => ({
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
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
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    mode: "create" | "edit" | "collect";
    entry?: RevenueBookEntry;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const selected = book?.entries.find((entry) => entry.id === selectedId);
  const entries = useMemo(() => book?.entries ?? [], [book]);
  const currency = book?.currency ?? "VND";
  const columns = useMemo<ColumnDef<RevenueBookEntry>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Ngày",
        cell: ({ getValue }) => dateLabel(getValue<string>()),
      },
      {
        accessorKey: "roomNumber",
        header: "Phòng",
        cell: ({ getValue }) => getValue<string | null>() || "—",
      },
      {
        accessorKey: "description",
        header: "Khoản phát sinh",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelectedId(row.original.id)}
            className="min-h-11 text-left font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            <span className="block max-w-sm break-words">
              {row.original.description}
            </span>
            {row.original.source === "MANUAL" && (
              <span className="block text-sm font-normal text-[var(--on-surface-variant)]">
                {row.original.voidedAt ? "Đã hủy" : "Bổ sung"}
              </span>
            )}
          </button>
        ),
      },
      {
        accessorKey: "revenueTotal",
        header: "Phát sinh trong kỳ",
        cell: ({ getValue }) => money(getValue<number>(), currency),
      },
      {
        id: "collected",
        accessorFn: (entry) =>
          entry.collections.reduce((sum, payment) => sum + payment.amount, 0),
        header: "Đã thu trong kỳ",
        cell: ({ getValue }) => money(getValue<number>(), currency),
      },
      {
        accessorKey: "closingBalance",
        header: "Số dư cuối kỳ",
        cell: ({ getValue }) => money(getValue<number>(), currency),
      },
    ],
    [currency],
  );
  const table = useReactTable({
    data: entries,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    globalFilterFn: (row, _column, value: string) =>
      `${row.original.description} ${row.original.roomNumber ?? ""} ${row.original.documentNumber ?? ""}`
        .toLocaleLowerCase("vi")
        .includes(value.toLocaleLowerCase("vi")),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });
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
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-balance">Sổ doanh thu</h1>
          {book && (
            <p className="mt-1 text-base text-[var(--on-surface-variant)] text-pretty">
              {book.hotelName}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${pathname}?${new URLSearchParams({ tab: "overview", ...(book ? { from: book.from, to: book.to } : {}) })}`}
            className={revenueButtonClass}
          >
            Phân tích
          </Link>
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
      <form onSubmit={applyRange} className="flex flex-wrap items-end gap-3">
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
          <dl className="grid gap-4 border-y border-[var(--outline-variant)] py-4 sm:grid-cols-3">
            {[
              ["Phát sinh trong kỳ", book.summary.revenueTotal],
              ["Đã thu trong kỳ", book.summary.collectedTotal],
              ["Số dư cuối kỳ", book.summary.closingBalance],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-[var(--on-surface-variant)]">
                  {label}
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {money(Number(value), currency)}
                </dd>
              </div>
            ))}
          </dl>
          {book.summary.closingBalance < 0 && (
            <p className="text-sm text-[var(--on-surface-variant)] text-pretty">
              Số dư âm là tiền khách trả trước hoặc còn dư.
            </p>
          )}
          <label className="block max-w-md space-y-1">
            <span className="block text-sm font-medium">
              Tìm nội dung, phòng hoặc chứng từ
            </span>
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className={revenueInputClass}
            />
          </label>
          <div
            aria-busy={query.isFetching}
            className="overflow-x-auto rounded-xl border border-[var(--outline-variant)]"
          >
            <table className="w-full min-w-[760px] text-left text-base">
              <thead className="bg-[var(--surface-container-low)]">
                <tr>
                  {table.getHeaderGroups()[0].headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className={`px-4 py-3 ${["revenueTotal", "collected", "closingBalance"].includes(header.id) ? "text-right" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                        aria-label={`Sắp xếp theo ${String(header.column.columnDef.header)}`}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <span aria-hidden="true">
                          {header.column.getIsSorted() === "desc"
                            ? " ↓"
                            : header.column.getIsSorted() === "asc"
                              ? " ↑"
                              : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--outline-variant)]">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-[var(--surface-container-low)]"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`px-4 py-3 align-top ${["revenueTotal", "collected", "closingBalance"].includes(cell.column.id) ? "whitespace-nowrap text-right tabular-nums" : cell.column.id === "date" ? "whitespace-nowrap" : ""}`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {!table.getRowModel().rows.length && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-10 text-center text-[var(--on-surface-variant)]"
                    >
                      {filter
                        ? "Không có khoản phù hợp."
                        : "Chưa có phát sinh trong kỳ này."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--on-surface-variant)]">
            <span>
              {table.getFilteredRowModel().rows.length} khoản · Trang{" "}
              {table.getState().pagination.pageIndex + 1}/
              {Math.max(1, table.getPageCount())}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className={revenueButtonClass}
              >
                Trước
              </button>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className={revenueButtonClass}
              >
                Sau
              </button>
            </div>
          </footer>
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
    ["Minibar / Nước uống", money(entry.minibarRevenue, book.currency)],
    ["Giặt ủi", money(entry.laundryRevenue, book.currency)],
    ["Dịch vụ khác", money(entry.otherRevenue, book.currency)],
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
