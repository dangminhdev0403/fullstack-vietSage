"use client";

import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { marketplaceAdminResource } from "./resource";

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all";

const labelClass = "block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5";

function getErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;

  if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;
    const status = typeof errObj.status === "number" ? errObj.status : undefined;
    const data = errObj.data as Record<string, unknown> | null;

    let serverMessage: string | undefined;
    if (data && typeof data === "object") {
      if (typeof data.message === "string" && data.message.trim()) {
        serverMessage = data.message;
      } else if (Array.isArray(data.message) && data.message.length > 0) {
        serverMessage = data.message.join(", ");
      } else if (data.data && typeof data.data === "object") {
        const innerData = data.data as Record<string, unknown>;
        if (typeof innerData.message === "string" && innerData.message.trim()) {
          serverMessage = innerData.message;
        } else if (typeof innerData.detail === "string" && innerData.detail.trim()) {
          serverMessage = innerData.detail;
        }
      }
    }

    if (serverMessage) {
      return status ? `[HTTP ${status}] ${serverMessage}` : serverMessage;
    }

    if (status === 404) return "[HTTP 404] Không tìm thấy tài nguyên (404 Not Found).";
    if (status === 403) return "[HTTP 403] Bạn không có quyền thực hiện thao tác này (403 Forbidden).";
    if (status === 401) return "[HTTP 401] Chưa đăng nhập hoặc phiên làm việc hết hạn.";
    if (status === 400) return "[HTTP 400] Yêu cầu không hợp lệ hoặc thông tin nhập chưa đúng.";
    if (status) return `[HTTP ${status}] Thao tác thất bại với mã HTTP ${status}.`;

    if (typeof errObj.message === "string" && errObj.message.trim()) {
      return errObj.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function MarketplaceAdminClient() {
  const resource = marketplaceAdminResource.bind({});
  const data = useQuery(resource.queries.data.options(undefined as never));
  const mutation = useMutation(resource.mutations.mutate.options());

  const [hotelId, setHotelId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submitCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    mutation.mutate(
      {
        action: "category",
        input: {
          nameVi: String(form.get("nameVi")).trim(),
          nameEn: String(form.get("nameEn")).trim(),
          sortOrder: 0,
          isActive: true,
        },
      },
      {
        onSuccess: () => formElement.reset(),
      },
    );
  };

  const submitTenant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    mutation.mutate(
      {
        action: "tenant",
        input: {
          name: String(form.get("name")).trim(),
          displayName: String(form.get("displayName")).trim(),
          owner: {
            email: String(form.get("email")).trim(),
            fullName: String(form.get("fullName")).trim(),
            password: String(form.get("password")),
          },
        },
      },
      {
        onSuccess: () => formElement.reset(),
      },
    );
  };

  const submitLink = (event?: FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
    if (!hotelId || !tenantId) return;
    mutation.mutate(
      { action: "link", hotelId, serviceTenantId: tenantId },
      {
        onSuccess: () => {
          setHotelId("");
          setTenantId("");
        },
      },
    );
  };

  if (data.isPending) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 text-sm font-semibold text-slate-600 shadow-xs">
        <svg className="mr-3 h-5 w-5 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Đang tải cấu hình Marketplace...
      </div>
    );
  }

  if (data.isError || !data.data) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex items-center gap-3">
          <svg className="h-6 w-6 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3 className="font-bold text-rose-900">Không thể tải dữ liệu</h3>
            <p className="text-sm mt-0.5 text-rose-700">
              {getErrorMessage(data.error, "Không thể lấy thông tin Marketplace. Vui lòng kiểm tra quyền truy cập hoặc làm mới trang.")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast Feedback */}
      {mutation.isError ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 flex items-start gap-3 shadow-xs">
          <svg className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm font-medium">
            {getErrorMessage(mutation.error, "Không thể thực hiện thao tác. Vui lòng kiểm tra lại thông tin nhập hoặc quyền hạn.")}
          </div>
        </div>
      ) : mutation.isSuccess ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-start gap-3 shadow-xs">
          <svg className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm font-medium">Thao tác đã hoàn tất thành công!</div>
        </div>
      ) : null}

      {/* Forms Section */}
      <section className="grid gap-6 xl:grid-cols-2">
        {/* Category Form */}
        <form onSubmit={submitCategory} className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Thêm Danh Mục Dịch Vụ</h2>
              <p className="text-xs text-slate-500">Tạo phân loại dịch vụ mới trên hệ thống Marketplace</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cat-name-vi" className={labelClass}>
                  Tên tiếng Việt
                </label>
                <input
                  id="cat-name-vi"
                  required
                  name="nameVi"
                  placeholder="Ví dụ: Nhà hàng & Ẩm thực"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="cat-name-en" className={labelClass}>
                  Tên tiếng Anh (English Name)
                </label>
                <input
                  id="cat-name-en"
                  required
                  name="nameEn"
                  placeholder="Ví dụ: Restaurant & Dining"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            {mutation.isPending ? "Đang xử lý..." : "+ Tạo danh mục mới"}
          </button>
        </form>

        {/* Service Tenant Form */}
        <form onSubmit={submitTenant} className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m3 0h10M9 7h1m-1 4h1m4-4h1m-1 4h1" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Đối tác dịch vụ bên ngoài</h2>
              <p className="text-xs text-slate-500">Khởi tạo đối tác cung cấp dịch vụ và tài khoản quản trị</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tenant-name" className={labelClass}>
                Tên pháp lý / Công ty
              </label>
              <input
                id="tenant-name"
                required
                name="name"
                placeholder="Ví dụ: Công ty TNHH An Nhiên"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="tenant-display-name" className={labelClass}>
                Tên thương hiệu hiển thị
              </label>
              <input
                id="tenant-display-name"
                required
                name="displayName"
                placeholder="Ví dụ: An Nhiên Spa & Wellness"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="owner-fullname" className={labelClass}>
                Họ tên người quản lý
              </label>
              <input
                id="owner-fullname"
                required
                name="fullName"
                placeholder="Ví dụ: Nguyễn Văn Ánh"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="owner-email" className={labelClass}>
                Email tài khoản Owner
              </label>
              <input
                id="owner-email"
                required
                type="email"
                name="email"
                placeholder="Ví dụ: owner@annhien.vn"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="owner-password" className={labelClass}>
                Mật khẩu ban đầu (Min 8 ký tự)
              </label>
              <div className="relative flex items-center">
                <input
                  id="owner-password"
                  required
                  minLength={8}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Tối thiểu 8 ký tự..."
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.03 10.03 0 013.122-.463c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            {mutation.isPending ? "Đang xử lý..." : "+ Tạo đối tác dịch vụ bên ngoài"}
          </button>
        </form>
      </section>

      {/* Hotel ↔ Service Tenant Linking */}
      <section className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Liên Kết Khách Sạn ↔ Đối Tác Dịch Vụ</h2>
              <p className="text-xs text-slate-500">Ủy quyền đối tác dịch vụ được phép phục vụ khách tại khách sạn</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {data.data.links.length} Liên kết đã kích hoạt
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="select-hotel" className={labelClass}>
              Chọn Khách Sạn
            </label>
            <select
              id="select-hotel"
              aria-label="Khách sạn"
              className={inputClass}
              value={hotelId}
              onChange={(e) => setHotelId(e.target.value)}
            >
              <option value="">-- Chọn khách sạn tiếp nhận --</option>
              {data.data.hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name} ({hotel.code ?? "HOTEL"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="select-tenant" className={labelClass}>
              Chọn Đối Tác Dịch Vụ
            </label>
            <select
              id="select-tenant"
              aria-label="Đối tác dịch vụ"
              className={inputClass}
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            >
              <option value="">-- Chọn đối tác dịch vụ --</option>
              {data.data.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.serviceProfile?.displayName ?? tenant.name} ({tenant.code}){tenant.ownerEmail ? ` - ${tenant.ownerEmail}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              disabled={!hotelId || !tenantId || mutation.isPending}
              onClick={() => submitLink()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-40 md:w-auto"
            >
              🔗 Kích hoạt liên kết
            </button>
          </div>
        </div>

        {/* Existing Links Cards / List */}
        {data.data.links.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.links.map((link) => {
              const hotel = data.data.hotels.find((h) => h.id === link.hotelId);
              const tenantName = link.serviceTenant.serviceProfile?.displayName ?? link.serviceTenant.name;
              return (
                <div key={link.id} className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs">
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900 text-sm">{hotel?.name ?? "Khách sạn"}</div>
                    <div className="text-slate-600 flex items-center gap-1.5 font-medium">
                      <span>➔</span> {tenantName}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    link.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-slate-200 text-slate-700 border border-slate-300"
                  }`}>
                    {link.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs font-medium text-slate-400">
            Chưa có liên kết nào giữa khách sạn và đối tác dịch vụ.
          </div>
        )}
      </section>

      {/* Directory Records Section */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* Categories Directory */}
        <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              Danh mục dịch vụ
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold">
                {data.data.categories.length}
              </span>
            </h2>
          </div>

          {data.data.categories.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {data.data.categories.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-2xs">
                  <div>
                    <div className="font-bold text-slate-900 text-base">{item.nameVi}</div>
                    <div className="text-sm text-slate-500 font-medium">{item.nameEn}</div>
                  </div>
                  <span className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-mono font-bold text-slate-700 shadow-2xs">
                    {item.code}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Chưa có danh mục dịch vụ nào được tạo.</p>
          )}
        </div>

        {/* Tenants Directory */}
        <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              Danh sách đối tác dịch vụ
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold">
                {data.data.tenants.length}
              </span>
            </h2>
          </div>

          {data.data.tenants.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {data.data.tenants.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-2xs hover:border-emerald-200 hover:bg-white transition-all">
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900 text-base">
                      {item.serviceProfile?.displayName ?? item.name}
                    </div>
                    <div className="text-sm font-medium text-slate-600">{item.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold pt-0.5">
                      <svg className="h-3.5 w-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="font-mono">{item.ownerEmail ?? "Chưa có email tài khoản"}</span>
                    </div>
                  </div>
                  <span className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-mono font-bold text-slate-700 shadow-2xs">
                    {item.code}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Chưa có đối tác dịch vụ nào được tạo.</p>
          )}
        </div>
      </section>
    </div>
  );
}

