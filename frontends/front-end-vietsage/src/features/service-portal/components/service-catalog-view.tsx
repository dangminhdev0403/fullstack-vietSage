"use client";

import { useState } from "react";
import { toast } from "sonner";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { SwalVietSage } from "@/libs/swal";
import { useServicePortal } from "../use-service-portal";
import type { ServiceItem, ServicePortalData } from "../types";
import type { MarketplaceCategorySheetPreview } from "@/features/marketplace-admin/types";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);

export function ServiceCatalogView({ data }: Readonly<{ data: ServicePortalData }>) {
  const { update, importPreview, importCommit, data: queryData } = useServicePortal();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "DISABLED" | "DRAFT">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [sheetPreview, setSheetPreview] = useState<MarketplaceCategorySheetPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [cachedCsvData, setCachedCsvData] = useState<string | null>(null);

  const fetchGoogleSheetCsv = async (): Promise<string> => {
    const response = await fetch("/api/service-portal?file=sheet", { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        data?: { detail?: string };
      } | null;
      const detailMsg =
        payload?.data?.detail && payload.data.detail !== "VALIDATION_ERROR"
          ? payload.data.detail
          : payload?.message && payload.message !== "VALIDATION_ERROR"
          ? payload.message
          : "Không thể truy cập Google Sheets / Excel Online đã lưu. Vui lòng liên hệ Super Admin.";
      throw new Error(detailMsg);
    }
    const text = await response.text();
    if (!text || text.includes("<!DOCTYPE html") || text.includes("<html")) {
      throw new Error("Bảng tính Google Sheets / Excel Online chưa được mở quyền truy cập công khai. Vui lòng chọn 'Chia sẻ' -> 'Bất kỳ ai có liên kết'.");
    }
    return text;
  };

  const findStoredSheetUrl = (): string =>
    (queryData.data?.profile?.googleSheetsUrl ?? data.profile.googleSheetsUrl ?? "").trim();

  const handlePreviewSheet = async () => {
    const sheetUrl = findStoredSheetUrl();
    if (!sheetUrl.trim()) {
      setPreviewError("Super Admin chưa gán link Google Sheets / Excel Online cho đối tác. Vui lòng liên hệ Super Admin.");
      return;
    }

    setIsPreviewing(true);
    setPreviewError(null);
    try {
      const csvData = await fetchGoogleSheetCsv();
      setCachedCsvData(csvData);
      const res = await importPreview.mutateAsync({ csv: csvData, fileName: "google-sheet.csv" });
      setSheetPreview(res as unknown as MarketplaceCategorySheetPreview);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Đã xảy ra lỗi khi đọc bảng tính. Vui lòng kiểm tra lại đường link.";
      setPreviewError(errorMessage);
      setSheetPreview(null);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleCommitSheet = async () => {
    if (!sheetPreview || !cachedCsvData) return;

    setIsCommitting(true);
    try {
      await importCommit.mutateAsync({
        csv: cachedCsvData,
        fileName: "google-sheet.csv",
        previewToken: (sheetPreview as unknown as { previewToken: string }).previewToken,
      });

      await queryData.refetch();
      setSheetPreview(null);
      setCachedCsvData(null);

      await SwalVietSage.fire({
        icon: "success",
        title: "Đồng bộ thành công!",
        text: "Đã tự động áp dụng các thay đổi từ Google Sheets / Excel Online vào danh mục dịch vụ.",
      });
      toast.success("Đã đồng bộ thực đơn dịch vụ thành công!");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Không thể áp dụng thay đổi. Vui lòng thử lại.";
      await SwalVietSage.fire({
        icon: "error",
        title: "Đồng bộ thất bại",
        text: errorMessage,
      });
    } finally {
      setIsCommitting(false);
    }
  };

  const handleEditNotice = async (item: ServiceItem) => {
    const result = await SwalVietSage.fire({
      title: `Cập nhật: ${item.name}`,
      html: `<input id="swal-name" class="swal2-input" value="${escapeHtml(item.name)}"><input id="swal-price" class="swal2-input" type="number" min="0" value="${Number(item.unitPrice)}"><input id="swal-waiting" class="swal2-input" type="number" min="0" value="${item.waitingMinutes}">`,
      showCancelButton: true, confirmButtonText: "Lưu", cancelButtonText: "Hủy",
      preConfirm: () => ({ name: (document.getElementById("swal-name") as HTMLInputElement).value.trim(), unitPrice: Number((document.getElementById("swal-price") as HTMLInputElement).value), waitingMinutes: Number((document.getElementById("swal-waiting") as HTMLInputElement).value) }),
    });
    if (!result.isConfirmed) return;
    update.mutate({ serviceId: item.id, data: result.value }, { onSuccess: () => toast.success("Cập nhật dịch vụ thành công"), onError: () => toast.error("Không thể cập nhật dịch vụ") });
  };

  const filteredServices = data.services.filter((item) => {
    const name = item.name.toLowerCase();
    const catName = (item.category?.nameVi ?? "").toLowerCase();
    const matchesSearch =
      !searchTerm.trim() ||
      name.includes(searchTerm.toLowerCase()) ||
      catName.includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filteredServices.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleServices = filteredServices.slice((safePage - 1) * pageSize, safePage * pageSize);

  const totalCount = data.services.length;
  const activeCount = data.services.filter((s) => s.status === "ACTIVE").length;
  const inactiveCount = totalCount - activeCount;

  const currentSheetUrl = findStoredSheetUrl();

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200/60">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                QUẢN LÝ DỊCH VỤ B2B
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
              Service Catalog / Danh Mục Dịch Vụ
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Quản lý bảng giá, thời gian chuẩn bị và hình thức phục vụ của các dịch vụ trong hệ thống.
            </p>
          </div>

          {/* Catalog Summary Stats */}
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-center shadow-2xs">
              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng dịch vụ</span>
              <span className="text-lg font-black text-slate-900">{totalCount}</span>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2 text-center shadow-2xs">
              <span className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Đang hoạt động</span>
              <span className="text-lg font-black text-emerald-800">{activeCount}</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-center shadow-2xs">
              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tạm ẩn</span>
              <span className="text-lg font-black text-slate-700">{inactiveCount}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Online Sheet Sync Panel (Prominent, High Readability Design) */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 md:p-7 shadow-sm space-y-5">
        {/* Card Header */}
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 shrink-0 mt-0.5 shadow-2xs">
            <VsIcon name="info" className="text-xl text-emerald-700" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2">
              Quản lý & Đồng bộ qua Google Sheets / Excel Online
            </h2>
            <p className="text-sm text-slate-600 font-medium leading-relaxed">
              Nhập URL Google Sheets (tab &quot;service-items&quot; / &quot;services&quot;) để kiểm tra dữ liệu, đối soát thay đổi & đồng bộ thực đơn/dịch vụ lên hệ thống.
            </p>
          </div>
        </div>

        {/* Input & Kiểm tra dữ liệu Action Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              readOnly
              value={currentSheetUrl}
              placeholder="Super Admin chưa gán link Google Sheets / Excel Online cho đối tác..."
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4.5 py-3 text-sm font-mono text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
          </div>
          <button
            type="button"
            onClick={handlePreviewSheet}
            disabled={isPreviewing || !currentSheetUrl}
            className="h-12 inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#1e3a34] hover:bg-[#172e29] text-white px-7 text-sm font-extrabold transition-all disabled:opacity-50 shrink-0 shadow-xs cursor-pointer"
          >
            <VsIcon name="info" className="text-base" />
            {isPreviewing ? "Đang kiểm tra..." : "Kiểm tra dữ liệu"}
          </button>
        </div>

        {/* Preview Error Banner */}
        {previewError && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-900 font-semibold flex items-center gap-3">
            <VsIcon name="warning" className="text-lg text-rose-600 shrink-0" />
            <span>{previewError}</span>
          </div>
        )}

        {/* Preview Breakdown Section */}
        {sheetPreview && (
          <div className="space-y-5 pt-5 border-t border-slate-100">
            {/* 5 Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-900 shadow-2xs">
                <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">TẠO MỚI</p>
                <p className="mt-1 text-3xl font-black">{sheetPreview.summary.creates ?? sheetPreview.summary.create ?? 0}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900 shadow-2xs">
                <p className="text-xs font-extrabold uppercase tracking-wider text-amber-700">CẬP NHẬT</p>
                <p className="mt-1 text-3xl font-black">{sheetPreview.summary.updates ?? sheetPreview.summary.update ?? 0}</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-rose-900 shadow-2xs">
                <p className="text-xs font-extrabold uppercase tracking-wider text-rose-700">GỠ BỎ / TẮT</p>
                <p className="mt-1 text-3xl font-black">{sheetPreview.summary.disables ?? sheetPreview.summary.disable ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 text-slate-900 shadow-2xs">
                <p className="text-xs font-extrabold uppercase tracking-wider text-slate-600">KHÔNG ĐỔI</p>
                <p className="mt-1 text-3xl font-black">{sheetPreview.summary.unchanged}</p>
              </div>
              <div className={`rounded-xl border p-4 shadow-2xs ${sheetPreview.summary.errors > 0 ? "border-rose-300 bg-rose-50 text-rose-900" : "border-slate-200 bg-slate-50 text-slate-900"}`}>
                <p className={`text-xs font-extrabold uppercase tracking-wider ${sheetPreview.summary.errors > 0 ? "text-rose-700" : "text-slate-600"}`}>LỖI</p>
                <p className="mt-1 text-3xl font-black">{sheetPreview.summary.errors}</p>
              </div>
            </div>

            {/* Validation Errors Box */}
            {sheetPreview.validation.length > 0 && (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 space-y-3 shadow-2xs">
                <p className="text-base font-extrabold text-rose-900 flex items-center gap-2.5">
                  <VsIcon name="warning" className="text-xl text-rose-600" />
                  Lỗi cần xử lý trong Google Sheets ({sheetPreview.validation.length} dòng):
                </p>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                  {sheetPreview.validation.map((v, idx) => (
                    <div key={idx} className="text-sm font-semibold text-rose-900 bg-white p-3 rounded-xl border border-rose-200 flex items-start gap-2.5 shadow-2xs">
                      <span className="font-mono font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md text-xs shrink-0">
                        {v.row ? `Hàng ${v.row}` : "Bảng tính"}{v.col ? `, Cột ${v.col}` : ""}
                      </span>
                      <span className="leading-snug">{v.message} {v.value ? `(Giá trị: "${v.value}")` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diff Preview Table */}
            {sheetPreview.diff.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-base font-black text-slate-900">Chi tiết thay đổi dữ liệu ({sheetPreview.diff.length} dịch vụ):</p>
                <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-extrabold uppercase text-xs">
                        <th className="p-3.5">HÀNH ĐỘNG</th>
                        <th className="p-3.5">KEY</th>
                        <th className="p-3.5">TÊN TIẾNG VIỆT</th>
                        <th className="p-3.5">CHI TIẾT THAY ĐỔI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {sheetPreview.diff.map((d, i) => (
                        <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 font-extrabold whitespace-nowrap">
                            {d.action === "create" && <span className="text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 text-xs">Tạo mới</span>}
                            {d.action === "update" && <span className="text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 text-xs">Cập nhật</span>}
                            {d.action === "disable" && <span className="text-rose-800 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 text-xs">Gỡ bỏ / Tắt</span>}
                            {d.action === "unchanged" && <span className="text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 text-xs">Không đổi</span>}
                          </td>
                          <td className="p-3.5 font-mono font-bold text-slate-900">{d.key || "—"}</td>
                          <td className="p-3.5 font-bold text-slate-900">
                            {String((d.payload as Record<string, unknown> | undefined)?.nameVi ?? d.label ?? "—")}
                          </td>
                          <td className="p-3.5 text-slate-700">
                            {d.changes ? (
                              <div className="space-y-1">
                                {Object.entries(d.changes).map(([field, change]) => (
                                  <div key={field} className="font-mono text-xs">
                                    <span className="font-bold text-slate-900">{field}:</span> {String((change as { from?: unknown })?.from ?? "")} &rarr; <span className="font-bold text-amber-800">{String((change as { to?: unknown })?.to ?? "")}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bottom Commit Action Button */}
            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={handleCommitSheet}
                disabled={isCommitting || sheetPreview.summary.errors > 0}
                className="h-12 inline-flex items-center gap-2.5 rounded-full bg-[#1e3a34] hover:bg-[#172e29] text-white px-8 text-sm font-extrabold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <VsIcon name="info" className="text-base" />
                {isCommitting ? "Đang áp dụng..." : "Áp dụng thay đổi"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Main Section */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          {/* Header & Filter Toolbar */}
          <div className="space-y-3.5 border-b border-slate-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <span>📦</span> Service Catalog
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200/80">
                  {filteredServices.length} / {totalCount} dịch vụ
                </span>
              </h2>
            </div>

            {/* Filter Toolbar: Search + Category Filter + Status Filter */}
            <div className="flex flex-col md:flex-row gap-3">
              {/* Compact Search Bar */}
              <div className="relative flex-1">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  placeholder="Tìm kiếm dịch vụ..."
                  className="h-9.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-8 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-600/10 transition-all"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => { setStatusFilter("all"); setPage(1); }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                    statusFilter === "all" ? "bg-white text-slate-900 shadow-2xs border border-slate-200/60" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => { setStatusFilter("ACTIVE"); setPage(1); }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                    statusFilter === "ACTIVE" ? "bg-white text-emerald-800 shadow-2xs border border-emerald-200/80" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Đang hoạt động
                </button>
                <button
                  type="button"
                  onClick={() => { setStatusFilter("DISABLED"); setPage(1); }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                    statusFilter === "DISABLED" ? "bg-white text-slate-900 shadow-2xs border border-slate-200/60" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Tạm ẩn
                </button>
              </div>
            </div>
          </div>

          {/* Full-Width Structured B2B Service List */}
          {filteredServices.length > 0 ? (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs">
              {visibleServices.map((item) => (
                <article
                  key={item.id}
                  className="group p-4 transition-all hover:bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left Column: Title, Category Badge, Status Badge & Operational Info */}
                  <div className="space-y-2 flex-1 min-w-0">
                    {/* Header Row: Service Name + Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors">
                        {item.name}
                      </h3>

                      {/* Category Badge */}
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200/70 px-2 py-0.5 text-xs font-bold text-amber-800">
                        {item.category?.nameVi ?? "Dịch vụ"}
                      </span>

                      {/* Status Badge */}
                      {item.status === "ACTIVE" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Đang hoạt động
                        </span>
                      ) : item.status === "DISABLED" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Tạm ẩn
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                          Nháp
                        </span>
                      )}
                    </div>

                    {/* Operational Attributes Row */}
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500">
                      {/* Price */}
                      <span className="font-extrabold text-slate-900 text-sm">
                        {Number(item.unitPrice).toLocaleString("vi-VN")} VND
                      </span>

                      <span className="text-slate-300">•</span>

                      {/* Preparation Time */}
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Chuẩn bị: <b>{item.waitingMinutes} phút</b>
                      </span>

                      <span className="text-slate-300">•</span>

                      {/* Fulfillment Method */}
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                        {item.mode === "DELIVERY_TO_HOTEL" ? (
                          <>
                            <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            Giao tận nơi
                          </>
                        ) : (
                          <>
                            <svg className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Tại địa điểm dịch vụ
                          </>
                        )}
                      </span>

                      <span className="text-slate-300">•</span>

                      {/* Capacity */}
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {item.capacityAvailable ? `Sức chứa: ${item.capacityAvailable}/lượt` : "Sức chứa: Không giới hạn"}
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Primary Actions */}
                  <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                    <button type="button" onClick={() => update.mutate({ serviceId: item.id, data: { status: item.status === "ACTIVE" ? "DISABLED" : "ACTIVE" } }, { onSuccess: () => toast.success(item.status === "ACTIVE" ? "Đã tạm ẩn dịch vụ" : "Đã kích hoạt dịch vụ"), onError: () => toast.error("Không thể thay đổi trạng thái dịch vụ") })} className={`rounded-xl border px-3 py-1.5 text-xs font-bold shadow-2xs transition-all ${item.status === "ACTIVE" ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>
                      {item.status === "ACTIVE" ? "Tạm ẩn" : "Kích hoạt"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditNotice(item)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1"
                    >
                      <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Chỉnh sửa
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-medium text-slate-500 shadow-2xs">
              Chưa có dịch vụ nào trong menu phù hợp bộ lọc. Vui lòng thử lại hoặc dùng form bên trái để tạo dịch vụ mới.
            </div>
          )}
          {filteredServices.length > pageSize ? (
            <nav aria-label="Phân trang dịch vụ" className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
              <span className="text-slate-500">Trang {safePage}/{pageCount}</span>
              <div className="flex gap-2">
                <button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-40">Trước</button>
                <button type="button" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-40">Sau</button>
              </div>
            </nav>
          ) : null}
      </section>
    </div>
  );
}

