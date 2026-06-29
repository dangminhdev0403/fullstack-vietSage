"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { Hotel, TenantOwner, TenantSummary } from "@/features/admin/types/admin-contract";

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
};

const emptyHotelForm: HotelFormState = {
  tenantId: "",
  name: "",
  timezone: "Asia/Saigon",
  status: "ACTIVE",
  brandSettingsText: "{}",
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
  return tenant ? `${tenant.name} (${tenant.code})` : tenantId;
}

function hotelToForm(hotel: Hotel): HotelFormState {
  return {
    tenantId: hotel.tenantId,
    name: hotel.name,
    timezone: hotel.timezone ?? "Asia/Saigon",
    status: hotel.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    brandSettingsText: JSON.stringify(hotel.brandSettings ?? {}, null, 2),
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
    window.location.assign(`/login?reauth=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
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
              },
            })
          : await requestJson<Hotel>(`/api/admin/hotels/${encodeURIComponent(editingHotel?.id ?? "")}`, {
              method: "PATCH",
              body: {
                name: form.name.trim(),
                timezone: form.timezone.trim() || "Asia/Saigon",
                brandSettings,
                status: form.status,
              },
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

      <section className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <VsIcon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--outline)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo khách sạn, mã, tổ chức..."
              className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-white px-11 text-sm outline-none focus:border-[var(--primary)]"
            />
          </div>
          <button
            type="button"
            onClick={openCreateDialog}
            disabled={!hasTenantOptions || isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <VsIcon name="hotel" className="text-[20px]" />
            Tạo khách sạn
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[var(--surface-container-low)] text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              <tr>
                <th className="px-5 py-4">Khách sạn</th>
                <th className="px-5 py-4">Tổ chức</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Múi giờ</th>
                <th className="px-5 py-4">Cập nhật</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--outline-variant)]">
              {filteredHotels.map((hotel) => (
                <tr key={hotel.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[var(--primary)]">{hotel.name}</p>
                    <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{hotel.code ?? hotel.id}</p>
                  </td>
                  <td className="px-5 py-4">{hotel.tenant ? `${hotel.tenant.name} (${hotel.tenant.code})` : tenantLabel(hotel.tenantId, tenantOptions)}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-[var(--secondary-container)] px-3 py-1 text-xs font-semibold text-[var(--on-secondary-container)]">{hotel.status ?? "ACTIVE"}</span>
                  </td>
                  <td className="px-5 py-4 text-[var(--on-surface-variant)]">{hotel.timezone ?? "Asia/Saigon"}</td>
                  <td className="px-5 py-4 text-[var(--on-surface-variant)]">{formatDate(hotel.updatedAt ?? hotel.createdAt)}</td>
                  <td className="px-5 py-4 text-right">
                    <button type="button" onClick={() => void openEditDialog(hotel)} disabled={loadingHotelId === hotel.id || isSaving} className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-xs font-semibold text-[var(--primary)] disabled:opacity-50">
                      <VsIcon name="edit" className="text-[16px]" />
                      {loadingHotelId === hotel.id ? "Đang tải..." : "Sửa"}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredHotels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-[var(--on-surface-variant)]">Chưa có khách sạn phù hợp.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {isDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 md:items-center">
          <form onSubmit={submitHotel} className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--primary)]">{formMode === "create" ? "Tạo khách sạn" : "Cập nhật khách sạn"}</h2>
                <p className="mt-1 text-sm text-[var(--on-surface-variant)]">{formMode === "create" ? "Khách sạn sẽ được tạo dưới tổ chức đã chọn." : "Cập nhật thông tin khách sạn."}</p>
              </div>
              <button type="button" onClick={closeDialog} className="rounded-lg p-2 text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]" aria-label="Đóng">
                <VsIcon name="close" className="text-[22px]" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {formMode === "create" ? (
                <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)] md:col-span-2">
                  Tổ chức
                  <select value={form.tenantId} onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none focus:border-[var(--primary)]">
                    {tenantOptions.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} - {tenant.code}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
                Tên khách sạn
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none focus:border-[var(--primary)]" />
              </label>
              <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
                Múi giờ
                <input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none focus:border-[var(--primary)]" />
              </label>
              {formMode === "edit" ? (
                <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
                  Trạng thái
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as HotelFormState["status"] }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none focus:border-[var(--primary)]">
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DISABLED">DISABLED</option>
                  </select>
                </label>
              ) : null}
              <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)] md:col-span-2">
                Brand settings
                <textarea value={form.brandSettingsText} onChange={(event) => setForm((current) => ({ ...current, brandSettingsText: event.target.value }))} rows={4} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-mono text-xs font-normal outline-none focus:border-[var(--primary)]" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeDialog} disabled={isSaving} className="rounded-xl border border-[var(--outline-variant)] px-4 py-3 text-sm font-semibold text-[var(--on-surface)] disabled:opacity-50">Hủy</button>
              <button type="submit" disabled={isSaving || (formMode === "create" && !hasTenantOptions)} className="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50">{isSaving ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
