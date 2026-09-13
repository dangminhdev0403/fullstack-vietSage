"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { HttpError } from "@/core/http/http-error";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";

import { kbttResource } from "../resources/kbtt-resource";
import {
  getRowPartitionTab,
  kbttErrorCode,
  kbttErrorMessage,
  type CitizenshipKind,
  type KbttDeclarationListItem,
  type KbttTabKey,
  type SaveKbttDraftPayload,
} from "../types/kbtt-contract";

const inputClass =
  "min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition-all focus:border-[#064e3b] focus:outline-none focus:ring-2 focus:ring-[#064e3b]/15 focus-visible:outline-none disabled:bg-slate-50 disabled:text-slate-400 placeholder:text-slate-400";

const selectClass =
  "min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition-all focus:border-[#064e3b] focus:outline-none focus:ring-2 focus:ring-[#064e3b]/15 focus-visible:outline-none disabled:bg-slate-50 disabled:text-slate-400";

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    const code = kbttErrorCode(error.data);
    if (code) return kbttErrorMessage(code);
    if (error.data && typeof error.data === "object") {
      const dataObj = error.data as Record<string, unknown>;
      if (typeof dataObj.detail === "string") return dataObj.detail;
      if (typeof dataObj.message === "string") return dataObj.message;
    }
    if (error.status === 400) return "Dữ liệu khai báo không hợp lệ.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy hồ sơ khách lưu trú.";
    return kbttErrorMessage(kbttErrorCode(error.data));
  }
  if (error instanceof Error) {
    return error.message;
  }
  return kbttErrorMessage(null);
}

function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return "Chưa cập nhật";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDisplayDateTime(dateTimeStr: string | null): string {
  if (!dateTimeStr) return "Chưa cập nhật";
  const d = new Date(dateTimeStr);
  if (Number.isNaN(d.getTime())) return dateTimeStr;
  const time = d.toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = d.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${time} ${date}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "READY":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Sẵn sàng gửi
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Bản nháp
        </span>
      );
    case "SUBMITTED":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-900">
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          Đã gửi BCA
        </span>
      );
    case "SENDING":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
          Đang gửi
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-800">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Lỗi khai báo
        </span>
      );
    case "UNKNOWN":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Chưa rõ kết quả
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          Đã hủy
        </span>
      );
    case "MISSING_PROFILE":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          Chưa tạo bản nháp
        </span>
      );
  }
}

