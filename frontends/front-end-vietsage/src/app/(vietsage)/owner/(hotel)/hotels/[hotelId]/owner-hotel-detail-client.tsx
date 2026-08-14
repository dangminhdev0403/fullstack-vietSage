"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SwalVietSage } from "@/libs/swal";

import { HttpError } from "@/core/http/http-error";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { Hotel } from "@/features/admin/types/admin-contract";
import { LocationFields, type LocationValue } from "@/features/marketplace/components/location-fields";

type OwnerHotelDetailClientProps = {
  hotel: Readonly<Hotel>;
};

type FormState = {
  name: string;
  status: "ACTIVE" | "DISABLED";
};

function toApiErrorMessage(data: unknown): string {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const errObj = data as Record<string, unknown>;
    if (typeof errObj.detail === "string") return errObj.detail;
    if (typeof errObj.message === "string") return errObj.message;
  }
  return "Đã xảy ra lỗi không xác định.";
}

function locationFromHotel(hotel: Readonly<Hotel>): LocationValue {
  return {
    googleMapsUrl: hotel.googleMapsUrl ?? "",
    latitude: hotel.latitude !== null && hotel.latitude !== undefined ? String(hotel.latitude) : "",
    longitude: hotel.longitude !== null && hotel.longitude !== undefined ? String(hotel.longitude) : "",
    locationAccuracyMeters:
      hotel.locationAccuracyMeters !== null && hotel.locationAccuracyMeters !== undefined
        ? String(hotel.locationAccuracyMeters)
        : "",
    locationSource: hotel.locationSource ?? undefined,
  };
}

const inputClass =
  "h-12 w-full rounded-xl border border-[#dcd3c1] bg-[#f9f6f0] px-4 text-base font-semibold text-[#17201b] placeholder:text-[#8a958e] focus:bg-white focus:border-[#8c6d29] focus:outline-none focus:ring-4 focus:ring-[#8c6d29]/10 transition-all";

const labelClass = "block text-xs sm:text-sm font-semibold text-[#3d4942] mb-1.5";

export function OwnerHotelDetailClient({ hotel }: OwnerHotelDetailClientProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: hotel.name,
    status: hotel.status === "DISABLED" ? "DISABLED" : "ACTIVE",
  });
  const [location, setLocation] = useState<LocationValue>(() => locationFromHotel(hotel));
  const [isSaving, setIsSaving] = useState(false);

  function handleReset() {
    setForm({
      name: hotel.name,
      status: hotel.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    });
    setLocation(locationFromHotel(hotel));
  }

  async function submitHotel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      await SwalVietSage.fire({
        icon: "warning",
        title: "Kiểm tra thông tin",
        text: "Tên khách sạn là bắt buộc.",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    const confirmed = await SwalVietSage.fire({
      icon: "question",
      title: "Lưu thay đổi khách sạn?",
      text: `Cập nhật thông tin & vị trí của ${form.name.trim()}.`,
      showCancelButton: true,
      confirmButtonText: "Đồng ý lưu",
      cancelButtonText: "Hủy",
    });

    if (!confirmed.isConfirmed) return;

    try {
      setIsSaving(true);
      void SwalVietSage.fire({
        title: "Đang lưu khách sạn",
        text: "Vui lòng chờ trong giây lát.",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => SwalVietSage.showLoading(),
      });

      await requestInternalApiEnvelope<Hotel>(`/api/owner/hotels/${encodeURIComponent(hotel.id)}`, {
        method: "PATCH",
        body: {
          name: form.name.trim(),
          status: form.status,
          googleMapsUrl: location.googleMapsUrl.trim() || null,
          latitude: location.latitude ? Number(location.latitude) : null,
          longitude: location.longitude ? Number(location.longitude) : null,
          locationAccuracyMeters: location.locationAccuracyMeters ? Number(location.locationAccuracyMeters) : null,
          locationSource: location.locationSource ?? null,
        },
      });

      await SwalVietSage.fire({
        icon: "success",
        title: "Đã lưu thông tin & vị trí khách sạn",
        timer: 1400,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      router.refresh();
    } catch (error) {
      await SwalVietSage.fire({
        icon: "error",
        title: "Không thể lưu khách sạn",
        text: error instanceof HttpError ? toApiErrorMessage(error.data) : error instanceof Error ? error.message : "Vui lòng thử lại.",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={submitHotel} className="space-y-6">
      {/* Top Banner & Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#17201b] via-[#24352b] to-[#121914] p-6 text-[#f8f1e6] shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#e8b363] text-2xl font-black text-[#17201b] shadow-md border-2 border-white/20">
              🏨
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e8b363]/20 px-3 py-0.5 text-xs font-bold text-[#f5c77e] border border-[#e8b363]/30">
                <span className="h-2 w-2 rounded-full bg-[#e8b363] animate-pulse" />
                Hồ sơ vận hành chính thức
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#fff8e8]">{hotel.name}</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-xs sm:text-sm font-bold text-[#f8f1e6] backdrop-blur-sm border border-white/20 transition-all hover:bg-white/20"
          >
            <span>🔄</span>
            <span>Hoàn tác thay đổi</span>
          </button>
        </div>
      </div>

      {/* Main Operational Settings Card */}
      <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-7 shadow-[0_4px_20px_rgba(23,32,27,0.04)] space-y-6">
        <div className="border-b border-[#eae3d5] pb-4">
          <h2 className="text-xl font-extrabold text-[#17201b]">Cấu hình vận hành khách sạn</h2>
          <p className="mt-1 text-sm font-medium text-[#5a6760]">
            Cập nhật tên khách sạn và trạng thái hoạt động trên hệ thống.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label htmlFor="hotel-name" className={labelClass}>Tên khách sạn</label>
            <input
              id="hotel-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ví dụ: Khách sạn Grand Saigon"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="hotel-status" className={labelClass}>Trạng thái hoạt động</label>
            <select
              id="hotel-status"
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FormState["status"] }))}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="ACTIVE">Đang vận hành (ACTIVE)</option>
              <option value="DISABLED">Tạm ngưng (DISABLED)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Location Settings Card */}
      <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-7 shadow-[0_4px_20px_rgba(23,32,27,0.04)] space-y-6">
        <div className="border-b border-[#eae3d5] pb-4">
          <h2 className="text-xl font-extrabold text-[#17201b] flex items-center gap-2">
            <span>📍</span> Vị trí khách sạn trên nền tảng
          </h2>
          <p className="mt-1 text-sm font-medium text-[#5a6760]">
            Cập nhật tọa độ GPS và liên kết Google Maps để đối tác & khách đặt phòng dễ dàng tìm thấy.
          </p>
        </div>

        <LocationFields value={location} onChange={setLocation} />
      </div>

      {/* Submit Action Bar */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="flex h-13 min-w-[240px] items-center justify-center gap-2.5 rounded-xl bg-[#17201b] px-8 text-base font-bold text-[#f8f1e6] shadow-md transition-all hover:bg-[#27352d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>Đang lưu...</span>
            </>
          ) : (
            "💾 Lưu thay đổi khách sạn"
          )}
        </button>
      </div>
    </form>
  );
}
