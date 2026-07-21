"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { HotelArrival, HotelReservationCheckInResult, HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";

type Props = {
  hotelId: string;
  arrivals: HotelArrival[];
  rooms: HotelRoomSummary[];
  canManage: boolean;
};

function localDateTime(offsetDays: number, hour: number): string {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  value.setHours(hour, 0, 0, 0);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function isAvailable(room: HotelRoomSummary): boolean {
  return (room.status ?? "").toUpperCase() === "AVAILABLE" && !room.activeStay;
}

export function ArrivalsClient({ hotelId, arrivals, rooms, canManage }: Props) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    guestDisplayName: "",
    guestPhone: "",
    plannedCheckInAt: localDateTime(0, 14),
    plannedCheckOutAt: localDateTime(1, 12),
  });
  const availableRooms = useMemo(() => rooms.filter(isAvailable), [rooms]);
  const apiBase = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}`;

  async function createReservation(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await requestInternalApiEnvelope(`${apiBase}/reservations`, {
        method: "POST",
        body: {
          guestDisplayName: form.guestDisplayName.trim(),
          ...(form.guestPhone.trim() ? { guestPhone: form.guestPhone.trim() } : {}),
          plannedCheckInAt: new Date(form.plannedCheckInAt).toISOString(),
          plannedCheckOutAt: new Date(form.plannedCheckOutAt).toISOString(),
        },
      });
      setIsCreateOpen(false);
      await Swal.fire({ icon: "success", title: "Đã tạo đặt phòng", timer: 1500, showConfirmButton: false });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể tạo đặt phòng", text: error instanceof Error ? error.message : "Vui lòng thử lại." });
    } finally {
      setSaving(false);
    }
  }

  async function assignRoom(arrival: HotelArrival) {
    const inputOptions = Object.fromEntries(availableRooms.map((room) => [room.id, `Phòng ${room.roomNumber ?? room.id} · ${room.type ?? "Tiêu chuẩn"}`]));
    const result = await Swal.fire({
      title: `Gán phòng cho ${arrival.guestDisplayName}`,
      input: "select",
      inputOptions,
      inputPlaceholder: "Chọn phòng sẵn sàng",
      showCancelButton: true,
      confirmButtonText: "Gán phòng",
      cancelButtonText: "Hủy",
      inputValidator: (value) => value ? undefined : "Hãy chọn phòng.",
    });
    if (!result.isConfirmed || !result.value) return;
    try {
      await requestInternalApiEnvelope(`${apiBase}/reservations/${encodeURIComponent(arrival.id)}/room`, { method: "PUT", body: { roomId: result.value } });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể gán phòng", text: error instanceof Error ? error.message : "Vui lòng thử lại." });
    }
  }

  async function checkIn(arrival: HotelArrival) {
    const confirmation = await Swal.fire({ icon: "question", title: `Check-in ${arrival.guestDisplayName}?`, text: "Hệ thống sẽ mở stay, folio và kích hoạt QR phòng.", showCancelButton: true, confirmButtonText: "Check-in", cancelButtonText: "Hủy" });
    if (!confirmation.isConfirmed) return;
    try {
      const result = await requestInternalApiEnvelope<HotelReservationCheckInResult>(`${apiBase}/reservations/${encodeURIComponent(arrival.id)}/check-in`, { method: "POST" });
      await Swal.fire({ icon: "success", title: "Check-in hoàn tất", text: result.data.accessCode ? `Mã truy cập GuestOS: ${result.data.accessCode}` : "QR phòng đã sẵn sàng." });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể check-in", text: error instanceof Error ? error.message : "Vui lòng thử lại." });
    }
  }

  return (
    <>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--secondary)]">7 NGÀY TỚI</p>
          <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)]">Khách đến và đặt phòng</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-variant)]">Tạo đặt phòng, gán phòng sẵn sàng và check-in khách theo đúng thứ tự nghiệp vụ.</p>
        </div>
        {canManage ? <button type="button" onClick={() => setIsCreateOpen(true)} className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white">Tạo đặt phòng</button> : null}
      </header>

      <section className="overflow-hidden rounded-lg border border-[var(--outline-variant)] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[var(--surface-container-low)] text-xs uppercase"><tr><th className="px-5 py-4">Mã</th><th className="px-5 py-4">Khách</th><th className="px-5 py-4">Lịch lưu trú</th><th className="px-5 py-4">Phòng</th><th className="px-5 py-4">Trạng thái</th><th className="px-5 py-4 text-right">Thao tác</th></tr></thead>
            <tbody className="divide-y divide-[var(--outline-variant)]">
              {arrivals.map((arrival) => (
                <tr key={arrival.id}>
                  <td className="px-5 py-4 font-bold text-[var(--primary)]">{arrival.reservationCode}</td>
                  <td className="px-5 py-4"><p className="font-semibold">{arrival.guestDisplayName}</p><p className="text-xs text-[var(--on-surface-variant)]">{arrival.guestPhone ?? "Chưa có số điện thoại"}</p></td>
                  <td className="px-5 py-4 text-xs"><p>{formatDate(arrival.plannedCheckInAt)}</p><p className="mt-1 text-[var(--on-surface-variant)]">đến {formatDate(arrival.plannedCheckOutAt)}</p></td>
                  <td className="px-5 py-4">{arrival.roomId ? rooms.find((room) => room.id === arrival.roomId)?.roomNumber ?? arrival.roomId : "Chưa gán"}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-[var(--surface-container)] px-3 py-1 text-xs font-semibold">{arrival.status}</span></td>
                  <td className="px-5 py-4 text-right">
                    {canManage && arrival.status !== "CHECKED_IN" ? (
                      arrival.roomId
                        ? <button type="button" onClick={() => void checkIn(arrival)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white">Check-in</button>
                        : <button type="button" onClick={() => void assignRoom(arrival)} className="rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-xs font-bold text-[var(--primary)]">Gán phòng</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {arrivals.length === 0 ? <p className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Không có khách dự kiến đến trong 7 ngày tới.</p> : null}
      </section>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Đóng" onClick={() => setIsCreateOpen(false)} className="absolute inset-0 bg-slate-950/50" />
          <form onSubmit={createReservation} className="relative z-10 w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-[var(--primary)]">Tạo đặt phòng</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="text-xs font-bold uppercase">Tên khách</span><input required minLength={2} value={form.guestDisplayName} onChange={(event) => setForm({ ...form, guestDisplayName: event.target.value })} className="mt-2 h-11 w-full rounded-lg border px-3" /></label>
              <label className="sm:col-span-2"><span className="text-xs font-bold uppercase">Số điện thoại</span><input value={form.guestPhone} onChange={(event) => setForm({ ...form, guestPhone: event.target.value })} className="mt-2 h-11 w-full rounded-lg border px-3" /></label>
              <label><span className="text-xs font-bold uppercase">Nhận phòng</span><input required type="datetime-local" value={form.plannedCheckInAt} onChange={(event) => setForm({ ...form, plannedCheckInAt: event.target.value })} className="mt-2 h-11 w-full rounded-lg border px-3" /></label>
              <label><span className="text-xs font-bold uppercase">Trả phòng</span><input required type="datetime-local" value={form.plannedCheckOutAt} onChange={(event) => setForm({ ...form, plannedCheckOutAt: event.target.value })} className="mt-2 h-11 w-full rounded-lg border px-3" /></label>
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-bold">Hủy</button><button disabled={saving} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang tạo..." : "Tạo đặt phòng"}</button></div>
          </form>
        </div>
      ) : null}
    </>
  );
}
