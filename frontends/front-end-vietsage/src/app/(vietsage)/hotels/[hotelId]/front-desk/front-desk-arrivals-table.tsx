"use client";

import React, { useRef, useState } from "react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { FrontDeskArrivalDetailPanel } from "@/features/hotel-ops/components/front-desk-arrival-detail-panel";
import { GroupOperationsDrawer } from "@/features/hotel-ops/components/group-operations-drawer";
import type { HotelArrival } from "@/features/hotel-ops/types/hotel-ops-contract";
import { getArrivalStatusDisplay } from "@/features/hotel-ops/utils/hotel-ops-display";

export type FrontDeskArrivalsTableProps = {
  hotelId: string;
  arrivals: HotelArrival[];
  range: string;
  todayYmd: string;
  canOperateArrivals: boolean;
  canCheckInStay?: boolean;
  canManageReservations?: boolean;
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

function formatMoney(value?: string | number | null): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Giá linh hoạt";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function FrontDeskArrivalsTable({
  hotelId,
  arrivals,
  todayYmd,
  canOperateArrivals,
  canCheckInStay = false,
  canManageReservations = false,
}: FrontDeskArrivalsTableProps) {
  const [selectedArrival, setSelectedArrival] = useState<HotelArrival | null>(null);
  const [activeGroupCode, setActiveGroupCode] = useState<string | null>(null);
  const lastFocusedTriggerRef = useRef<HTMLElement | null>(null);

  const hasAnyGroup = arrivals.some((a) => Boolean(a.groupCode));

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-500">
          Hiển thị <span className="font-bold text-slate-800">{arrivals.length}</span> lượt đặt trước
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th scope="col" className="px-4 py-3">Khách hàng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Phòng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Dự kiến nhận</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Dự kiến trả</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Giá phòng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Trạng thái</th>
                <th scope="col" className="w-12 px-4 py-3 text-right">
                  <span className="sr-only">Chi tiết</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {arrivals.map((arrival) => {
                return (
                  <tr
                    key={arrival.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Xem chi tiết khách đặt trước ${arrival.guestDisplayName}${arrival.room?.roomNumber ? ` - Phòng ${arrival.room.roomNumber}` : ""}`}
                    onClick={(e) => {
                      lastFocusedTriggerRef.current = e.currentTarget;
                      setSelectedArrival(arrival);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        lastFocusedTriggerRef.current = e.currentTarget;
                        setSelectedArrival(arrival);
                      }
                    }}
                    className="group cursor-pointer transition-colors hover:bg-blue-50/70 focus-visible:bg-blue-50/80 focus-visible:outline-none"
                  >
                    {/* Khách hàng */}
                    <td className="px-4 py-3 align-middle">
                      <div className="font-bold text-slate-900 text-base leading-tight group-hover:text-blue-900 transition-colors">
                        {arrival.guestDisplayName}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 font-medium whitespace-nowrap">
                        {arrival.reservationCode ? (
                          <span className="font-mono text-blue-700 font-semibold">#{arrival.reservationCode}</span>
                        ) : null}
                        {arrival.reservationCode && arrival.guestPhone ? <span> · </span> : null}
                        {arrival.guestPhone ? <span>{arrival.guestPhone}</span> : null}
                      </div>
                      {arrival.groupCode ? (
                        <div className="mt-1 flex items-center">
                          <button
                            type="button"
                            title={`Mở quản lý đoàn #${arrival.groupCode}`}
                            aria-label={`Mở quản lý đoàn #${arrival.groupCode}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveGroupCode(arrival.groupCode || null);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 hover:bg-purple-100 hover:text-purple-900 transition-colors cursor-pointer whitespace-nowrap shadow-2xs min-h-[24px]"
                          >
                            <VsIcon name="groups" className="h-3.5 w-3.5 text-purple-600" />
                            <span>Đoàn #{arrival.groupCode}</span>
                          </button>
                        </div>
                      ) : null}
                    </td>

                    {/* Phòng */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      {arrival.room?.roomNumber ? (
                        <span className="font-bold text-slate-800 text-base group-hover:text-blue-900 transition-colors">
                          Phòng {arrival.room.roomNumber}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Chưa gán phòng
                        </span>
                      )}
                    </td>

                    {/* Nhận phòng */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700">
                      {formatDateTime(arrival.plannedCheckInAt)}
                    </td>

                    {/* Trả phòng */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700">
                      {formatDateTime(arrival.plannedCheckOutAt)}
                    </td>

                    {/* Giá */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-bold text-amber-700">
                      {formatMoney(arrival.rate ?? arrival.nightlyRateSnapshot)}
                    </td>

                    {/* Trạng thái */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      {(() => {
                        const statusDisplay = getArrivalStatusDisplay(arrival, todayYmd);
                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusDisplay.badgeClass}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDisplay.dotClass}`} />
                            <span>{statusDisplay.label}</span>
                          </span>
                        );
                      })()}
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

      <FrontDeskArrivalDetailPanel
        isOpen={Boolean(selectedArrival)}
        onClose={() => setSelectedArrival(null)}
        hotelId={hotelId}
        arrival={selectedArrival}
        todayYmd={todayYmd}
        canCheckInStay={canCheckInStay}
        canManageReservations={canManageReservations}
        canOperateArrivals={canOperateArrivals}
        triggerElementRef={lastFocusedTriggerRef}
      />

      <GroupOperationsDrawer
        isOpen={activeGroupCode !== null}
        onClose={() => setActiveGroupCode(null)}
        hotelId={hotelId}
        groupCode={activeGroupCode}
        initialArrivals={arrivals}
        todayYmd={todayYmd}
        canOperateArrivals={canOperateArrivals}
        canCheckInStay={canCheckInStay}
        canCheckOutStay={Boolean(canManageReservations || canOperateArrivals)}
      />
    </>
  );
}
