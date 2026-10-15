"use client";

import { useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/libs/swal";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

export interface OtaBookingInfo {
  reservationId: string;
  guestName: string;
  otaName: string;
  roomType?: string;
  checkInDate?: string;
  checkOutDate?: string;
}

export interface OtaRoomAssignModalProps {
  isOpen: boolean;
  hotelId: string;
  booking: OtaBookingInfo | null;
  availableRooms: Array<{
    id: string;
    roomNumber: string;
    type?: string;
    status?: string;
  }>;
  onClose: () => void;
  onSuccess?: () => void;
  onAssign?: (roomId: string) => Promise<void>;
}

export function OtaRoomAssignModal({
  isOpen,
  hotelId,
  booking,
  availableRooms,
  onClose,
  onSuccess,
  onAssign,
}: OtaRoomAssignModalProps) {
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !booking) return null;

  async function handleAssign() {
    if (!booking) return;
    if (!selectedRoomId) {
      await showWarningAlert("Chưa chọn phòng", "Vui lòng chọn phòng để xếp cho khách đặt qua kênh OTA.");
      return;
    }

    const chosenRoom = availableRooms.find((r) => r.id === selectedRoomId);
    const roomNumber = chosenRoom?.roomNumber || chosenRoom?.id || "mới";

    const confirmResult = await showConfirmDialog({
      title: "Xác nhận gán phòng cho khách OTA?",
      text: `Bạn có chắc chắn muốn gán phòng ${roomNumber} cho đặt phòng ${booking.guestName || "khách"} (${booking.otaName})?`,
      confirmText: "Gán phòng",
      cancelText: "Hủy bỏ",
    });
    if (!confirmResult.isConfirmed) return;

    setIsSubmitting(true);
    try {
      if (onAssign) {
        await onAssign(selectedRoomId);
      } else {
        await requestInternalApiEnvelope(
          `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(booking.reservationId)}/room`,
          {
            method: "PUT",
            body: { roomId: selectedRoomId },
          },
        );
      }

      await showSuccessAlert(
        "Gán phòng thành công",
        `Đã gán phòng ${roomNumber} cho đặt phòng ${booking.guestName}.`,
      );
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể gán phòng.";
      await showErrorAlert("Lỗi gán phòng", msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ota-assign-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-5 text-left border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 id="ota-assign-title" className="text-lg font-bold text-slate-900">
              Xếp phòng khách OTA
            </h3>
            <p className="text-xs text-slate-500">
              {booking.otaName} • {booking.guestName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng hộp thoại xếp phòng"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-xl text-slate-400 hover:bg-slate-100 transition cursor-pointer flex items-center justify-center"
          >
            <VsIcon name="close" className="text-lg" />
          </button>
        </div>

        <div className="rounded-xl bg-slate-50 p-3.5 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Hạng phòng khách đặt:</span>
            <span className="font-bold text-slate-900">{booking.roomType || "Tiêu chuẩn"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Lưu trú:</span>
            <span className="font-semibold text-slate-800">
              {booking.checkInDate || "--"} → {booking.checkOutDate || "--"}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            Chọn phòng còn trống ({availableRooms.length} phòng)
          </label>
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {availableRooms.map((r) => {
              const isSelected = selectedRoomId === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRoomId(r.id)}
                  className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition ${
                    isSelected
                      ? "border-emerald-600 bg-emerald-50 text-emerald-950 font-bold"
                      : "border-slate-200 hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-white px-2 py-0.5 text-xs font-mono font-bold border border-slate-200">
                      #{r.roomNumber}
                    </span>
                    <span className="text-sm">{r.type || "Tiêu chuẩn"}</span>
                  </div>
                  {isSelected ? (
                    <VsIcon name="check_circle" className="text-emerald-700 text-lg" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            disabled={!selectedRoomId || isSubmitting}
            onClick={() => void handleAssign()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50 transition cursor-pointer"
          >
            <VsIcon name="meeting_room" className="text-sm" />
            <span>{isSubmitting ? "Đang gán..." : "Xác nhận gán phòng"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
