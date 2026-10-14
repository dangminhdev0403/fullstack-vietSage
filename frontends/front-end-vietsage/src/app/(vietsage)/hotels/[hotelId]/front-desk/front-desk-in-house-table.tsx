"use client";

import React, { useRef, useState } from "react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { FrontDeskRoomDetailPanel } from "@/features/hotel-ops/components/front-desk-room-detail-panel";
import type { HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";

export type FrontDeskInHouseTableProps = {
  hotelId: string;
  rooms: HotelRoomSummary[];
  renderedAtIso: string;
  canViewBilling: boolean;
  canCheckoutBilling: boolean;
  canManageStays: boolean;
  canCheckOutStay: boolean;
  canCheckInStay: boolean;
  canViewRequests: boolean;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function FrontDeskInHouseTable({
  hotelId,
  rooms,
  renderedAtIso,
  canViewBilling,
  canCheckoutBilling,
  canManageStays,
  canCheckOutStay,
  canCheckInStay,
  canViewRequests,
}: FrontDeskInHouseTableProps) {
  const [selectedRoom, setSelectedRoom] = useState<HotelRoomSummary | null>(null);
  const lastFocusedTriggerRef = useRef<HTMLElement | null>(null);
  const renderedAtTime = new Date(renderedAtIso).getTime();

  return (
    <>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th scope="col" className="px-4 py-3">Khách hàng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Phòng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Nhận phòng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Dự kiến trả</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Số khách</th>
                <th scope="col" className="w-12 px-4 py-3 text-right"><span className="sr-only">Chi tiết</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rooms.map((room) => {
                const stay = room.activeStay;
                const roomNumber = room.roomNumber || "Chưa rõ";
                const isOverdue = Boolean(
                  stay?.plannedCheckOutAt &&
                    new Date(stay.plannedCheckOutAt).getTime() < renderedAtTime,
                );
                const guestName = stay?.guestDisplayName || "Khách lưu trú";

                return (
                  <tr
                    key={room.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Xem chi tiết phòng ${roomNumber} - Khách ${guestName}`}
                    onClick={(e) => {
                      lastFocusedTriggerRef.current = e.currentTarget;
                      setSelectedRoom(room);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        lastFocusedTriggerRef.current = e.currentTarget;
                        setSelectedRoom(room);
                      }
                    }}
                    className="group cursor-pointer transition-colors hover:bg-blue-50/70 focus-visible:bg-blue-50/80 focus-visible:outline-none"
                  >
                    {/* Khách hàng */}
                    <td className="px-4 py-3 align-middle">
                      <div className="font-bold text-slate-900 text-base leading-tight group-hover:text-blue-900 transition-colors">
                        {guestName}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 font-medium whitespace-nowrap">
                        {stay?.reservationCode ? (
                          <span className="font-mono text-blue-700 font-semibold">#{stay.reservationCode}</span>
                        ) : null}
                        {stay?.reservationCode && stay?.guestPhone ? <span> · </span> : null}
                        {stay?.guestPhone ? <span>{stay.guestPhone}</span> : null}
                      </div>
                    </td>

                    {/* Phòng & Trạng thái */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-base group-hover:text-blue-900 transition-colors">
                          Phòng {roomNumber}
                        </span>
                        {isOverdue ? (
                          <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                            <span>Quá hạn</span>
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Nhận phòng */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700">
                      {formatDateTime(stay?.checkedInAt ?? stay?.plannedCheckInAt)}
                    </td>

                    {/* Dự kiến trả phòng */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <span className={`text-sm ${isOverdue ? "font-bold text-rose-600" : "font-medium text-slate-700"}`}>
                        {formatDateTime(stay?.plannedCheckOutAt)}
                      </span>
                    </td>

                    {/* Số lượng khách */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-600">
                      {(stay?.occupants?.length ?? 0) + 1} khách
                    </td>

                    {/* Chỉ báo xem chi tiết */}
                    <td className="w-12 px-4 py-3 align-middle text-right whitespace-nowrap text-slate-400 group-hover:text-blue-600 transition-colors">
                      <VsIcon
                        name="chevron_right"
                        className="text-xl inline-block transition-transform duration-150 group-hover:translate-x-0.5"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <FrontDeskRoomDetailPanel
        isOpen={Boolean(selectedRoom)}
        onClose={() => setSelectedRoom(null)}
        hotelId={hotelId}
        room={selectedRoom}
        canViewBilling={canViewBilling}
        canCheckoutBilling={canCheckoutBilling}
        canManageStays={canManageStays}
        canCheckOutStay={canCheckOutStay}
        canCheckInStay={canCheckInStay}
        triggerElementRef={lastFocusedTriggerRef}
      />
    </>
  );
}
