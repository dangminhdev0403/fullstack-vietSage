"use client";

import React, { useRef, useState } from "react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { GroupOperationsDrawer } from "@/features/hotel-ops/components/group-operations-drawer";
import type { HotelArrival } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  buildFrontDeskGroupSummaries,
  type FrontDeskGroupSummary,
} from "@/features/hotel-ops/utils/front-desk-groups";

export { buildFrontDeskGroupSummaries, type FrontDeskGroupSummary };

export type FrontDeskGroupsTableProps = {
  hotelId: string;
  arrivals: HotelArrival[];
  groups: FrontDeskGroupSummary[];
  todayYmd: string;
  canOperateArrivals: boolean;
  canCheckInStay?: boolean;
  canManageReservations?: boolean;
  initialSelectedGroupCode?: string | null;
};

function formatDateOnly(value?: string | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
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

export function FrontDeskGroupsTable({
  hotelId,
  arrivals,
  groups,
  todayYmd,
  canOperateArrivals,
  canCheckInStay = false,
  canManageReservations = false,
  initialSelectedGroupCode = null,
}: FrontDeskGroupsTableProps) {
  const [activeGroupCode, setActiveGroupCode] = useState<string | null>(initialSelectedGroupCode);
  const lastFocusedTriggerRef = useRef<HTMLElement | null>(null);

  const totalRoomsInGroups = groups.reduce((acc, g) => acc + g.totalRooms, 0);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-500">
          Hiển thị <span className="font-bold text-slate-800">{groups.length}</span> đoàn khách (
          <span className="font-bold text-slate-800">{totalRoomsInGroups}</span> phòng)
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Đoàn khách</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Quy mô phòng</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Dự kiến nhận</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Dự kiến trả</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Tạm tính</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Trạng thái đoàn</th>
                <th scope="col" className="w-24 px-4 py-3 text-right">
                  <span className="sr-only">Chi tiết</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {groups.map((group) => {
                const isFullyCheckedIn = group.checkedInRooms === group.totalRooms;
                const isPartiallyCheckedIn = group.checkedInRooms > 0 && !isFullyCheckedIn;

                return (
                  <tr
                    key={group.groupCode}
                    tabIndex={0}
                    role="button"
                    aria-label={`Xem chi tiết đoàn #${group.groupCode} - ${group.leadGuestName}`}
                    onClick={(e) => {
                      lastFocusedTriggerRef.current = e.currentTarget;
                      setActiveGroupCode(group.groupCode);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        lastFocusedTriggerRef.current = e.currentTarget;
                        setActiveGroupCode(group.groupCode);
                      }
                    }}
                    className="group cursor-pointer transition-colors hover:bg-purple-50/50 focus-visible:bg-purple-50/70 focus-visible:outline-none"
                  >
                    {/* Đoàn khách (Gọn gàng: Mã + Tên, không nhồi SĐT) */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 whitespace-nowrap font-mono shadow-2xs">
                          <VsIcon name="groups" className="h-3.5 w-3.5 text-purple-600" />
                          <span>#{group.groupCode}</span>
                        </span>
                        <span className="font-bold text-slate-900 text-sm group-hover:text-purple-900 transition-colors">
                          {group.leadGuestName}
                        </span>
                      </div>
                    </td>

                    {/* Quy mô phòng (Gọn gàng: Số phòng + Tag gán, không dump danh sách số phòng) */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">
                          {group.totalRooms} phòng
                        </span>
                        {group.unassignedRoomCount > 0 ? (
                          <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
                            {group.unassignedRoomCount} chưa gán
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 whitespace-nowrap">
                            Đã gán đủ
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Dự kiến nhận */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700">
                      {formatDateOnly(group.earliestCheckInAt)}
                    </td>

                    {/* Dự kiến trả */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700">
                      {formatDateOnly(group.latestCheckOutAt)}
                    </td>

                    {/* Tạm tính */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-bold text-amber-700">
                      {formatMoney(group.totalEstimatedAmount)}
                    </td>

                    {/* Trạng thái đoàn */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      {isFullyCheckedIn ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                          <span>Đã nhận đủ phòng</span>
                        </span>
                      ) : isPartiallyCheckedIn ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-800 whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                          <span>Đang nhận ({group.checkedInRooms}/{group.totalRooms})</span>
                        </span>
                      ) : group.arrivingRooms > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                          <span>Chờ nhận phòng</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                          <span>Đã kết thúc</span>
                        </span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="w-24 px-4 py-3 align-middle text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title={`Xem chi tiết đoàn #${group.groupCode}`}
                          aria-label={`Xem chi tiết đoàn #${group.groupCode}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            lastFocusedTriggerRef.current = e.currentTarget;
                            setActiveGroupCode(group.groupCode);
                          }}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 hover:text-purple-900 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          <VsIcon name="visibility" className="h-3.5 w-3.5" />
                          <span>Chi tiết</span>
                        </button>
                        <VsIcon
                          name="chevron_right"
                          className="text-xl text-slate-400 group-hover:text-purple-600 transition-transform duration-150 group-hover:translate-x-0.5"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
        triggerElementRef={lastFocusedTriggerRef}
      />
    </>
  );
}
