"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";

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

type GroupColumnMeta = {
  headerClassName: string;
  cellClassName: string;
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

  const columns = useMemo<ColumnDef<FrontDeskGroupSummary>[]>(
    () => [
      {
        id: "group",
        header: "Đoàn khách",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap",
        } satisfies GroupColumnMeta,
        cell: ({ row }) => {
          const group = row.original;
          return (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 whitespace-nowrap font-mono shadow-2xs">
                <VsIcon name="groups" className="h-3.5 w-3.5 text-purple-600" />
                <span>#{group.groupCode}</span>
              </span>
              <span className="font-bold text-slate-900 text-sm group-hover:text-purple-900 transition-colors">
                {group.leadGuestName}
              </span>
            </div>
          );
        },
      },
      {
        id: "rooms",
        header: "Quy mô phòng",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap",
        } satisfies GroupColumnMeta,
        cell: ({ row }) => {
          const group = row.original;
          return (
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
          );
        },
      },
      {
        id: "earliestCheckInAt",
        header: "Dự kiến nhận",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700",
        } satisfies GroupColumnMeta,
        cell: ({ row }) => formatDateOnly(row.original.earliestCheckInAt),
      },
      {
        id: "latestCheckOutAt",
        header: "Dự kiến trả",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700",
        } satisfies GroupColumnMeta,
        cell: ({ row }) => formatDateOnly(row.original.latestCheckOutAt),
      },
      {
        id: "totalEstimatedAmount",
        header: "Tạm tính",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap text-sm font-bold text-amber-700",
        } satisfies GroupColumnMeta,
        cell: ({ row }) => formatMoney(row.original.totalEstimatedAmount),
      },
      {
        id: "status",
        header: "Trạng thái đoàn",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap",
        } satisfies GroupColumnMeta,
        cell: ({ row }) => {
          const group = row.original;
          const isFullyCheckedIn = group.checkedInRooms === group.totalRooms;
          const isPartiallyCheckedIn = group.checkedInRooms > 0 && !isFullyCheckedIn;

          if (isFullyCheckedIn) {
            return (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 whitespace-nowrap">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                <span>Đã nhận đủ phòng</span>
              </span>
            );
          }
          if (isPartiallyCheckedIn) {
            return (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-800 whitespace-nowrap">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                <span>Đang nhận ({group.checkedInRooms}/{group.totalRooms})</span>
              </span>
            );
          }
          if (group.arrivingRooms > 0) {
            return (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 whitespace-nowrap">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                <span>Chờ nhận phòng</span>
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
              <span>Đã kết thúc</span>
            </span>
          );
        },
      },
    ],
    [],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: groups,
    columns,
    getRowId: (row) => row.groupCode,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as GroupColumnMeta | undefined;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={meta?.headerClassName ?? "px-4 py-3"}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {table.getRowModel().rows.map((row) => {
                const group = row.original;
                return (
                  <tr
                    key={row.id}
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
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as GroupColumnMeta | undefined;
                      return (
                        <td
                          key={cell.id}
                          className={meta?.cellClassName ?? "px-4 py-3 align-middle"}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
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
