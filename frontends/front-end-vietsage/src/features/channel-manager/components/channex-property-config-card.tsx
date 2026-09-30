"use client";

import { useState } from "react";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useChannex } from "../hooks/use-channel-manager";

type SupportedCurrency = "VND" | "GBP" | "USD" | "EUR";

export function ChannexPropertyConfigCard({
  hotelId,
  hotelName,
  roleScope = "admin",
}: {
  hotelId: string;
  hotelName: string;
  roleScope?: "owner" | "admin";
}) {
  const {
    config,
    isLoadingConfig,
    syncContent,
    refreshConfig,
  } = useChannex(hotelId, roleScope, {
    loadMappings: false,
    loadSimulatedBookings: false,
  });
  const [selectedCurrency, setSelectedCurrency] =
    useState<SupportedCurrency>("VND");

  const isConfigured = Boolean(
    config?.isConfigured && config.channexPropertyId,
  );
  const currentProperty = config?.availableProperties?.find(
    (property) => property.id === config.channexPropertyId,
  );

  const handleContentSync = async () => {
    const confirmation = await showConfirmDialog({
      title: isConfigured
        ? "Đồng bộ lại nội dung Channex?"
        : `Khởi tạo “${hotelName}” trên Channex?`,
      text: isConfigured
        ? "Hệ thống sẽ cập nhật Property, hạng phòng và gói giá hiện tại. Thao tác có thể chạy lại an toàn."
        : `Hệ thống sẽ tạo Property với tiền tệ ${selectedCurrency}, sau đó đồng bộ hạng phòng và gói giá.`,
      confirmText: isConfigured ? "Đồng bộ lại" : "Khởi tạo",
      cancelText: "Hủy",
    });
    if (!confirmation.isConfirmed) return;

    try {
      const result = await syncContent.mutateAsync({
        currency: selectedCurrency,
      });
      await refreshConfig();
      const fallbackRoomTypes = (
        result as typeof result & { fallbackRoomTypes?: string[] }
      ).fallbackRoomTypes;
      const fallbackNote = fallbackRoomTypes?.length
        ? ` Các hạng phòng đang dùng giá khởi điểm tạm: ${fallbackRoomTypes.join(", ")}. Hãy đặt giá thật trước khi mở bán.`
        : "";

      await showSuccessAlert(
        isConfigured ? "Đồng bộ lại thành công" : "Khởi tạo thành công",
        `Đã liên kết ${result.roomTypesSynced.length} hạng phòng và ${result.ratePlansSynced.length} gói giá.${fallbackNote}`,
      );
    } catch (error: unknown) {
      await showErrorAlert("Không thể đồng bộ nội dung Channex", error);
    }
  };


  return (
    <section className="space-y-6 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm sm:p-6">
      <header className="flex flex-col gap-4 border-b border-[var(--outline-variant)] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-[var(--secondary)]">
            Thiết lập Channex
          </p>
          <h2 className="mt-1 text-2xl font-bold text-[var(--on-surface)]">
            {hotelName}
          </h2>
          <p className="mt-2 text-base text-[var(--on-surface-variant)]">
            Đồng bộ Property, hạng phòng và một gói giá tiêu chuẩn cho mỗi hạng
            phòng.
          </p>
        </div>

        <span
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold ${
            isConfigured
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {isLoadingConfig
            ? "Đang kiểm tra..."
            : isConfigured
              ? "Đã liên kết Channex"
              : "Chưa liên kết"}
        </span>
      </header>

      {isConfigured ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold text-emerald-950">
                {currentProperty?.title || hotelName}
              </h3>
              <p className="mt-1 text-sm text-emerald-900">
                Tiền tệ: {currentProperty?.currency || "Theo cấu hình Channex"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleContentSync}
                disabled={syncContent.isPending}
                className="min-h-11 rounded-xl bg-[var(--primary)] px-5 text-base font-bold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 disabled:opacity-50"
              >
                {syncContent.isPending
                  ? "Đang đồng bộ..."
                  : "Đồng bộ lại nội dung"}
              </button>
              {config?.channexPropertyUrl && (
                <a
                  href={config.channexPropertyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-xl border border-emerald-300 bg-white px-5 text-base font-bold text-emerald-900 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                >
                  Mở Property ↗
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5">
          <h3 className="text-xl font-bold text-[#17201b]">
            Khởi tạo tự động
          </h3>
          <p className="mt-2 text-base text-[#5a6760]">
            Chọn tiền tệ của Property. Có thể chạy lại Content Sync mà không tạo
            mapping trùng.
          </p>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="w-full max-w-sm text-sm font-semibold text-[#3d4942]">
              Tiền tệ
              <select
                value={selectedCurrency}
                onChange={(event) =>
                  setSelectedCurrency(event.target.value as SupportedCurrency)
                }
                className="mt-1 block min-h-11 w-full rounded-xl border border-[#dcd3c1] bg-white px-4 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#8c6d29]"
              >
                <option value="VND">VND — Việt Nam đồng</option>
                <option value="GBP">GBP — Bảng Anh</option>
                <option value="USD">USD — Đô la Mỹ</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleContentSync}
              disabled={syncContent.isPending || isLoadingConfig}
              className="min-h-11 rounded-xl bg-[var(--primary)] px-6 text-base font-bold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 disabled:opacity-50"
            >
              {syncContent.isPending ? "Đang khởi tạo..." : "Khởi tạo Channex"}
            </button>
          </div>
        </div>
      )}

    </section>
  );
}