export function KbttDeclarationsPage({
  hotelId,
  canManage,
}: {
  hotelId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 50;
  const [activeTab, setActiveTab] = useState<KbttTabKey>("vietnamese");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOccupant, setSelectedOccupant] = useState<KbttDeclarationListItem | null>(null);
  const boundResource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);

  const declarationsResource = useMemo(
    () => boundResource.queries.declarations.options({ page, limit }),
    [boundResource, page],
  );
  const declarationsQuery = useQuery(declarationsResource);

  const allRows = useMemo(() => declarationsQuery.data ?? [], [declarationsQuery.data]);

  const counts = useMemo(() => {
    return {
      vietnamese: allRows.filter((r) => getRowPartitionTab(r) === "vietnamese").length,
      foreign: allRows.filter((r) => getRowPartitionTab(r) === "foreign").length,
      needs_completion: allRows.filter((r) => getRowPartitionTab(r) === "needs_completion").length,
      submitted_or_error: allRows.filter((r) => getRowPartitionTab(r) === "submitted_or_error").length,
    };
  }, [allRows]);

  const tabRows = useMemo(() => {
    return allRows.filter((r) => getRowPartitionTab(r) === activeTab);
  }, [allRows, activeTab]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tabRows;
    return tabRows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.roomNumber && r.roomNumber.toLowerCase().includes(q)) ||
        (r.identityNumber && r.identityNumber.toLowerCase().includes(q)),
    );
  }, [tabRows, searchQuery]);

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: boundResource.key,
    });
  }, [boundResource, queryClient]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16 pt-2 text-slate-900" aria-labelledby="declarations-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
            HỒ SƠ KHÁCH LƯU TRÚ
          </p>
          <h1 id="declarations-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Khai báo tạm trú lưu trú
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Quản lý hồ sơ khai báo của khách đang lưu trú, hoàn thiện bản nháp và đánh dấu sẵn sàng gửi.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={declarationsQuery.isFetching}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-base font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] disabled:opacity-60"
          >
            <svg
              className={`h-5 w-5 ${declarationsQuery.isFetching ? "animate-spin text-emerald-600" : "text-slate-500"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Làm mới
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav
        aria-label="Phân loại hồ sơ khai báo"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-2"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          id="tab-vietnamese"
          aria-selected={activeTab === "vietnamese"}
          aria-controls="panel-vietnamese"
          onClick={() => setActiveTab("vietnamese")}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-base font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] ${
            activeTab === "vietnamese"
              ? "bg-[#064e3b] text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>Người Việt Nam</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === "vietnamese" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            {counts.vietnamese}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-foreign"
          aria-selected={activeTab === "foreign"}
          aria-controls="panel-foreign"
          onClick={() => setActiveTab("foreign")}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-base font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] ${
            activeTab === "foreign"
              ? "bg-[#064e3b] text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>Người nước ngoài</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === "foreign" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            {counts.foreign}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-needs-completion"
          aria-selected={activeTab === "needs_completion"}
          aria-controls="panel-needs-completion"
          onClick={() => setActiveTab("needs_completion")}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-base font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] ${
            activeTab === "needs_completion"
              ? "bg-[#064e3b] text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>Cần bổ sung</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === "needs_completion" ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"
            }`}
          >
            {counts.needs_completion}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-submitted-error"
          aria-selected={activeTab === "submitted_or_error"}
          aria-controls="panel-submitted-error"
          onClick={() => setActiveTab("submitted_or_error")}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-base font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] ${
            activeTab === "submitted_or_error"
              ? "bg-[#064e3b] text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>Đã gửi / Lỗi</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === "submitted_or_error" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            {counts.submitted_or_error}
          </span>
        </button>
      </nav>

      {/* Filter / Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <label htmlFor="kbtt-search" className="sr-only">
            Tìm kiếm theo tên khách, số phòng, số giấy tờ
          </label>
          <input
            id="kbtt-search"
            type="search"
            placeholder="Tìm theo tên khách, số phòng, số giấy tờ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-base text-slate-900 outline-none transition-all focus:border-[#064e3b] focus:ring-2 focus:ring-[#064e3b]/15"
          />
          <svg
            className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">
          Hiển thị {filteredRows.length} / {tabRows.length} hồ sơ trong mục này
        </p>
      </div>

      {/* List / Table Area */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="space-y-4"
      >
        {declarationsQuery.isPending ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-white py-16 text-slate-500 shadow-xs">
            <svg className="h-8 w-8 animate-spin text-[#064e3b]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-base font-medium">Đang tải danh sách hồ sơ khai báo tạm trú…</p>
          </div>
        ) : declarationsQuery.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-red-900 shadow-xs">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 shrink-0 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <h3 className="text-lg font-bold">Không thể tải danh sách khai báo tạm trú</h3>
            </div>
            <p className="mt-2 text-base text-red-700">{errorText(declarationsQuery.error)}</p>
            <button
              type="button"
              onClick={handleRefresh}
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-red-600 px-5 py-2.5 text-base font-semibold text-white transition-all hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Thử lại
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-500 shadow-xs">
            <svg className="h-12 w-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-lg font-semibold text-slate-700">
              {searchQuery ? "Không tìm thấy khách lưu trú phù hợp từ khóa" : "Chưa có hồ sơ nào trong mục này"}
            </p>
            <p className="max-w-md text-base text-slate-500">
              {activeTab === "vietnamese"
                ? "Không có khách lưu trú người Việt Nam nào cần xử lý tại trang này."
                : activeTab === "foreign"
                  ? "Không có khách lưu trú người nước ngoài nào cần xử lý tại trang này."
                  : activeTab === "needs_completion"
                    ? "Tất cả khách lưu trú đã có đầy đủ hồ sơ khởi tạo."
                    : "Chưa có hồ sơ nào đã được gửi hoặc phát sinh lỗi."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredRows.map((occupant) => {
              const isVietnamese = occupant.citizenshipKind === "VIETNAMESE";
              const isForeign = occupant.citizenshipKind === "FOREIGN";

              return (
                <article
                  key={occupant.occupantId}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 px-2.5 text-base font-bold text-slate-800">
                          {occupant.roomNumber ? `P.${occupant.roomNumber}` : "Chưa xếp"}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            occupant.isPrimary ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {occupant.isPrimary ? "Khách chính" : "Khách đi cùng"}
                        </span>
                      </div>
                      <StatusBadge status={occupant.derivedStatus} />
                    </div>

                    <div>
                      <h2 className="text-lg font-bold text-slate-900 leading-snug">{occupant.fullName}</h2>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {isForeign
                          ? `Khách nước ngoài${occupant.nationality ? ` (${occupant.nationality})` : ""}`
                          : isVietnamese
                            ? "Khách Việt Nam"
                            : "Chưa phân loại quốc tịch"}
                      </p>
                    </div>

                    <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Giấy tờ:</span>
                        <span className="font-medium text-slate-900">
                          {occupant.identityNumber || "Chưa có"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Ngày sinh:</span>
                        <span className="font-medium text-slate-900">
                          {formatDisplayDate(occupant.dateOfBirth)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Lưu trú:</span>
                        <span className="font-medium text-slate-900">
                          {formatDisplayDateTime(occupant.checkedInAt || occupant.plannedCheckInAt)}
                        </span>
                      </div>
                    </div>

                    {/* Missing work / status message */}
                    <div className="text-sm">
                      {occupant.derivedStatus === "MISSING_PROFILE" && (
                        <p className="flex items-center gap-1.5 font-medium text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Cần chọn loại quốc tịch và khởi tạo bản nháp.
                        </p>
                      )}
                      {occupant.derivedStatus === "DRAFT" && (
                        <p className="flex items-center gap-1.5 font-medium text-blue-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          Cần rà soát và nhấn &ldquo;Đánh dấu sẵn sàng&rdquo;.
                        </p>
                      )}
                      {occupant.derivedStatus === "READY" && (
                        <p className="flex items-center gap-1.5 font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Hồ sơ đã hợp lệ, sẵn sàng kết xuất báo cáo.
                        </p>
                      )}
                      {occupant.derivedStatus === "FAILED" && (
                        <p className="text-red-700">
                          {occupant.declaration?.providerMessage || "Hồ sơ bị từ chối, cần chỉnh sửa lại."}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setSelectedOccupant(occupant)}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#064e3b] px-4 py-2.5 text-base font-semibold text-white shadow-xs transition-all hover:bg-[#043327] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b]"
                    >
                      <span>
                        {occupant.derivedStatus === "MISSING_PROFILE"
                          ? "Khai báo thông tin"
                          : occupant.derivedStatus === "READY"
                            ? "Xem / Chỉnh sửa hồ sơ"
                            : "Chỉnh sửa bản nháp"}
                      </span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        <footer className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-base text-slate-600">Trang {page}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || declarationsQuery.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-base font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] disabled:opacity-50"
            >
              Trang trước
            </button>
            <button
              type="button"
              disabled={allRows.length < limit || declarationsQuery.isFetching}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-base font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] disabled:opacity-50"
            >
              Trang sau
            </button>
          </div>
        </footer>
      </div>

      {/* Detail & Draft Form Modal */}
      {selectedOccupant && (
        <DeclarationModal
          hotelId={hotelId}
          occupantId={selectedOccupant.occupantId}
          occupantSummary={selectedOccupant}
          canManage={canManage}
          onClose={() => setSelectedOccupant(null)}
          onUpdated={() => {
            void queryClient.invalidateQueries({
              queryKey: boundResource.key,
            });
          }}
        />
      )}
    </div>
  );
}

function DeclarationModal({
  hotelId,
  occupantId,
  occupantSummary,
  canManage,
  onClose,
  onUpdated,
}: {
  hotelId: string;
  occupantId: string;
  occupantSummary: KbttDeclarationListItem;
  canManage: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const boundResource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const detailResource = useMemo(
    () => boundResource.queries.declarationDetail.options({ occupantId }),
    [boundResource, occupantId],
  );
  const detailQuery = useQuery(detailResource);

  const saveMutation = useMutation(boundResource.mutations.saveDraft.options());
  const readyMutation = useMutation(boundResource.mutations.markReady.options());

  const initialKind =
    detailQuery.data?.declaration?.declarationKind ??
    detailQuery.data?.occupant.citizenshipKind ??
    occupantSummary.citizenshipKind ??
    "VIETNAMESE";
  const [citizenshipOverride, setCitizenshipOverride] = useState<CitizenshipKind | null>(null);
  const citizenshipKind = citizenshipOverride ?? initialKind;
  const initialFormData = useMemo(() => {
    if (!detailQuery.data) return {};
    const occupant = detailQuery.data.occupant;
    const initial: Record<string, unknown> = {
      ...((detailQuery.data.declaration?.draftPayload ?? {}) as Record<string, unknown>),
    };
    if (!initial.hoTen && occupant.fullName) initial.hoTen = occupant.fullName;
    if (!initial.soPhong && occupantSummary.roomNumber) initial.soPhong = occupantSummary.roomNumber;
    if (!initial.ngayThangNamSinhStr && occupant.dateOfBirth) {
      initial.ngayThangNamSinhStr = occupant.dateOfBirth;
    }
    if (!initial.gioiTinh && occupant.gender) {
      const gender = occupant.gender.trim().toUpperCase();
      if (["M", "MALE", "NAM"].includes(gender)) initial.gioiTinh = "M";
      if (["F", "FEMALE", "NỮ", "NU"].includes(gender)) initial.gioiTinh = "F";
    }
    if (initialKind === "VIETNAMESE" && !initial.soGiayTo && occupant.identityNumber) {
      initial.soGiayTo = occupant.identityNumber;
    }
    if (initialKind === "FOREIGN") {
      if (!initial.soHoChieu && occupant.identityNumber) initial.soHoChieu = occupant.identityNumber;
      if (!initial.loaiNgayThangNamSinh) initial.loaiNgayThangNamSinh = "D";
    }
    return initial;
  }, [detailQuery.data, initialKind, occupantSummary.roomNumber]);
  const [formEdits, setFormEdits] = useState<Record<string, unknown>>({});
  const formData = useMemo(
    () => ({
      ...(citizenshipOverride && citizenshipOverride !== initialKind ? {} : initialFormData),
      ...formEdits,
    }),
    [citizenshipOverride, formEdits, initialFormData, initialKind],
  );
  const documentTypesQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "DOCUMENT_TYPE" }),
    enabled: citizenshipKind === "VIETNAMESE",
  });
  const stayReasonsQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "STAY_REASON" }),
    enabled: citizenshipKind === "VIETNAMESE",
  });
  const provincesQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "PROVINCE" }),
    enabled: citizenshipKind === "VIETNAMESE",
  });
  const provinceCode = typeof formData.maTT === "string" ? formData.maTT : undefined;
  const wardsQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "WARD", parentCode: provinceCode }),
    enabled: citizenshipKind === "VIETNAMESE" && Boolean(provinceCode),
  });
  const residencePlacesQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "RESIDENCE_PLACE" }),
    enabled: citizenshipKind === "VIETNAMESE",
  });
  const nationalitiesQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "NATIONALITY" }),
    enabled: citizenshipKind === "FOREIGN",
  });


  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateField = (key: string, value: unknown) => {
    setFormEdits((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveDraft = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!canManage) return;

    try {
      const payload: SaveKbttDraftPayload = {
        citizenshipKind,
        data: formData,
      };
      await saveMutation.mutateAsync({ occupantId, body: payload });
      await showSuccessAlert("Khai báo tạm trú", "Đã lưu bản nháp thành công.");
      onUpdated();
    } catch (error) {
      await showErrorAlert("Lưu bản nháp thất bại", errorText(error));
    }
  };

  const handleMarkReady = async () => {
    if (!canManage) return;

    const confirm = await showConfirmDialog({
      title: "Đánh dấu hồ sơ sẵn sàng?",
      text: "Hệ thống sẽ kiểm tra toàn bộ các trường bắt buộc của Bộ Công an. Sau khi sẵn sàng, hồ sơ đủ điều kiện để kết xuất gửi cơ quan quản lý.",
      confirmText: "Đánh dấu sẵn sàng",
      cancelText: "Hủy",
      icon: "question",
    });
    if (!confirm.isConfirmed) return;

    try {
      // First save any recent changes
      const payload: SaveKbttDraftPayload = {
        citizenshipKind,
        data: formData,
      };
      await saveMutation.mutateAsync({ occupantId, body: payload });

      // Then mark ready
      await readyMutation.mutateAsync({ occupantId });
      await showSuccessAlert(
        "Khai báo tạm trú",
        "Hồ sơ đã được kiểm tra hợp lệ và chuyển sang trạng thái SẴN SÀNG.",
      );
      onUpdated();
      onClose();
    } catch (error) {
      await showErrorAlert("Chưa đủ điều kiện sẵn sàng", errorText(error));
    }
  };

  const isBusy = saveMutation.isPending || readyMutation.isPending;
  const declStatus = detailQuery.data?.declaration?.status ?? occupantSummary.derivedStatus;
  const isEditable = ["DRAFT", "READY", "FAILED", "MISSING_PROFILE"].includes(declStatus);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-decl-title"
    >
      <div className="relative my-8 w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-800">
                {occupantSummary.roomNumber ? `Phòng ${occupantSummary.roomNumber}` : "Chưa xếp phòng"}
              </span>
              <StatusBadge status={declStatus} />
            </div>
            <h2 id="modal-decl-title" className="mt-2 text-2xl font-bold text-slate-900">
              Hồ sơ khai báo: {occupantSummary.fullName}
            </h2>
            <p className="mt-0.5 text-base text-slate-500">
              Mã khách: {occupantId} | {occupantSummary.isPrimary ? "Khách chính" : "Khách đi cùng"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b]"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Loading state */}
        {detailQuery.isPending && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500" role="status">
            <svg className="h-8 w-8 animate-spin text-[#064e3b]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-base font-medium">Đang tải chi tiết hồ sơ khai báo…</p>
          </div>
        )}

        {/* Error state */}
        {detailQuery.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
            <p className="font-semibold">{errorText(detailQuery.error)}</p>
            <button
              type="button"
              onClick={() => detailQuery.refetch()}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-red-600 px-4 py-2 text-base font-semibold text-white hover:bg-red-700"
            >
              Tải lại
            </button>
          </div>
        )}

        {/* Form Body */}
        {!detailQuery.isPending && !detailQuery.isError && (
          <form onSubmit={handleSaveDraft} className="space-y-6">
            {/* Citizenship selection */}
            <div>
              <label htmlFor="citizenship-kind-select" className="block text-sm font-semibold text-slate-700 mb-1">
                Loại quốc tịch khai báo
              </label>
              <select
                id="citizenship-kind-select"
                value={citizenshipKind}
                disabled={!isEditable || !canManage}
                onChange={(e) => {
                  setCitizenshipOverride(e.target.value as CitizenshipKind);
                  setFormEdits({});
                }}
                className={selectClass}
              >
                <option value="VIETNAMESE">Người Việt Nam (API 5 - Báo cáo lưu trú nội địa)</option>
                <option value="FOREIGN">Người nước ngoài (API 4 - Báo cáo tạm trú người nước ngoài)</option>
              </select>
            </div>

            {/* Vietnamese Form */}
            {citizenshipKind === "VIETNAMESE" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="hoTen" className="block text-sm font-semibold text-slate-700 mb-1">
                      Họ và tên <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="hoTen"
                      type="text"
                      required
                      value={String(formData.hoTen ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("hoTen", e.target.value)}
                      className={inputClass}
                      placeholder="NGUYEN VAN A"
                    />
                  </div>

                  <div>
                    <label htmlFor="gioiTinh" className="block text-sm font-semibold text-slate-700 mb-1">
                      Giới tính <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="gioiTinh"
                      value={String(formData.gioiTinh ?? "M")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("gioiTinh", e.target.value)}
                      className={selectClass}
                    >
                      <option value="M">Nam (M)</option>
                      <option value="F">Nữ (F)</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ngayThangNamSinhStr" className="block text-sm font-semibold text-slate-700 mb-1">
                      Ngày sinh (YYYY-MM-DD) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="ngayThangNamSinhStr"
                      type="text"
                      required
                      placeholder="1990-01-15"
                      value={String(formData.ngayThangNamSinhStr ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("ngayThangNamSinhStr", e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="soDienThoai" className="block text-sm font-semibold text-slate-700 mb-1">
                      Số điện thoại
                    </label>
                    <input
                      id="soDienThoai"
                      type="tel"
                      value={String(formData.soDienThoai ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("soDienThoai", e.target.value || null)}
                      className={inputClass}
                      placeholder="0912345678"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="loaiGiayTo" className="block text-sm font-semibold text-slate-700 mb-1">
                      Loại giấy tờ <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="loaiGiayTo"
                      required
                      value={formData.loaiGiayTo === undefined ? "" : String(formData.loaiGiayTo)}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("loaiGiayTo", e.target.value ? Number(e.target.value) : undefined)}
                      className={selectClass}
                    >
                      <option value="">Chọn loại giấy tờ</option>
                      {(documentTypesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>{item.nameVi}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="soGiayTo" className="block text-sm font-semibold text-slate-700 mb-1">
                      Số giấy tờ <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="soGiayTo"
                      type="text"
                      required
                      value={String(formData.soGiayTo ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("soGiayTo", e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
                      className={inputClass}
                      placeholder="Không chứa dấu cách hoặc ký tự đặc biệt"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="lyDoCuTru" className="block text-sm font-semibold text-slate-700 mb-1">
                      Lý do cư trú (Mã BCA) <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="lyDoCuTru"
                      required
                      value={formData.lyDoCuTru === undefined ? "" : String(formData.lyDoCuTru)}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("lyDoCuTru", e.target.value ? Number(e.target.value) : undefined)}
                      className={selectClass}
                    >
                      <option value="">Chọn lý do cư trú</option>
                      {(stayReasonsQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>{item.nameVi}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="lyDoChiTiet" className="block text-sm font-semibold text-slate-700 mb-1">
                      Lý do chi tiết (bắt buộc khi lý do là 20)
                    </label>
                    <input
                      id="lyDoChiTiet"
                      type="text"
                      value={String(formData.lyDoChiTiet ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("lyDoChiTiet", e.target.value || null)}
                      className={inputClass}
                      placeholder="Nêu rõ mục đích cư trú"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="soPhong" className="block text-sm font-semibold text-slate-700 mb-1">
                      Số phòng <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="soPhong"
                      type="text"
                      required
                      value={String(formData.soPhong ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("soPhong", e.target.value)}
                      className={inputClass}
                      placeholder="101"
                    />
                  </div>

                  <div>
                    <label htmlFor="ngayDenCsltStr" className="block text-sm font-semibold text-slate-700 mb-1">
                      Ngày đến <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="ngayDenCsltStr"
                      type="text"
                      required
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.ngayDenCsltStr ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("ngayDenCsltStr", e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="ngayDiDuKienStr" className="block text-sm font-semibold text-slate-700 mb-1">
                      Ngày đi dự kiến <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="ngayDiDuKienStr"
                      type="text"
                      required
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.ngayDiDuKienStr ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("ngayDiDuKienStr", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="maTT" className="block text-sm font-semibold text-slate-700 mb-1">
                      Mã tỉnh/TP (Mã BCA)
                    </label>
                    <select
                      id="maTT"
                      value={String(formData.maTT ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => {
                        updateField("maTT", e.target.value || null);
                        updateField("maPX", null);
                      }}
                      className={selectClass}
                    >
                      <option value="">Chọn tỉnh/thành phố</option>
                      {(provincesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>{item.nameVi}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="maPX" className="block text-sm font-semibold text-slate-700 mb-1">
                      Mã phường/xã (Mã BCA)
                    </label>
                    <select
                      id="maPX"
                      value={String(formData.maPX ?? "")}
                      disabled={!isEditable || !canManage || !provinceCode}
                      onChange={(e) => updateField("maPX", e.target.value || null)}
                      className={selectClass}
                    >
                      <option value="">Chọn phường/xã</option>
                      {(wardsQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>{item.nameVi}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="noiCuTru" className="block text-sm font-semibold text-slate-700 mb-1">
                      Nơi cư trú (Mã BCA)
                    </label>
                    <select
                      id="noiCuTru"
                      value={formData.noiCuTru === undefined || formData.noiCuTru === null ? "" : String(formData.noiCuTru)}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("noiCuTru", e.target.value ? Number(e.target.value) : null)}
                      className={selectClass}
                    >
                      <option value="">Chọn nơi cư trú</option>
                      {(residencePlacesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>{item.nameVi}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="diaChi" className="block text-sm font-semibold text-slate-700 mb-1">
                    Địa chỉ chi tiết
                  </label>
                  <input
                    id="diaChi"
                    type="text"
                    value={String(formData.diaChi ?? "")}
                    disabled={!isEditable || !canManage}
                    onChange={(e) => updateField("diaChi", e.target.value || null)}
                    className={inputClass}
                    placeholder="Số nhà, đường phố..."
                  />
                </div>

                <div>
                  <label htmlFor="ghiChu" className="block text-sm font-semibold text-slate-700 mb-1">
                    Ghi chú
                  </label>
                  <textarea
                    id="ghiChu"
                    rows={2}
                    value={String(formData.ghiChu ?? "")}
                    disabled={!isEditable || !canManage}
                    onChange={(e) => updateField("ghiChu", e.target.value || null)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition-all focus:border-[#064e3b] focus:ring-2 focus:ring-[#064e3b]/15"
                    placeholder="Ghi chú thêm về khách lưu trú"
                  />
                </div>
              </div>
            ) : (
              /* Foreign Form */
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="f-hoTen" className="block text-sm font-semibold text-slate-700 mb-1">
                      Họ và tên <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-hoTen"
                      type="text"
                      required
                      value={String(formData.hoTen ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("hoTen", e.target.value)}
                      className={inputClass}
                      placeholder="JOHN DOE"
                    />
                  </div>

                  <div>
                    <label htmlFor="quocTich" className="block text-sm font-semibold text-slate-700 mb-1">
                      Mã quốc tịch BCA <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="quocTich"
                      required
                      value={String(formData.quocTich ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("quocTich", e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Chọn quốc tịch</option>
                      {(nationalitiesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>{item.nameVi}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="soHoChieu" className="block text-sm font-semibold text-slate-700 mb-1">
                      Số hộ chiếu <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="soHoChieu"
                      type="text"
                      required
                      value={String(formData.soHoChieu ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("soHoChieu", e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
                      className={inputClass}
                      placeholder="A12345678"
                    />
                  </div>

                  <div>
                    <label htmlFor="f-gioiTinh" className="block text-sm font-semibold text-slate-700 mb-1">
                      Giới tính <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="f-gioiTinh"
                      value={String(formData.gioiTinh ?? "M")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("gioiTinh", e.target.value)}
                      className={selectClass}
                    >
                      <option value="M">Nam (M)</option>
                      <option value="F">Nữ (F)</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="loaiNgayThangNamSinh" className="block text-sm font-semibold text-slate-700 mb-1">
                      Loại ngày sinh <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="loaiNgayThangNamSinh"
                      value={String(formData.loaiNgayThangNamSinh ?? "D")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("loaiNgayThangNamSinh", e.target.value)}
                      className={selectClass}
                    >
                      <option value="D">D - Đầy đủ ngày/tháng/năm</option>
                      <option value="Y">Y - Chỉ có năm sinh (YYYY-01-01)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="f-ngayThangNamSinhStr" className="block text-sm font-semibold text-slate-700 mb-1">
                      Ngày sinh (YYYY-MM-DD) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-ngayThangNamSinhStr"
                      type="text"
                      required
                      placeholder={formData.loaiNgayThangNamSinh === "Y" ? "1985-01-01" : "1985-06-20"}
                      value={String(formData.ngayThangNamSinhStr ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("ngayThangNamSinhStr", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="f-soPhong" className="block text-sm font-semibold text-slate-700 mb-1">
                      Số phòng <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-soPhong"
                      type="text"
                      required
                      value={String(formData.soPhong ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("soPhong", e.target.value)}
                      className={inputClass}
                      placeholder="201"
                    />
                  </div>

                  <div>
                    <label htmlFor="thoiHanTamTruStr" className="block text-sm font-semibold text-slate-700 mb-1">
                      Thời hạn tạm trú <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="thoiHanTamTruStr"
                      type="text"
                      required
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.thoiHanTamTruStr ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("thoiHanTamTruStr", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="f-ngayDenCsltStr" className="block text-sm font-semibold text-slate-700 mb-1">
                      Ngày đến <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-ngayDenCsltStr"
                      type="text"
                      required
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.ngayDenCsltStr ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("ngayDenCsltStr", e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="f-ngayDiDuKienStr" className="block text-sm font-semibold text-slate-700 mb-1">
                      Ngày đi dự kiến <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-ngayDiDuKienStr"
                      type="text"
                      required
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.ngayDiDuKienStr ?? "")}
                      disabled={!isEditable || !canManage}
                      onChange={(e) => updateField("ngayDiDuKienStr", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex flex-col-reverse gap-3 pt-4 border-t border-slate-100 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b]"
              >
                Đóng
              </button>

              {canManage && isEditable && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-bold text-slate-800 shadow-xs transition-all hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] disabled:opacity-50"
                  >
                    {saveMutation.isPending && (
                      <svg className="h-4 w-4 animate-spin text-slate-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    Lưu bản nháp
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleMarkReady}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#064e3b] px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-[#043327] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] disabled:opacity-50"
                  >
                    {readyMutation.isPending && (
                      <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    Đánh dấu sẵn sàng
                  </button>
                </div>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
