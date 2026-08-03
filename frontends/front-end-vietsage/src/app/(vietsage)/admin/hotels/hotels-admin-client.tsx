"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { Hotel, TenantOwner, TenantSummary } from "@/features/admin/types/admin-contract";
import { useAdminGoogleSheetConfig } from "@/features/hotel-ops/queries/use-google-sheet-config";

import { VsIcon } from "../../_components/vs-icon";

type HotelsAdminClientProps = {
  initialHotels: Hotel[];
  initialTenantOwners: TenantOwner[];
  total: number;
};

type TenantOption = {
  id: string;
  name: string;
  code: string;
};

type HotelFormState = {
  tenantId: string;
  name: string;
  timezone: string;
  status: "ACTIVE" | "DISABLED";
  brandSettingsText: string;
  googleSheetUrl: string;
};

const emptyHotelForm: HotelFormState = {
  tenantId: "",
  name: "",
  timezone: "Asia/Ho_Chi_Minh",
  status: "ACTIVE",
  brandSettingsText: "{}",
  googleSheetUrl: "",
};

type FormMode = "create" | "edit";

const createHotelFormSchema = z.object({
  tenantId: z.string().trim().min(1, "Vui lòng chọn tổ chức."),
  name: z.string().trim().min(1, "Tên khách sạn là bắt buộc."),
  timezone: z.string().trim().min(1, "Múi giờ là bắt buộc."),
});

const updateHotelFormSchema = z.object({
  name: z.string().trim().min(1, "Tên khách sạn là bắt buộc."),
  timezone: z.string().trim().min(1, "Múi giờ là bắt buộc."),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

function isValidTenant(tenant: TenantSummary | null | undefined): tenant is TenantSummary {
  return Boolean(tenant?.id);
}

function formatTenantDisplayName(name: string, code: string): string {
  const cleanName = name.trim();
  if (!cleanName || cleanName.toUpperCase() === "TENANT_OWNER" || cleanName.toUpperCase().startsWith("TENANT_OWNER_")) {
    const numericSuffix = code.replace(/^VSH_TENANT_0*/i, "").replace(/^0+/, "");
    return `Tổ chức Quản lý ${numericSuffix || code}`;
  }
  return cleanName;
}

function buildTenantOptions(tenantOwners: readonly TenantOwner[]): TenantOption[] {
  const byTenantId = new Map<string, TenantOption>();

  for (const owner of tenantOwners) {
    if (!isValidTenant(owner.tenant)) {
      continue;
    }

    if (!byTenantId.has(owner.tenant.id)) {
      byTenantId.set(owner.tenant.id, {
        id: owner.tenant.id,
        name: owner.tenant.name,
        code: owner.tenant.code,
      });
    }
  }

  return [...byTenantId.values()].sort((first, second) => first.name.localeCompare(second.name, "vi", { sensitivity: "base" }));
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function tenantLabel(tenantId: string, tenantOptions: readonly TenantOption[]): string {
  const tenant = tenantOptions.find((option) => option.id === tenantId);
  return tenant ? formatTenantDisplayName(tenant.name, tenant.code) : tenantId;
}

function hotelToForm(hotel: Hotel): HotelFormState {
  return {
    tenantId: hotel.tenantId,
    name: hotel.name,
    timezone: hotel.timezone === "Asia/Saigon" || !hotel.timezone ? "Asia/Ho_Chi_Minh" : hotel.timezone,
    status: hotel.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    brandSettingsText: JSON.stringify(hotel.brandSettings ?? {}, null, 2),
    googleSheetUrl: hotel.googleSheetId
      ? `https://docs.google.com/spreadsheets/d/${hotel.googleSheetId}/edit`
      : "",
  };
}

function parseBrandSettings(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Brand settings must be a JSON object or null.");
  }

  return parsed as Record<string, unknown>;
}

function toApiErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Không thể xử lý yêu cầu.";
  }

  const data = "data" in payload ? payload.data : null;
  if (data && typeof data === "object" && !Array.isArray(data) && "detail" in data) {
    const detail = data.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail.filter((item): item is string => typeof item === "string").join("\n");
    }
  }

  const message = "message" in payload ? payload.message : null;
  return typeof message === "string" && message.trim() ? message : "Không thể xử lý yêu cầu.";
}

