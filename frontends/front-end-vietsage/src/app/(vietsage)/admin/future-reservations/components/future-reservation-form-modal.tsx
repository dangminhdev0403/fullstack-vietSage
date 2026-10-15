"use client";

import { useEffect, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/libs/swal";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

export interface FutureReservationFormModalProps {
  isOpen: boolean;
  hotelId: string;
  onClose: () => void;
  onSuccess?: () => void;
  availableRooms?: Array<{
    id: string;
    roomNumber: string;
    type?: string;
    price?: number;
  }>;
  initialRoom?: {
    id: string;
    roomNumber: string;
    type?: string;
    price?: number;
  } | null;
}

export function FutureReservationFormModal({
  isOpen,
  hotelId,
  onClose,
  onSuccess,
  availableRooms = [],
  initialRoom = null,
}: FutureReservationFormModalProps) {
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [roomId, setRoomId] = useState(initialRoom?.id ?? "");
  const [nightlyRate, setNightlyRate] = useState(
    initialRoom?.price ? String(initialRoom.price) : "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialRoom) {
      setRoomId(initialRoom.id);
      if (initialRoom.price) {
        setNightlyRate(String(initialRoom.price));
      }
    }
  }, [initialRoom]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) {
      await showWarningAlert("Thiếu thông tin", "Vui lòng nhập họ và tên khách lưu trú.");
      return;
    }
    if (!checkIn || !checkOut) {
      await showWarningAlert("Thiếu thông tin", "Vui lòng chọn thời gian nhận và trả phòng.");
      return;
    }

    const confirmResult = await showConfirmDialog({
      title: "Xác nhận tạo đặt phòng?",
      text: `Bạn có chắc chắn muốn tạo đặt phòng mới cho khách ${guestName.trim()}?`,
      confirmText: "Tạo đặt phòng",
      cancelText: "Hủy bỏ",
    });
    if (!confirmResult.isConfirmed) return;

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        guestDisplayName: guestName.trim(),
        plannedCheckInAt: new Date(checkIn).toISOString(),
        plannedCheckOutAt: new Date(checkOut).toISOString(),
      };
      if (guestPhone.trim()) payload.guestPhone = guestPhone.trim();
      if (roomId.trim()) payload.roomId = roomId.trim();
      if (nightlyRate.trim()) {
        const num = Number(nightlyRate.replace(/[^0-9.-]+/g, ""));
        if (!isNaN(num) && num > 0) payload.nightlyRateSnapshot = num;
      }

      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations`,
        {
          method: "POST",
          body: payload,
        },
      );

      await showSuccessAlert(
        "Đặt phòng thành công",
        `Đã tạo đặt phòng thành công cho khách ${guestName.trim()}.`,
      );
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tạo đặt phòng.";
      await showErrorAlert("Lỗi tạo đặt phòng", msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/50 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="future-reservation-form-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="my-auto w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl text-left">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">
              Đặt phòng tương lai
            </p>
            <h2
              id="future-reservation-form-title"
              className="vs-display mt-1 text-2xl sm:text-3xl font-bold text-[#18211d]"
            >
              Tạo lịch đặt phòng mới
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
          >
            <VsIcon name="close" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 sm:space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Họ và tên khách lưu trú <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Ví dụ: Nguyễn Văn An"
              className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#25483f] focus:ring-2 focus:ring-[#25483f]/20 outline-none transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                Số điện thoại
              </label>
              <input
                type="tel"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="Ví dụ: 0912 345 678"
                className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#25483f] focus:ring-2 focus:ring-[#25483f]/20 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                Chọn phòng (Tùy chọn)
              </label>
              <select
                value={roomId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setRoomId(nextId);
                  const matched = availableRooms.find((r) => r.id === nextId);
                  if (matched?.price) setNightlyRate(String(matched.price));
                }}
                className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 focus:border-[#25483f] focus:ring-2 focus:ring-[#25483f]/20 outline-none transition cursor-pointer"
              >
                <option value="">-- Chưa chỉ định phòng cụ thể --</option>
                {availableRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Phòng {r.roomNumber} {r.type ? `• ${r.type}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                Nhận phòng dự kiến <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 focus:border-[#25483f] focus:ring-2 focus:ring-[#25483f]/20 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                Trả phòng dự kiến <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 focus:border-[#25483f] focus:ring-2 focus:ring-[#25483f]/20 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Giá phòng mỗi đêm (₫)
            </label>
            <input
              type="text"
              value={nightlyRate}
              onChange={(e) => setNightlyRate(e.target.value)}
              placeholder="Để trống nếu áp dụng giá niêm yết"
              className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#25483f] focus:ring-2 focus:ring-[#25483f]/20 outline-none transition"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#18211d] hover:bg-[#25483f] px-6 py-2.5 text-sm font-bold text-white transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              <VsIcon name={isSubmitting ? "hourglass_empty" : "event_available"} />
              <span>{isSubmitting ? "Đang tạo..." : "Tạo đặt phòng"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
