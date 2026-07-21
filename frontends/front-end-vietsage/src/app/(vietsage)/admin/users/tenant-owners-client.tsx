"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { TenantOwner } from "@/features/admin/types/admin-contract";
import { DataTable } from "@/components/ui/data-table";
import { VsIcon } from "../../_components/vs-icon";

type TenantOwnersClientProps = {
  initialOwners: TenantOwner[];
  total: number;
};

type FormMode = "create" | "edit";

type OwnerFormState = {
  fullName: string;
  email: string;
  password: string;
  tenantName: string;
  ownerStatus: TenantOwner["status"];
  tenantUserStatus: TenantOwner["tenantUser"]["status"];
};

const ownerStatuses: TenantOwner["status"][] = ["ACTIVE", "LOCKED", "DISABLED"];
const tenantUserStatuses: TenantOwner["tenantUser"]["status"][] = ["ACTIVE", "INVITED", "DISABLED"];

const createOwnerSchema = z.object({
  fullName: z.string().trim().min(1, "Tên người đại diện là bắt buộc."),
  email: z.string().trim().email("Email không hợp lệ."),
  password: z.string().min(8, "Mật khẩu cần tối thiểu 8 ký tự."),
  tenantName: z.string().trim().min(1, "Tên tổ chức là bắt buộc."),
});

const editOwnerSchema = z.object({
  fullName: z.string().trim().min(1, "Tên người đại diện là bắt buộc."),
  tenantName: z.string().trim().min(1, "Tên tổ chức là bắt buộc."),
  ownerStatus: z.enum(["ACTIVE", "LOCKED", "DISABLED"]),
  tenantUserStatus: z.enum(["ACTIVE", "INVITED", "DISABLED"]),
});

const emptyForm: OwnerFormState = {
  fullName: "",
  email: "",
  password: "",
  tenantName: "",
  ownerStatus: "ACTIVE",
  tenantUserStatus: "ACTIVE",
};