async function requestJson<TData>(path: string, options: { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown }): Promise<TData> {
  try {
    const payload = await requestInternalApiEnvelope<TData>(path, options);
    return payload.data;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
    const callbackUrl = `${window.location.pathname}${window.location.search}`;
    console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
      source: "hotels-admin-client",
      reason: "backend_401_after_refresh_failed",
      pathname: callbackUrl,
    });
    window.location.assign(`/dangnhap?reauth=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    throw new Error("UNAUTHORIZED");
  }

    if (error instanceof HttpError) {
      throw new Error(toApiErrorMessage(error.data));
    }

    throw error;
  }
}

async function confirmHotelSave(mode: FormMode, hotelName: string, tenantName: string): Promise<boolean> {
  const result = await Swal.fire({
    icon: "question",
    title: mode === "create" ? "Tạo khách sạn?" : "Lưu thay đổi khách sạn?",
    text:
      mode === "create"
        ? `Tạo khách sạn ${hotelName} cho ${tenantName}.`
        : `Cập nhật thông tin khách sạn ${hotelName}.`,
    showCancelButton: true,
    reverseButtons: true,
    confirmButtonText: mode === "create" ? "Đồng ý tạo" : "Đồng ý lưu",
    cancelButtonText: "Hủy",
    confirmButtonColor: "#00003c",
    cancelButtonColor: "#767684",
  });

  return result.isConfirmed;
}

export function HotelsAdminClient({ initialHotels, initialTenantOwners, total }: HotelsAdminClientProps) {
  const router = useRouter();
  const [hotels, setHotels] = useState(initialHotels);
  const [query, setQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null);
  const [form, setForm] = useState(emptyHotelForm);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingHotelId, setLoadingHotelId] = useState<string | null>(null);
  const updateGoogleSheetConfig = useAdminGoogleSheetConfig(
    editingHotel?.id ?? "not-selected",
  );

  const tenantOptions = useMemo(() => buildTenantOptions(initialTenantOwners), [initialTenantOwners]);
  const hasTenantOptions = tenantOptions.length > 0;

  const filteredHotels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return hotels;
    }

    return hotels.filter((hotel) =>
      [hotel.name, hotel.code ?? "", hotel.timezone ?? "", tenantLabel(hotel.tenantId, tenantOptions)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [hotels, query, tenantOptions]);

  const activeCount = hotels.filter((hotel) => hotel.status === "ACTIVE" || !hotel.status).length;
  const tenantCount = tenantOptions.length;

  function openCreateDialog() {
    if (formMode === "create" && !hasTenantOptions) {
      return;
    }

    setFormMode("create");
    setEditingHotel(null);
    setForm({ ...emptyHotelForm, tenantId: tenantOptions[0]?.id ?? "" });
    setIsDialogOpen(true);
  }

  async function openEditDialog(hotel: Hotel) {
    try {
      setLoadingHotelId(hotel.id);
      const detail = await requestJson<Hotel>(`/api/admin/hotels/${encodeURIComponent(hotel.id)}`, {
        method: "GET",
      });
      setFormMode("edit");
      setEditingHotel(detail);
      setForm(hotelToForm(detail));
      setIsDialogOpen(true);
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return;
      }

      await Swal.fire({
        icon: "error",
        title: "Không thể tải khách sạn",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#00003c",
      });
    } finally {
      setLoadingHotelId(null);
    }
  }

  function closeDialog() {
    if (isSaving) {
      return;
    }

    setIsDialogOpen(false);
    setFormMode("create");
    setEditingHotel(null);
    setForm(emptyHotelForm);
  }

  async function submitHotel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasTenantOptions) {
      await Swal.fire({
        icon: "warning",
        title: "Chưa có tổ chức",
        text: "Cần có ít nhất một tổ chức hợp lệ trước khi tạo khách sạn.",
        confirmButtonColor: "#00003c",
      });
      return;
    }

    const validation = formMode === "create" ? createHotelFormSchema.safeParse(form) : updateHotelFormSchema.safeParse(form);
    if (!validation.success) {
      await Swal.fire({
        icon: "warning",
        title: "Kiểm tra thông tin",
        text: validation.error.issues[0]?.message ?? "Thông tin khách sạn chưa hợp lệ.",
        confirmButtonColor: "#00003c",
      });
      return;
    }

    const tenantExists = tenantOptions.some((tenant) => tenant.id === form.tenantId);
    if (formMode === "create" && !tenantExists) {
      await Swal.fire({
        icon: "warning",
        title: "Tổ chức không hợp lệ",
        text: "Vui lòng chọn tổ chức trong danh sách hiện có.",
        confirmButtonColor: "#00003c",
      });
      return;
    }

    if (formMode === "edit" && !editingHotel) {
      return;
    }

    let brandSettings: Record<string, unknown> | null;
    try {
      brandSettings = parseBrandSettings(form.brandSettingsText);
    } catch (error) {
      await Swal.fire({
        icon: "warning",
        title: "Kiểm tra brand settings",
        text: error instanceof Error ? error.message : "Brand settings không hợp lệ.",
        confirmButtonColor: "#00003c",
      });
      return;
    }

    const hotelName = form.name.trim();
    const confirmed = await confirmHotelSave(
      formMode,
      hotelName,
      tenantLabel(form.tenantId, tenantOptions),
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);
      const saved =
        formMode === "create"
          ? await requestJson<Hotel>("/api/admin/hotels", {
              method: "POST",
              body: {
                tenantId: form.tenantId,
                name: form.name.trim(),
                timezone: form.timezone.trim() || "Asia/Saigon",
                brandSettings: brandSettings ?? {},
                ...(form.googleSheetUrl.trim()
                  ? { googleSheetUrl: form.googleSheetUrl.trim() }
                  : {}),
              },
            })
          : await updateGoogleSheetConfig.mutateAsync({
                name: form.name.trim(),
                timezone: form.timezone.trim() || "Asia/Saigon",
                brandSettings,
                status: form.status,
                googleSheetUrl: form.googleSheetUrl.trim() || null,
            });

      setHotels((current) => {
        const exists = current.some((hotel) => hotel.id === saved.id);
        return exists ? current.map((hotel) => (hotel.id === saved.id ? saved : hotel)) : [saved, ...current];
      });
      setIsDialogOpen(false);
      setFormMode("create");
      setEditingHotel(null);
      setForm(emptyHotelForm);
      await Swal.fire({
        icon: "success",
        title: formMode === "create" ? "Đã tạo khách sạn" : "Đã cập nhật khách sạn",
        timer: 1400,
        showConfirmButton: false,
      });
      router.refresh();
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return;
      }
      await Swal.fire({
        icon: "error",
        title: formMode === "create" ? "Không thể tạo khách sạn" : "Không thể cập nhật khách sạn",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#00003c",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { label: "Tổng khách sạn", value: total || hotels.length, icon: "hotel" },
          { label: "Đang vận hành", value: activeCount, icon: "verified_user" },
          { label: "Tổ chức khả dụng", value: tenantCount, icon: "domain" },
        ].map((metric) => (
          <article key={metric.label} className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--on-surface-variant)]">{metric.label}</p>
                <p className="mt-3 text-4xl font-semibold text-[var(--primary)]">{metric.value}</p>
              </div>
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--secondary-container)] text-[var(--on-secondary-container)]">
                <VsIcon name={metric.icon} className="text-[24px]" />
              </span>
            </div>
          </article>
        ))}
      </section>

      {!hasTenantOptions ? (
        <section className="rounded-xl border border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-5 text-sm text-[var(--on-surface-variant)]">
          Cần có ít nhất một tổ chức hợp lệ trước khi tạo khách sạn. Tạo đối tác khách sạn ở mục Quản lý chủ sở hữu để thiết lập tổ chức trước.
        </section>
      ) : null}

      <section className="rounded-[1.4rem] border border-[#e8dfd1] bg-white/90 p-5 shadow-[0_16px_40px_rgba(23,32,27,0.05)] backdrop-blur-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <VsIcon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8b948d]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo khách sạn, mã, tổ chức..."
              className="w-full rounded-xl border border-[#e2d7c5] bg-[#faf6ef] pl-11 pr-4 py-3 text-sm font-semibold text-[#17201b] outline-none transition-all focus:border-[#24473d] focus:bg-white focus:ring-2 focus:ring-[#24473d]/20"
            />
          </div>
          <button
            type="button"
            onClick={openCreateDialog}
            disabled={!hasTenantOptions || isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#24473d] px-5 py-3 text-sm font-bold text-[#fff8e8] shadow-md shadow-[#24473d]/20 transition-all hover:bg-[#1a352d] active:scale-98 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <VsIcon name="hotel" className="text-lg text-[#e8b363]" />
            Tạo khách sạn
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.6rem] border border-[#e8dfd1] bg-white/95 shadow-[0_16px_45px_rgba(23,32,27,0.06)] backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-[#e5dcd0] bg-[#f6f1e7]/90 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#69726b]">
              <tr>
                <th className="px-6 py-4 font-extrabold">Khách sạn</th>
                <th className="px-6 py-4 font-extrabold">Tổ chức</th>
                <th className="px-6 py-4 font-extrabold">Trạng thái</th>
                <th className="px-6 py-4 font-extrabold">Múi giờ</th>
                <th className="px-6 py-4 font-extrabold">Cập nhật</th>
                <th className="px-6 py-4 text-right font-extrabold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2ebd9]">
              {filteredHotels.map((hotel) => (
                <tr key={hotel.id} className="transition-colors hover:bg-[#fcf8f2]">
                  <td className="px-6 py-4.5 align-middle">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#24473d] text-[#e8b363] shadow-xs ring-2 ring-[#e8b363]/30">
                        <VsIcon name="hotel" className="text-lg" />
                      </div>
                      <div>
                        <p className="font-extrabold text-[#17201b]">{hotel.name}</p>
                        <p className="text-xs font-medium text-[#69726b]">{hotel.code ?? hotel.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4.5 align-middle">
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfd1] bg-[#fbf8f2] px-3 py-1.5 font-sans text-xs font-bold text-[#17201b]">
                      <VsIcon name="domain" className="text-[#24473d]" />
                      {hotel.tenant ? formatTenantDisplayName(hotel.tenant.name, hotel.tenant.code) : tenantLabel(hotel.tenantId, tenantOptions)}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 align-middle">
                    {(hotel.status ?? "ACTIVE") === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cbe5d8] bg-[#ecf7f1] px-3.5 py-1 text-xs font-extrabold text-[#1a5d3f]">
                        <span className="h-2 w-2 rounded-full bg-[#1a5d3f] animate-pulse"></span>
                        Hoạt động
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2dad0] bg-[#f5efe8] px-3.5 py-1 text-xs font-extrabold text-[#6b6660]">
                        <span className="h-2 w-2 rounded-full bg-[#8c857d]"></span>
                        Tạm ngưng
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4.5 align-middle font-medium text-[#69726b]">
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#17201b]">
                      <VsIcon name="schedule" className="text-[#8b948d]" />
                      {hotel.timezone === "Asia/Saigon" || !hotel.timezone ? "Asia/Ho_Chi_Minh" : hotel.timezone}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 align-middle text-xs font-medium text-[#69726b]">{formatDate(hotel.updatedAt ?? hotel.createdAt)}</td>
                  <td className="px-6 py-4.5 text-right align-middle">
                    <button
                      type="button"
                      onClick={() => void openEditDialog(hotel)}
                      disabled={loadingHotelId === hotel.id || isSaving}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#dcd1bf] bg-[#fffcf7] px-4 py-1.5 text-xs font-bold text-[#24473d] shadow-2xs transition-all hover:border-[#24473d] hover:bg-[#f5efe4] disabled:opacity-50"
                    >
                      <VsIcon name="edit" className="text-sm" />
                      {loadingHotelId === hotel.id ? "Đang tải..." : "Sửa"}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredHotels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm font-semibold text-[#6d756e]">Chưa có khách sạn phù hợp.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {isDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={submitHotel} className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6 flex items-start justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-800">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {formMode === "create" ? "Tạo Khách Sạn Mới" : "Cập Nhật Khách Sạn"}
                </h2>
                <p className="mt-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {formMode === "create" ? "Khách sạn sẽ được phân quyền quản lý dưới Tổ chức đã chọn." : "Cập nhật cấu hình chi tiết khách sạn."}
                </p>
              </div>
              <button type="button" onClick={closeDialog} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" aria-label="Đóng">
                <VsIcon name="close" className="text-2xl" />
              </button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {formMode === "create" ? (
                <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300 md:col-span-2">
                  Tổ chức sở hữu
                  <select
                    value={form.tenantId}
                    onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition-all focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {tenantOptions.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {formatTenantDisplayName(tenant.name, tenant.code)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                Tên khách sạn
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ví dụ: Khách sạn Grand Saigon"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>

              <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                Múi giờ
                <input
                  value={form.timezone}
                  onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                  placeholder="Asia/Ho_Chi_Minh"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>

              {formMode === "edit" ? (
                <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                  Trạng thái hoạt động
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as HotelFormState["status"] }))}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition-all focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
                    <option value="DISABLED">Tạm ngưng (DISABLED)</option>
                  </select>
                </label>
              ) : null}

              <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300 md:col-span-2">
                Google Sheets tích hợp (Không bắt buộc)
                <input
                  type="url"
                  value={form.googleSheetUrl}
                  onChange={(event) => setForm((current) => ({ ...current, googleSheetUrl: event.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition-all focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <span className="block text-xs font-normal text-slate-500">
                  {formMode === "create"
                    ? "Có thể để trống và cấu hình sau. Nếu nhập, hệ thống sẽ kiểm tra quyền truy cập trước khi tạo."
                    : "Để trống để ngắt kết nối. Hệ thống kiểm tra quyền truy cập trước khi lưu."}
                </span>
              </label>

              <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300 md:col-span-2">
                Cấu hình thương hiệu (Brand Settings - JSON)
                <textarea
                  value={form.brandSettingsText}
                  onChange={(event) => setForm((current) => ({ ...current, brandSettingsText: event.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3 font-mono text-xs font-medium text-slate-900 outline-none transition-all focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSaving}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving || (formMode === "create" && !hasTenantOptions)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 active:scale-98 disabled:opacity-50"
              >
                {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
