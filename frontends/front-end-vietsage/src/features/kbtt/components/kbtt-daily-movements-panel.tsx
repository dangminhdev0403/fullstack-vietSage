"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { exportToExcel } from "@/libs/excel-export";
import { kbttResource } from "../resources/kbtt-resource";
import {
  getVietnamTodayDate,
  type KbttDailyMovementItem,
  type KbttMovementKind,
} from "../types/kbtt-contract";

export type KbttDailyMovementsPanelProps = {
  hotelId: string;
  kind: KbttMovementKind;
  onSwitchToDeclarations?: () => void;
};

function formatMovementDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatStatusBadge(status: string): { label: string; className: string } {
  const normalized = status.toUpperCase();
  switch (normalized) {
    case "CHECKED_IN":
    case "ACTIVE":
    case "IN_HOUSE":
      return {
        label: "Đang lưu trú",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    case "CONFIRMED":
    case "RESERVED":
    case "ARRIVING":
      return {
        label: "Đặt trước",
        className: "border-blue-200 bg-blue-50 text-blue-800",
      };
    case "CHECKED_OUT":
    case "COMPLETED":
      return {
        label: "Đã trả phòng",
        className: "border-slate-200 bg-slate-100 text-slate-700",
      };
    case "CANCELLED":
      return {
        label: "Đã hủy",
        className: "border-rose-200 bg-rose-50 text-rose-800",
      };
    default:
      return {
        label: status,
        className: "border-slate-200 bg-slate-50 text-slate-700",
      };
  }
}

export function KbttDailyMovementsPanel({
  hotelId,
  kind,
  onSwitchToDeclarations,
}: KbttDailyMovementsPanelProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() => getVietnamTodayDate());
  const [searchInput, setSearchInput] = useState<string>("");
  const [submittedQuery, setSubmittedQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 50;

  const boundResource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);

  const dailyQuery = useQuery(
    useMemo(
      () =>
        boundResource.queries.dailyMovements.options({
          date: selectedDate,
          kind,
          q: submittedQuery || undefined,
          page: currentPage,
          limit: pageSize,
        }),
      [boundResource, selectedDate, kind, submittedQuery, currentPage, pageSize],
    ),
  );

  const data = dailyQuery.data;
  const items: KbttDailyMovementItem[] = useMemo(() => data?.items ?? [], [data?.items]);
  const totalItems = data?.total ?? 0;
  const totalPages = Math.max(1, data?.totalPages ?? 1);

  const handleDateChange = useCallback((newDate: string) => {
    setSelectedDate(newDate);
    setCurrentPage(1);
  }, []);

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmittedQuery(searchInput.trim());
      setCurrentPage(1);
    },
    [searchInput],
  );

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    setSubmittedQuery("");
    setCurrentPage(1);
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleExportExcel = useCallback(() => {
    if (items.length === 0) return;
    const kindSlug = kind === "ARRIVAL" ? "khach-den" : "khach-roi";
    const sheetTitle = kind === "ARRIVAL" ? "Khách đến" : "Khách rời";

    exportToExcel({
      filename: `kbtt-${kindSlug}-${selectedDate}-trang-${currentPage}.xls`,
      sheetName: `${sheetTitle} ${selectedDate}`,
      columns: [
        { header: "Số phòng", key: "roomNumber", format: (v) => String(v ?? "—") },
        { header: "Tên khách", key: "guestDisplayName" },
        { header: "Số điện thoại", key: "guestPhone", format: (v) => String(v ?? "—") },
        { header: "Mã đặt phòng", key: "reservationCode", format: (v) => String(v ?? "—") },
        { header: "Mã đoàn", key: "groupCode", format: (v) => String(v ?? "—") },
        { header: "Số khách", key: "occupantCount" },
        {
          header: "Trạng thái",
          key: "status",
          format: (v) => formatStatusBadge(String(v ?? "")).label,
        },
        {
          header: kind === "ARRIVAL" ? "Giờ dự kiến đến" : "Giờ dự kiến đi",
          key: kind === "ARRIVAL" ? "plannedCheckInAt" : "plannedCheckOutAt",
          format: (v) => formatMovementDateTime(v as string),
        },
        {
          header: kind === "ARRIVAL" ? "Giờ thực tế đến" : "Giờ thực tế đi",
          key: kind === "ARRIVAL" ? "actualCheckInAt" : "actualCheckOutAt",
          format: (v) => formatMovementDateTime(v as string),
        },
      ],
      data: items as unknown as Record<string, unknown>[],
    });
  }, [items, kind, selectedDate, currentPage]);

  const kindHeading = kind === "ARRIVAL" ? "Danh sách khách đến" : "Danh sách khách rời";
  const kindDescription =
    kind === "ARRIVAL"
      ? "Theo dõi lượt khách dự kiến đến và làm thủ tục nhận phòng trong ngày."
      : "Theo dõi lượt khách dự kiến trả phòng và hoàn tất lưu trú trong ngày.";

  return (
    <div className="w-full space-y-6 pb-16 pt-1 text-slate-900" aria-label={kindHeading}>
      {/* Panel Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
            {kind === "ARRIVAL" ? "BIẾN ĐỘNG LƯU TRÚ — KHÁCH ĐẾN" : "BIẾN ĐỘNG LƯU TRÚ — KHÁCH RỜI"}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl text-balance">
            {kindHeading}
          </h2>
          <p className="mt-1 text-base text-slate-600 text-pretty">
            {kindDescription}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onSwitchToDeclarations ? (
            <button
              type="button"
              onClick={onSwitchToDeclarations}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              <svg className="h-4 w-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Về Hồ sơ BCA</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <svg className="h-4 w-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>In danh sách</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={items.length === 0}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-900 disabled:opacity-50 transition-colors"
            title="Xuất Excel cho trang hiện tại đang hiển thị"
          >
            <svg className="h-4 w-4 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Xuất Excel (trang này)</span>
          </button>
        </div>
      </header>

      {/* Filter and Date Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Native Date Input */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label htmlFor="kbtt-movement-date" className="text-sm font-semibold text-slate-700 whitespace-nowrap">
            Ngày chọn:
          </label>
          <input
            id="kbtt-movement-date"
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base text-slate-900 outline-none transition-all focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          />
        </div>

        {/* Server Search Form */}
        <form onSubmit={handleSearchSubmit} className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <label htmlFor="kbtt-movement-search" className="sr-only">
            Tìm theo tên khách, số điện thoại, mã đặt phòng hoặc số phòng
          </label>
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <input
              id="kbtt-movement-search"
              type="search"
              placeholder="Tìm theo tên khách, số điện thoại, mã đặt phòng, số phòng..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2 text-base text-slate-900 outline-none transition-all focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            />
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-900 transition-colors"
          >
            <span>Tìm kiếm</span>
          </button>

          {submittedQuery ? (
            <button
              type="button"
              onClick={handleClearSearch}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span>Xóa tìm</span>
            </button>
          ) : null}
        </form>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={() => void dailyQuery.refetch()}
          disabled={dailyQuery.isFetching}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          <svg className={`h-4 w-4 ${dailyQuery.isFetching ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          <span>Làm mới</span>
        </button>
      </div>

      {/* Main Content States */}
      {dailyQuery.isLoading ? (
        <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 animate-spin">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Đang tải danh sách biến động lưu trú...</p>
        </div>
      ) : dailyQuery.isError ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-900">
          <h3 className="text-lg font-bold text-rose-900">Không thể tải danh sách</h3>
          <p className="mt-1 text-sm text-rose-700 text-pretty">
            Hệ thống không thể tải dữ liệu biến động lưu trú từ máy chủ. Vui lòng kiểm tra lại kết nối và thử lại.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void dailyQuery.refetch()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-rose-800 transition-colors"
            >
              <span>Thử lại</span>
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {submittedQuery
              ? `Không tìm thấy kết quả nào phù hợp với từ khóa "${submittedQuery}"`
              : `Không có lượt khách ${kind === "ARRIVAL" ? "đến" : "rời"} nào trong ngày ${selectedDate}`}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600 text-pretty">
            {submittedQuery
              ? "Vui lòng thử tìm kiếm lại với số phòng, tên khách hoặc mã đặt phòng khác."
              : `Hiện tại chưa có ghi nhận khách ${kind === "ARRIVAL" ? "làm thủ tục nhận phòng" : "làm thủ tục trả phòng"} trong ngày được chọn.`}
          </p>
          {submittedQuery ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={handleClearSearch}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-900 transition-colors"
              >
                <span>Xóa tìm kiếm</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        /* Data Table */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-900">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Phòng</th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Khách lưu trú</th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Mã đặt / Đoàn</th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap text-center">Số khách</th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap">
                    {kind === "ARRIVAL" ? "Giờ dự kiến đến" : "Giờ dự kiến đi"}
                  </th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap">
                    {kind === "ARRIVAL" ? "Giờ thực tế đến" : "Giờ thực tế đi"}
                  </th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap">Trạng thái</th>
                  <th scope="col" className="px-4 py-3.5 whitespace-nowrap text-right">Nghiệp vụ lễ tân</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row, index) => {
                  const badge = formatStatusBadge(row.status);
                  const frontDeskHref =
                    kind === "ARRIVAL"
                      ? `/hotels/${encodeURIComponent(hotelId)}/front-desk?tab=arrivals&q=${encodeURIComponent(
                          row.reservationCode ?? row.roomNumber ?? row.guestDisplayName,
                        )}`
                      : `/hotels/${encodeURIComponent(hotelId)}/front-desk?tab=in-house&q=${encodeURIComponent(
                          row.roomNumber ?? row.reservationCode ?? row.guestDisplayName,
                        )}`;

                  return (
                    <tr key={row.reservationId ?? row.stayId ?? `${row.roomNumber}-${index}`} className="hover:bg-slate-50/60 transition-colors">
                      {/* Phòng */}
                      <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                        {row.roomNumber ? (
                          <span className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-bold text-slate-800">
                            P.{row.roomNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal italic">Chưa xếp phòng</span>
                        )}
                      </td>

                      {/* Khách lưu trú */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{row.guestDisplayName}</div>
                        {row.guestPhone ? (
                          <div className="text-xs text-slate-500">{row.guestPhone}</div>
                        ) : null}
                      </td>

                      {/* Mã đặt / Đoàn */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-slate-800">
                          {row.reservationCode ?? "—"}
                        </div>
                        {row.groupCode ? (
                          <div className="text-xs text-slate-500 font-mono">Đoàn: {row.groupCode}</div>
                        ) : null}
                      </td>

                      {/* Số khách */}
                      <td className="px-4 py-3 text-center whitespace-nowrap font-medium text-slate-700">
                        {row.occupantCount}
                      </td>

                      {/* Giờ dự kiến */}
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 text-xs">
                        {formatMovementDateTime(
                          kind === "ARRIVAL" ? row.plannedCheckInAt : row.plannedCheckOutAt,
                        )}
                      </td>

                      {/* Giờ thực tế */}
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 text-xs">
                        {formatMovementDateTime(
                          kind === "ARRIVAL" ? row.actualCheckInAt : row.actualCheckOutAt,
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Thao tác Lễ tân */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={frontDeskHref}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-blue-700 shadow-2xs hover:bg-blue-50 transition-colors"
                          title="Điều hướng tới bàn lễ tân để thực hiện thủ tục nhận/trả phòng"
                        >
                          <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                          <span>{kind === "ARRIVAL" ? "Lễ tân nhận phòng" : "Lễ tân trả phòng"}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/60 px-4 py-3">
            <div className="text-sm text-slate-600">
              Tổng số <span className="font-bold text-slate-900">{totalItems}</span> lượt khách
            </div>

            <nav aria-label="Phân trang biến động lưu trú" className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || dailyQuery.isFetching}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <span>Trang trước</span>
              </button>

              <span className="text-sm font-semibold text-slate-700 px-2">
                Trang {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || dailyQuery.isFetching}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <span>Trang sau</span>
              </button>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