function ownerToForm(owner: TenantOwner): OwnerFormState {
  return {
    fullName: owner.fullName,
    email: owner.email,
    password: "",
    tenantName: owner.tenant.name,
    ownerStatus: owner.status,
    tenantUserStatus: owner.tenantUser.status,
  };
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

async function requestJson<TData>(path: string, options: { method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown }): Promise<TData> {
  try {
    const payload = await requestInternalApiEnvelope<TData>(path, options);
    return payload.data;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
    const callbackUrl = `${window.location.pathname}${window.location.search}`;
    console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
      source: "tenant-owners-client",
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

async function confirmOwnerSave(mode: FormMode, ownerName: string, tenantName: string): Promise<boolean> {
  const result = await Swal.fire({
    icon: "question",
    title: mode === "create" ? "Tạo đối tác khách sạn?" : "Lưu thay đổi đối tác?",
    text:
      mode === "create"
        ? `Tạo tài khoản cho ${ownerName} và tổ chức ${tenantName}.`
        : `Cập nhật thông tin của ${ownerName}.`,
    showCancelButton: true,
    reverseButtons: true,
    confirmButtonText: mode === "create" ? "Đồng ý tạo" : "Đồng ý lưu",
    cancelButtonText: "Hủy",
    confirmButtonColor: "#00003c",
    cancelButtonColor: "#767684",
  });

  return result.isConfirmed;
}

export function TenantOwnersClient({ initialOwners, total }: TenantOwnersClientProps) {
  const router = useRouter();
  const [owners, setOwners] = useState(initialOwners);
  const [query, setQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingOwner, setEditingOwner] = useState<TenantOwner | null>(null);
  const [form, setForm] = useState<OwnerFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const filteredOwners = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return owners;
    }

    return owners.filter((owner) =>
      [owner.fullName, owner.email, owner.tenant.name, owner.tenant.code]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [owners, query]);

  const activeCount = owners.filter((owner) => owner.status === "ACTIVE" && owner.tenantUser.status === "ACTIVE").length;
  const tenantCount = new Set(owners.map((owner) => owner.tenant.id).filter(Boolean)).size;

  function openCreateDialog() {
    setFormMode("create");
    setEditingOwner(null);
    setForm(emptyForm);
    setShowPassword(false);
    setIsDialogOpen(true);
  }

  function openEditDialog(owner: TenantOwner) {
    setFormMode("edit");
    setEditingOwner(owner);
    setForm(ownerToForm(owner));
    setShowPassword(false);
    setIsDialogOpen(true);
  }

  function closeDialog() {
    if (isSaving) {
      return;
    }
    setIsDialogOpen(false);
    setEditingOwner(null);
    setForm(emptyForm);
    setShowPassword(false);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = formMode === "create" ? createOwnerSchema.safeParse(form) : editOwnerSchema.safeParse(form);
    if (!validation.success) {
      await Swal.fire({
        icon: "warning",
        title: "Kiểm tra thông tin",
        text: validation.error.issues[0]?.message ?? "Thông tin chưa hợp lệ.",
        confirmButtonColor: "#00003c",
      });
      return;
    }

    const ownerName = form.fullName.trim();
    const tenantName = form.tenantName.trim();
    const confirmed = await confirmOwnerSave(formMode, ownerName, tenantName);
    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);
      const saved =
        formMode === "create"
          ? await requestJson<TenantOwner>("/api/admin/tenant-owners", {
              method: "POST",
              body: {
                owner: {
                  fullName: form.fullName.trim(),
                  email: form.email.trim().toLowerCase(),
                  password: form.password,
                },
                tenant: {
                  name: form.tenantName.trim(),
                },
              },
            })
          : await requestJson<TenantOwner>(`/api/admin/tenant-owners/${encodeURIComponent(editingOwner?.id ?? "")}`, {
              method: "PATCH",
              body: {
                owner: {
                  fullName: form.fullName.trim(),
                  status: form.ownerStatus,
                },
                tenant: {
                  name: form.tenantName.trim(),
                },
                tenantUserStatus: form.tenantUserStatus,
              },
            });

      setOwners((current) => {
        const exists = current.some((owner) => owner.id === saved.id);
        return exists ? current.map((owner) => (owner.id === saved.id ? saved : owner)) : [saved, ...current];
      });
      closeDialog();
      await Swal.fire({
        icon: "success",
        title: formMode === "create" ? "Đã tạo đối tác khách sạn" : "Đã cập nhật đối tác khách sạn",
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
        title: "Không thể lưu",
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
          { label: "Tổng đối tác", value: total || owners.length, icon: "group" },
          { label: "Đang hoạt động", value: activeCount, icon: "verified_user" },
          { label: "Tổ chức", value: tenantCount, icon: "domain" },
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

      <section className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <VsIcon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--outline)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, email, tổ chức..."
              className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-white px-11 text-sm outline-none focus:border-[var(--primary)]"
            />
          </div>
          <button type="button" onClick={openCreateDialog} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)]">
            <VsIcon name="person_add" className="text-[20px]" />
            Tạo đối tác khách sạn
          </button>
        </div>
      </section>

      <section className="hidden md:block">
        <DataTable
          columns={[
            {
              key: "owner",
              header: "Chủ sở hữu",
              cell: (owner) => (
                <div>
                  <p className="font-semibold text-[var(--primary)]">{owner.fullName}</p>
                  <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{owner.email}</p>
                </div>
              ),
            },
            {
              key: "tenant",
              header: "Tổ chức",
              cell: (owner) => (
                <div>
                  <p className="font-semibold text-[var(--on-surface)]">{owner.tenant.name}</p>
                  <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{owner.tenant.code}</p>
                </div>
              ),
            },
            {
              key: "status",
              header: "Trạng thái",
              cell: (owner) => (
                <span className="rounded-full bg-[var(--secondary-container)] px-3 py-1 text-xs font-semibold text-[var(--on-secondary-container)]">
                  {owner.status}
                </span>
              ),
            },
            {
              key: "role",
              header: "Vai trò",
              cell: (owner) => owner.role.code,
            },
            {
              key: "updatedAt",
              header: "Cập nhật",
              cell: (owner) => formatDate(owner.updatedAt),
            },
            {
              key: "actions",
              header: <div className="text-right">Thao tác</div>,
              cell: (owner) => (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => openEditDialog(owner)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--outline-variant)] px-4 py-2 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--surface-container-low)]"
                  >
                    <VsIcon name="edit" className="text-[16px]" />
                    Sửa
                  </button>
                </div>
              ),
            },
          ]}
          data={filteredOwners}
          getRowKey={(owner) => owner.id}
          emptyMessage="Chưa có đối tác phù hợp."
          minWidth="760px"
        />
      </section>

      {/* Mobile view (cards) */}
      <section className="space-y-4 md:hidden">
        {filteredOwners.map((owner) => (
          <article
            key={owner.id}
            className="rounded-xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-base text-[var(--primary)]">{owner.fullName}</p>
                <p className="text-xs text-[var(--on-surface-variant)]">{owner.email}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--secondary-container)] px-3 py-1 text-xs font-semibold text-[var(--on-secondary-container)]">
                {owner.status}
              </span>
            </div>
            <div className="border-t border-[var(--outline-variant)] pt-3 text-xs space-y-1">
              <p className="text-[var(--on-surface)]">
                <span className="font-semibold text-[var(--on-surface-variant)]">Tổ chức: </span>
                {owner.tenant.name} ({owner.tenant.code})
              </p>
              <p className="text-[var(--on-surface)]">
                <span className="font-semibold text-[var(--on-surface-variant)]">Vai trò: </span>
                {owner.role.code}
              </p>
              <p className="text-[var(--on-surface-variant)]">
                <span>Cập nhật: </span>
                {formatDate(owner.updatedAt)}
              </p>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => openEditDialog(owner)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--outline-variant)] px-4 py-2 text-sm font-semibold text-[var(--primary)] active:bg-[var(--surface-container-low)]"
              >
                <VsIcon name="edit" className="text-[18px]" />
                Chỉnh sửa
              </button>
            </div>
          </article>
        ))}
        {filteredOwners.length === 0 ? (
          <div className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)]">
            Chưa có đối tác phù hợp.
          </div>
        ) : null}
      </section>

      {isDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 md:items-center">
          <form onSubmit={submitForm} className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--primary)]">{formMode === "create" ? "Tạo đối tác khách sạn" : "Cập nhật đối tác khách sạn"}</h2>
                <p className="mt-1 text-sm text-[var(--on-surface-variant)]">Tạo tài khoản đại diện và tổ chức quản lý khách sạn.</p>
              </div>
              <button type="button" onClick={closeDialog} className="rounded-lg p-2 text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]" aria-label="Đóng">
                <VsIcon name="close" className="text-[22px]" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
                Tên người đại diện
                <input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none focus:border-[var(--primary)]" />
              </label>
              <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
                Email đăng nhập
                <input type="email" value={form.email} disabled={formMode === "edit"} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none disabled:bg-[var(--surface-container-low)] focus:border-[var(--primary)]" />
              </label>
              {formMode === "create" ? (
                <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
                  Mật khẩu
                  <span className="relative block">
                    <input type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 pr-11 font-normal outline-none focus:border-[var(--primary)]" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]" aria-label={showPassword ? "Hide password" : "Show password"}>
                      <VsIcon name={showPassword ? "visibility_off" : "visibility"} className="text-[20px]" />
                    </button>
                  </span>
                </label>
              ) : null}
              <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
                Tên tổ chức
                <input value={form.tenantName} onChange={(event) => setForm((current) => ({ ...current, tenantName: event.target.value }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none focus:border-[var(--primary)]" />
              </label>
              {formMode === "edit" ? (
                <>
                  <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
                    Trạng thái owner
                    <select value={form.ownerStatus} onChange={(event) => setForm((current) => ({ ...current, ownerStatus: event.target.value as TenantOwner["status"] }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none focus:border-[var(--primary)]">
                      {ownerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
                    Trạng thái liên kết
                    <select value={form.tenantUserStatus} onChange={(event) => setForm((current) => ({ ...current, tenantUserStatus: event.target.value as TenantOwner["tenantUser"]["status"] }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none focus:border-[var(--primary)]">
                      {tenantUserStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                </>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeDialog} disabled={isSaving} className="rounded-xl border border-[var(--outline-variant)] px-4 py-3 text-sm font-semibold text-[var(--on-surface)] disabled:opacity-50">Hủy</button>
              <button type="submit" disabled={isSaving} className="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50">{isSaving ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
