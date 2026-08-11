"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SwalVietSage } from "@/libs/swal";
import { LocationFields, type LocationValue } from "@/features/marketplace/components/location-fields";
import { useServicePortal } from "../use-service-portal";
import type { ServicePortalData } from "../types";

function locationFrom(data: ServicePortalData): LocationValue {
  const item = data.profile;
  return {
    googleMapsUrl: item.googleMapsUrl ?? "",
    latitude: item.latitude == null ? "" : String(item.latitude),
    longitude: item.longitude == null ? "" : String(item.longitude),
    locationAccuracyMeters: item.locationAccuracyMeters == null ? "" : String(item.locationAccuracyMeters),
    locationSource: item.locationSource ?? undefined,
  };
}

const inputClass =
  "h-12 w-full rounded-xl border border-[#dcd3c1] bg-[#f9f6f0] px-4 text-base font-semibold text-[#17201b] placeholder:text-[#8a958e] focus:bg-white focus:border-[#8c6d29] focus:outline-none focus:ring-4 focus:ring-[#8c6d29]/10 transition-all";

const labelClass = "block text-xs sm:text-sm font-semibold text-[#3d4942] mb-1.5";

export function ServiceSettingsView({ data }: Readonly<{ data: ServicePortalData }>) {
  const { profile } = useServicePortal();
  const [location, setLocation] = useState(() => locationFrom(data));
  const [isLocating, setIsLocating] = useState<boolean>(false);

  const [brandForm, setBrandForm] = useState({
    displayName: data.profile.displayName ?? "",
    description: data.profile.description ?? "",
    phone: data.profile.phone ?? "",
    address: data.profile.address ?? "",
  });

  const handleLocateGPS = () => {
    if (!navigator.geolocation) {
      toast.error("Thiết bị không hỗ trợ định vị.");
      return;
    }

    setIsLocating(true);

    const handleSuccess = (coords: GeolocationCoordinates) => {
      setIsLocating(false);
      toast.success("Đã quét vị trí GPS thành công!");
      setLocation((prev) => ({
        ...prev,
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
        locationAccuracyMeters: String(Math.round(coords.accuracy)),
        locationSource: "DEVICE_GEOLOCATION",
      }));
    };

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => handleSuccess(coords),
      (reason) => {
        if (reason.code !== 1) {
          // Fallback to network/IP positioning if high accuracy GPS times out
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => handleSuccess(coords),
            (fallbackReason) => {
              setIsLocating(false);
              const errMsg =
                fallbackReason.code === 1
                  ? "Bạn chưa cấp quyền truy cập vị trí."
                  : "Không thể định vị vị trí hiện tại.";
              toast.error(errMsg);
            },
            { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
          );
          return;
        }
        setIsLocating(false);
        toast.error("Bạn chưa cấp quyền truy cập vị trí.");
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
    );
  };

  const saveLocation = async () => {
    const res = await SwalVietSage.fire({
      icon: "question",
      title: "Lưu cấu hình vị trí?",
      text: "Tọa độ GPS mới sẽ được cập nhật trên nền tảng để các khách sạn đối tác tìm kiếm.",
      showCancelButton: true,
      confirmButtonText: "Xác nhận lưu",
      cancelButtonText: "Hủy",
    });

    if (!res.isConfirmed) return;

    profile.mutate(
      {
        googleMapsUrl: location.googleMapsUrl || null,
        latitude: location.latitude ? Number(location.latitude) : null,
        longitude: location.longitude ? Number(location.longitude) : null,
        locationAccuracyMeters: location.locationAccuracyMeters ? Number(location.locationAccuracyMeters) : null,
        locationSource: location.locationSource ?? null,
      },
      {
        onSuccess: () => {
          toast.success("Lưu cấu hình vị trí GPS thành công!");
        },
        onError: () => {
          toast.error("Không thể lưu vị trí GPS. Vui lòng kiểm tra dữ liệu.");
        },
      },
    );
  };

  const saveBrandProfile = async () => {
    const res = await SwalVietSage.fire({
      icon: "question",
      title: "Cập nhật hồ sơ thương hiệu?",
      text: "Thông tin thương hiệu mới sẽ được lưu và hiển thị tới các đối tác.",
      showCancelButton: true,
      confirmButtonText: "Xác nhận lưu",
      cancelButtonText: "Hủy",
    });

    if (!res.isConfirmed) return;

    profile.mutate(
      {
        displayName: brandForm.displayName,
        description: brandForm.description || null,
        phone: brandForm.phone || null,
        address: brandForm.address || null,
      },
      {
        onSuccess: () => {
          toast.success("Cập nhật hồ sơ thương hiệu thành công!");
        },
        onError: () => {
          toast.error("Không thể cập nhật hồ sơ thương hiệu.");
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="space-y-1 border-b border-[#e5ddcd] pb-4">
        <h1 className="text-3xl font-extrabold text-[#17201b] sm:text-4xl">Hồ sơ & Vị trí</h1>
        <p className="text-base font-medium text-[#5a6760]">
          Cấu hình địa điểm kinh doanh, giới thiệu thương hiệu và vị trí phục vụ trên nền tảng.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left Column: Brand Profile Card */}
        <div className="space-y-6 rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-7 shadow-[0_4px_20px_rgba(23,32,27,0.04)] h-fit">
          {/* Cover Header Banner */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#17201b] via-[#24352b] to-[#121914] p-5 sm:p-6 text-[#f8f1e6]">
            <div className="flex items-center gap-4">
              <div className="flex h-15 w-15 shrink-0 items-center justify-center rounded-2xl bg-[#e8b363] text-2xl font-black text-[#17201b] shadow-md border-2 border-white/20">
                {data.profile.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e8b363]/20 px-3 py-0.5 text-xs font-bold text-[#f5c77e] border border-[#e8b363]/30">
                  <span className="h-2 w-2 rounded-full bg-[#e8b363] animate-pulse" />
                  Đối tác thương hiệu đã xác minh
                </div>
                <h2 className="text-2xl font-extrabold text-[#fff8e8]">{data.profile.displayName}</h2>
              </div>
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#eae3d5] bg-[#f9f6f0] p-4 text-center">
            <div>
              <span className="block text-xs sm:text-sm font-bold text-[#5a6760]">Dịch vụ</span>
              <span className="text-xl sm:text-2xl font-black text-[#17201b]">{data.services.length}</span>
            </div>
            <div>
              <span className="block text-xs sm:text-sm font-bold text-[#5a6760]">Đơn hàng</span>
              <span className="text-xl sm:text-2xl font-black text-[#17201b]">{data.orders.length}</span>
            </div>
            <div>
              <span className="block text-xs sm:text-sm font-bold text-[#5a6760]">GPS</span>
              <span className="text-xs sm:text-sm font-extrabold text-[#1c553f] block mt-0.5">
                {data.profile.locationVerifiedAt ? "✓ Đã xác minh" : "Chưa định vị"}
              </span>
            </div>
          </div>

          {/* Directly Editable Form */}
          <div className="space-y-4 pt-1">
            <div>
              <label htmlFor="brand-name" className={labelClass}>Tên hiển thị thương hiệu</label>
              <input
                id="brand-name"
                value={brandForm.displayName}
                onChange={(e) => setBrandForm({ ...brandForm, displayName: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="brand-desc" className={labelClass}>Mô tả & Giới thiệu dịch vụ</label>
              <textarea
                id="brand-desc"
                rows={3}
                value={brandForm.description}
                onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })}
                placeholder="Giới thiệu các điểm nổi bật, chuyên môn và dịch vụ của thương hiệu..."
                className="w-full rounded-xl border border-[#dcd3c1] bg-[#f9f6f0] p-3.5 text-base font-semibold text-[#17201b] placeholder:text-[#8a958e] focus:bg-white focus:border-[#8c6d29] focus:outline-none focus:ring-4 focus:ring-[#8c6d29]/10 transition-all"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="brand-phone" className={labelClass}>Số điện thoại</label>
                <input
                  id="brand-phone"
                  value={brandForm.phone}
                  onChange={(e) => setBrandForm({ ...brandForm, phone: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="brand-address" className={labelClass}>Địa chỉ</label>
                <input
                  id="brand-address"
                  value={brandForm.address}
                  onChange={(e) => setBrandForm({ ...brandForm, address: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={saveBrandProfile}
              disabled={profile.isPending}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#e8b363] px-6 text-base font-bold text-[#17201b] shadow-sm transition-all hover:bg-[#dfa652] disabled:opacity-50"
            >
              {profile.isPending ? "Đang lưu..." : "💾 Cập nhật hồ sơ thương hiệu"}
            </button>
          </div>
        </div>

        {/* Right Column: Location Verification Form Card */}
        <div className="space-y-6 rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-7 shadow-[0_4px_20px_rgba(23,32,27,0.04)] h-fit">
          {/* Cover Header Banner matching Left Card */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#17201b] via-[#24352b] to-[#121914] p-5 sm:p-6 text-[#f8f1e6]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex h-15 w-15 shrink-0 items-center justify-center rounded-2xl bg-[#e8b363] text-2xl text-[#17201b] shadow-md border-2 border-white/20">
                  📍
                </div>
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e8b363]/20 px-3 py-0.5 text-xs font-bold text-[#f5c77e] border border-[#e8b363]/30">
                    <span className="h-2 w-2 rounded-full bg-[#e8b363] animate-pulse" />
                    Tọa độ phục vụ Marketplace
                  </div>
                  <h2 className="text-2xl font-extrabold text-[#fff8e8]">Vị trí trên nền tảng</h2>
                </div>
              </div>

              {/* GPS Auto-locate button inside top dark banner */}
              <button
                type="button"
                onClick={handleLocateGPS}
                disabled={isLocating}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#e8b363] px-4.5 text-xs sm:text-sm font-bold text-[#17201b] shadow-md transition-all hover:bg-[#dfa652] disabled:opacity-60 shrink-0"
              >
                {isLocating ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#17201b] border-t-transparent" />
                    <span>Đang quét...</span>
                  </>
                ) : (
                  <>
                    <span>🎯</span>
                    <span>Dùng vị trí hiện tại</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Stats Bar for Location Card */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#eae3d5] bg-[#f9f6f0] p-4 text-center">
            <div>
              <span className="block text-xs sm:text-sm font-bold text-[#5a6760]">Trạng thái tọa độ</span>
              <span className="text-xs sm:text-sm font-extrabold text-[#1c553f] block mt-0.5">
                {data.profile.locationVerifiedAt ? "✓ Đã xác minh GPS" : "Chưa cập nhật"}
              </span>
            </div>
            <div>
              <span className="block text-xs sm:text-sm font-bold text-[#5a6760]">Độ chính xác GPS</span>
              <span className="text-xs sm:text-sm font-extrabold text-[#17201b] block mt-0.5">
                {location.locationAccuracyMeters ? `±${location.locationAccuracyMeters}m` : "Chưa có dữ liệu"}
              </span>
            </div>
          </div>

          <LocationFields value={location} onChange={setLocation} hideLocateButton />

          <button
            type="button"
            onClick={saveLocation}
            disabled={profile.isPending}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#17201b] px-6 text-base font-bold text-[#f8f1e6] transition-colors hover:bg-[#27352d] disabled:opacity-50 shadow-md"
          >
            {profile.isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Đang lưu vị trí...</span>
              </>
            ) : (
              "💾 Lưu cấu hình vị trí"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
