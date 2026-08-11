"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SwalVietSage } from "@/libs/swal";
import { useServicePortal } from "../use-service-portal";
import type { ServiceItem, ServicePortalData } from "../types";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-600/10 transition-all";

const labelClass = "block text-xs font-bold text-slate-700 mb-1.5";

export function ServiceCatalogView({ data }: Readonly<{ data: ServicePortalData }>) {
  const { create } = useServicePortal();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "DISABLED" | "DRAFT">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const createService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const serviceName = String(form.get("name"));

    const confirmRes = await SwalVietSage.fire({
      icon: "question",
      title: "Tạo dịch vụ mới?",
      text: `Bạn có chắc chắn muốn thêm dịch vụ "${serviceName}" vào danh mục cung cấp không?`,
      showCancelButton: true,
      confirmButtonText: "Xác nhận tạo",
      cancelButtonText: "Hủy bỏ",
    });

    if (!confirmRes.isConfirmed) return;

    create.mutate(
      {
        categoryId: String(form.get("categoryId")),
        name: serviceName,
        unitPrice: Number(form.get("unitPrice")),
        imageUrls: [],
        mode: String(form.get("mode")),
        capacityAvailable: form.get("capacity") ? Number(form.get("capacity")) : null,
        waitingMinutes: Number(form.get("waitingMinutes")),
        status: "ACTIVE",
      },
      {
        onSuccess: () => {
          toast.success("Tạo dịch vụ mới thành công!");
          formElement.reset();
        },
        onError: () => {
          toast.error("Không thể tạo dịch vụ mới. Vui lòng kiểm tra lại.");
        },
      },
    );
  };

  const handleEditNotice = (item: ServiceItem) => {
    void SwalVietSage.fire({
      icon: "info",
      title: `Chỉnh sửa: ${item.name}`,
      html: `Dịch vụ <b>${item.name}</b> hiện đang có giá <b>${Number(item.unitPrice).toLocaleString("vi-VN")} VND</b>.<br/><br/>Tính năng chỉnh sửa chi tiết đang được đồng bộ trực tiếp với hệ thống quản lý.`,
      showConfirmButton: true,
      confirmButtonText: "OK",
    });
  };

  const filteredServices = data.services.filter((item) => {
    const name = item.name.toLowerCase();
    const catName = (item.category?.nameVi ?? "").toLowerCase();
    const matchesSearch =
      !searchTerm.trim() ||
      name.includes(searchTerm.toLowerCase()) ||
      catName.includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (categoryFilter !== "all" && item.categoryId !== categoryFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filteredServices.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleServices = filteredServices.slice((safePage - 1) * pageSize, safePage * pageSize);


  const totalCount = data.services.length;
  const activeCount = data.services.filter((s) => s.status === "ACTIVE").length;
  const inactiveCount = totalCount - activeCount;

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
              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tạm dừng</span>
              <span className="text-lg font-black text-slate-700">{inactiveCount}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid Section */}
      <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Left Sidebar: Create New Service Form */}
        <form onSubmit={createService} className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs h-fit">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs font-black text-emerald-800">+</span>
              Thêm dịch vụ mới
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">Khởi tạo sản phẩm / dịch vụ vào menu</p>
          </div>

          <div className="space-y-3.5">
            <div>
              <label htmlFor="cat-id" className={labelClass}>
                Danh mục dịch vụ
              </label>
              <select id="cat-id" required name="categoryId" className={inputClass}>
                <option value="">-- Chọn danh mục --</option>
                {data.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nameVi}{item.translations?.find((t) => t.locale === "en")?.name ? ` (${item.translations.find((t) => t.locale === "en")!.name})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="service-name" className={labelClass}>
                Tên dịch vụ
              </label>
              <input
                id="service-name"
                required
                name="name"
                placeholder="Ví dụ: Massage body thảo dược (60p)"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="service-price" className={labelClass}>
                Giá dịch vụ (VND)
              </label>
              <input
                id="service-price"
                required
                min={0}
                type="number"
                name="unitPrice"
                placeholder="Ví dụ: 350000"
                className={inputClass}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <label htmlFor="service-waiting" className={labelClass}>
                  Thời gian chuẩn bị (Phút)
                </label>
                <input
                  id="service-waiting"
                  required
                  min={0}
                  type="number"
                  name="waitingMinutes"
                  placeholder="Ví dụ: 15"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="service-capacity" className={labelClass}>
                  Sức chứa / Lượt phục vụ
                </label>
                <input
                  id="service-capacity"
                  min={0}
                  type="number"
                  name="capacity"
                  placeholder="Trống = Không giới hạn"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="service-mode" className={labelClass}>
                Hình thức phục vụ
              </label>
              <select id="service-mode" name="mode" className={inputClass}>
                <option value="CUSTOMER_AT_SERVICE">Khách đến địa điểm dịch vụ</option>
                <option value="DELIVERY_TO_HOTEL">Giao tận nơi đến khách sạn</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={create.isPending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white transition-all hover:bg-emerald-800 disabled:opacity-50 shadow-xs"
          >
            {create.isPending ? "Đang khởi tạo..." : "+ Tạo dịch vụ mới"}
          </button>
        </form>

        {/* Right Dominant Area: Service Catalog List */}
        <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
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
                  placeholder="Tìm kiếm dịch vụ, danh mục..."
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

              {/* Category Filter Select */}
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="h-9.5 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:border-emerald-600 focus:outline-none transition-all"
              >
                <option value="all">Tất cả danh mục</option>
                {data.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nameVi}
                  </option>
                ))}
              </select>

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
                  Tạm dừng
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
                          Tạm dừng
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
                            Giao tới khách sạn
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
        </div>
      </section>
    </div>
  );
}

