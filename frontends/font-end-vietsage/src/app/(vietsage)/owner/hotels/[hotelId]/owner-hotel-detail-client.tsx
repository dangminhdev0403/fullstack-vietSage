"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

import { HttpError } from "@/core/http/http-error";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { Hotel } from "@/features/admin/types/admin-contract";

type OwnerHotelDetailClientProps = {
  hotel: Hotel;
};

type FormState = {
  name: string;
  timezone: string;
  status: "ACTIVE" | "DISABLED";
  brandSettingsText: string;
};

function toApiErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const data = "data" in payload ? payload.data : null;
    if (data && typeof data === "object" && !Array.isArray(data) && "detail" in data && typeof data.detail === "string") {
      return data.detail;
    }

    const message = "message" in payload ? payload.message : null;
    if (typeof message === "string" && message.trim()) return message;
  }

  return "Không thể xử lý yêu cầu.";
}

function hotelToForm(hotel: Hotel): FormState {
  return {
    name: hotel.name,
    timezone: hotel.timezone ?? "Asia/Saigon",
    status: hotel.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    brandSettingsText: JSON.stringify(hotel.brandSettings ?? {}, null, 2),
  };
}

function containsTenantId(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsTenantId);

  return Object.entries(value).some(([key, nestedValue]) => key === "tenantId" || containsTenantId(nestedValue));
}

function parseBrandSettings(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Brand settings phải là JSON object hoặc null.");
  }

  if (containsTenantId(parsed)) {
    throw new Error("Không được gửi tenantId từ giao diện chủ khách sạn.");
  }

  return parsed as Record<string, unknown>;
}

export function OwnerHotelDetailClient({ hotel }: OwnerHotelDetailClientProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => hotelToForm(hotel));
  const [isSaving, setIsSaving] = useState(false);

  async function submitHotel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      await Swal.fire({ icon: "warning", title: "Kiểm tra thông tin", text: "Tên khách sạn là bắt buộc.", confirmButtonColor: "#00003c" });
      return;
    }

    let brandSettings: Record<string, unknown> | null;
    try {
      brandSettings = parseBrandSettings(form.brandSettingsText);
    } catch (error) {
      await Swal.fire({ icon: "warning", title: "Kiểm tra brand settings", text: error instanceof Error ? error.message : "JSON không hợp lệ.", confirmButtonColor: "#00003c" });
      return;
    }

    const confirmed = await Swal.fire({
      icon: "question",
      title: "Lưu thay đổi khách sạn?",
      text: `Cập nhật thông tin ${form.name.trim()}.`,
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Đồng ý lưu",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
      cancelButtonColor: "#767684",
    });

    if (!confirmed.isConfirmed) return;

    try {
      setIsSaving(true);
      void Swal.fire({
        title: "Đang lưu khách sạn",
        text: "Vui lòng chờ trong giây lát.",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });

      await requestInternalApiEnvelope<Hotel>(`/api/owner/hotels/${encodeURIComponent(hotel.id)}`, {
        method: "PATCH",
        body: {
          name: form.name.trim(),
          timezone: form.timezone.trim() || "Asia/Saigon",
          brandSettings,
          status: form.status,
        },
      });

      await Swal.fire({ icon: "success", title: "Đã lưu khách sạn", timer: 1400, showConfirmButton: false });
      router.refresh();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể lưu khách sạn",
        text: error instanceof HttpError ? toApiErrorMessage(error.data) : error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#00003c",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={submitHotel} className="rounded-xl border border-[var(--outline-variant)] bg-white p-6">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--primary)]">Cấu hình khách sạn</h2>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">Chỉ cập nhật các trường vận hành được backend hỗ trợ.</p>
        </div>
        <button
          type="button"
          onClick={() => setForm(hotelToForm(hotel))}
          className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-[var(--outline-variant)] px-4 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-low)]"
        >
          Hoàn tác
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
          Tên khách sạn
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none transition-colors focus:border-[var(--primary)]" />
        </label>
        <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
          Múi giờ
          <input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none transition-colors focus:border-[var(--primary)]" />
        </label>
        <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)]">
          Trạng thái
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FormState["status"] }))} className="w-full cursor-pointer rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-normal outline-none transition-colors focus:border-[var(--primary)]">
            <option value="ACTIVE">Đang vận hành</option>
            <option value="DISABLED">Đã vô hiệu</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold text-[var(--on-surface)] md:col-span-2">
          Brand settings
          <textarea value={form.brandSettingsText} onChange={(event) => setForm((current) => ({ ...current, brandSettingsText: event.target.value }))} rows={6} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 font-mono text-xs font-normal outline-none transition-colors focus:border-[var(--primary)]" />
        </label>
      </div>
      <div className="mt-6 flex justify-end">
        <button type="submit" disabled={isSaving} className="cursor-pointer rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--on-primary)] transition-colors hover:bg-[color:rgba(0,0,60,0.88)] disabled:cursor-not-allowed disabled:opacity-50">
          {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
