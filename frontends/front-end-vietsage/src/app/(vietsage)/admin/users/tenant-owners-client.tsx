"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SwalVietSage } from "@/libs/swal";
import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { TenantOwner } from "@/features/admin/types/admin-contract";
import { DataTable } from "@/components/ui/data-table";
import { OneTimePasswordDialog } from "@/features/account/security/one-time-password-dialog";
import { useResetTenantOwnerPassword } from "@/features/admin/hooks/use-reset-tenant-owner-password";
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

function formatTenantDisplayName(name: string, code: string): string {
  const cleanName = name.trim();
  if (!cleanName || cleanName.toUpperCase() === "TENANT_OWNER" || cleanName.toUpperCase().startsWith("TENANT_OWNER_")) {
    const numericSuffix = code.replace(/^VSH_TENANT_0*/i, "").replace(/^0+/, "");
    return `Tổ chức Quản lý ${numericSuffix || code}`;
  }
  return cleanName;
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

async function requestJson<TData>(path: string, options: { method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown }): Promise<TData> {
  try {
    const res = await requestInternalApiEnvelope<TData>(path, options);
    return res.data;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      if (typeof window !== "undefined") {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
      throw new Error("UNAUTHORIZED");
    }
    if (error instanceof HttpError) {
      const data = error.data as Record<string, unknown> | null;
      const detail = typeof data?.detail === "string" ? data.detail : typeof data?.message === "string" ? data.message : null;
      throw new Error(detail ?? `HTTP ${error.status}`);
    }
    throw error;
  }
}

async function confirmOwnerSave(mode: FormMode, ownerName: string, tenantName: string): Promise<boolean> {
  const result = await SwalVietSage.fire({
    icon: "question",
    title: mode === "create" ? "Tạo đối tác khách sạn?" : "Lưu thay đổi đối tác?",
    text:
      mode === "create"
        ? `Tạo tài khoản cho ${ownerName} và tổ chức ${tenantName}.`
        : `Cập nhật thông tin của ${ownerName}.`,
    showCancelButton: true,
    confirmButtonText: mode === "create" ? "Đồng ý tạo" : "Đồng ý lưu",
    cancelButtonText: "Hủy",
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
  const resetPassword = useResetTenantOwnerPassword();
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [resetAccountLabel, setResetAccountLabel] = useState("");

  async function resetOwnerPassword(owner: TenantOwner) {
    const confirmed = await SwalVietSage.fire({
      icon: "warning",
      title: "Cấp lại mật khẩu?",
      text: `Tạo mật khẩu tạm thời mới cho ${owner.fullName}. Tất cả phiên hiện tại sẽ bị thu hồi.`,
      showCancelButton: true,
      confirmButtonText: "Cấp lại mật khẩu",
      cancelButtonText: "Hủy",
    });
    if (!confirmed.isConfirmed) return;
    try {
      const result = await resetPassword.mutateAsync({ tenantOwnerId: owner.id });
      setResetAccountLabel(owner.fullName);
      setTemporaryPassword(result.temporaryPassword);
    } catch (error) {
      await SwalVietSage.fire({
        icon: "error",
        title: "Không thể cấp lại mật khẩu",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  }

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
      await SwalVietSage.fire({
        icon: "warning",
        title: "Kiểm tra thông tin",
        text: validation.error.issues[0]?.message ?? "Thông tin chưa hợp lệ.",
        showConfirmButton: true,
        confirmButtonText: "OK",
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
      await SwalVietSage.fire({
        icon: "success",
        title: formMode === "create" ? "Đã tạo đối tác khách sạn" : "Đã cập nhật đối tác khách sạn",
        timer: 1400,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      router.refresh();
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return;
      }
      await SwalVietSage.fire({
        icon: "error",
        title: "Không thể lưu",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        showConfirmButton: true,
        confirmButtonText: "OK",
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

      <section className="rounded-[1.4rem] border border-[#e8dfd1] bg-white/90 p-5 shadow-[0_16px_40px_rgba(23,32,27,0.05)] backdrop-blur-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <VsIcon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8b948d]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, email, tổ chức..."
              className="w-full rounded-xl border border-[#e2d7c5] bg-[#faf6ef] pl-11 pr-4 py-3 text-sm font-semibold text-[#17201b] outline-none transition-all focus:border-[#24473d] focus:bg-white focus:ring-2 focus:ring-[#24473d]/20"
            />
          </div>
          <button type="button" onClick={openCreateDialog} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#24473d] px-5 py-3 text-sm font-bold text-[#fff8e8] shadow-md shadow-[#24473d]/20 transition-all hover:bg-[#1a352d] active:scale-98">
            <VsIcon name="person_add" className="text-lg text-[#e8b363]" />
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
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#24473d] font-extrabold text-[#e8b363] shadow-xs ring-2 ring-[#e8b363]/30">
                    {owner.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-extrabold text-[#17201b]">{owner.fullName}</p>
                    <p className="text-xs font-medium text-[#69726b]">{owner.email}</p>
                  </div>
                </div>
              ),
            },
            {
              key: "tenant",
              header: "Tổ chức",
              cell: (owner) => (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfd1] bg-[#fbf8f2] px-3 py-1.5 font-sans text-xs font-bold text-[#17201b]">
                  <VsIcon name="domain" className="text-[#24473d]" />
                  {formatTenantDisplayName(owner.tenant.name, owner.tenant.code)}
                </span>
              ),
            },
            {
              key: "status",
              header: "Trạng thái",
              cell: (owner) =>
                owner.status === "ACTIVE" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cbe5d8] bg-[#ecf7f1] px-3.5 py-1 text-xs font-extrabold text-[#1a5d3f]">
                    <span className="h-2 w-2 rounded-full bg-[#1a5d3f] animate-pulse"></span>
                    Hoạt động
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2dad0] bg-[#f5efe8] px-3.5 py-1 text-xs font-extrabold text-[#6b6660]">
                    <span className="h-2 w-2 rounded-full bg-[#8c857d]"></span>
                    Tạm ngưng
                  </span>
                ),
            },
            {
              key: "role",
              header: "Vai trò",
              cell: () => (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#eddab9] bg-[#fcf6ea] px-3 py-1 text-xs font-extrabold text-[#8c5e1a]">
                  <VsIcon name="shield_person" className="text-[#c89b4f]" />
                  Chủ sở hữu
                </span>
              ),
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
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEditDialog(owner)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#dcd1bf] bg-[#fffcf7] px-4 py-1.5 text-xs font-bold text-[#24473d] shadow-2xs transition-all hover:border-[#24473d] hover:bg-[#f5efe4]"
                  >
                    <VsIcon name="edit" className="text-sm" />
                    Sửa
                  </button>
                  <button
                    type="button"
                    disabled={resetPassword.isPending}
                    onClick={() => resetOwnerPassword(owner)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#ebd6b7] bg-[#fffaf3] px-4 py-1.5 text-xs font-bold text-[#8c5e1a] shadow-2xs transition-all hover:bg-[#f9efe0] disabled:opacity-50"
                  >
                    <VsIcon name="key" className="text-sm text-[#c89b4f]" />
                    Cấp lại mật khẩu
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
                <p className="text-sm text-[var(--on-surface-variant)]">{owner.email}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--secondary-container)] px-3 py-1 text-sm font-semibold text-[var(--on-secondary-container)]">
                {owner.status}
              </span>
            </div>
            <div className="border-t border-[var(--outline-variant)] pt-3 text-sm space-y-1">
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
            <div className="grid gap-2 pt-2">
              <button
                type="button"
                onClick={() => openEditDialog(owner)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--outline-variant)] px-4 py-2 text-sm font-semibold text-[var(--primary)] active:bg-[var(--surface-container-low)]"
              >
                <VsIcon name="edit" className="text-[18px]" />
                Chỉnh sửa
              </button>
              <button type="button" disabled={resetPassword.isPending} onClick={() => resetOwnerPassword(owner)} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50">
                <VsIcon name="key" className="text-[18px]" /> Cấp lại mật khẩu
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
      <OneTimePasswordDialog temporaryPassword={temporaryPassword} accountLabel={resetAccountLabel} onClose={() => { setTemporaryPassword(null); setResetAccountLabel(""); resetPassword.reset(); }} />
    </div>
  );
}
