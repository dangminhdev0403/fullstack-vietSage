"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { FrontDeskArrivalDetailPanel } from "@/features/hotel-ops/components/front-desk-arrival-detail-panel";
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

type ArrivalColumnMeta = {
  headerClassName: string;
  cellClassName: string;
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
  const lastFocusedTriggerRef = useRef<HTMLElement | null>(null);

  const columns = useMemo<ColumnDef<HotelArrival>[]>(
    () => [
      {
        id: "guestDisplayName",
        header: "Khách hàng",
        meta: {
          headerClassName: "px-4 py-3",
          cellClassName: "px-4 py-3 align-middle",
        } satisfies ArrivalColumnMeta,
        cell: ({ row }) => {
          const arrival = row.original;
          return (
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-base leading-tight group-hover:text-blue-900 transition-colors">
                {arrival.guestDisplayName}
              </span>
              {arrival.groupCode ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 whitespace-nowrap shadow-2xs">
                  <VsIcon name="groups" className="h-3.5 w-3.5 text-purple-600" />
                  <span>Đoàn #{arrival.groupCode}</span>
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "room",
        header: "Phòng",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap",
        } satisfies ArrivalColumnMeta,
        cell: ({ row }) => {
          const arrival = row.original;
          return arrival.room?.roomNumber ? (
            <span className="font-bold text-slate-800 text-base group-hover:text-blue-900 transition-colors">
              Phòng {arrival.room.roomNumber}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
              Chưa gán phòng
            </span>
          );
        },
      },
      {
        id: "plannedCheckInAt",
        header: "Dự kiến nhận",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700",
        } satisfies ArrivalColumnMeta,
        cell: ({ row }) => formatDateTime(row.original.plannedCheckInAt),
      },
      {
        id: "plannedCheckOutAt",
        header: "Dự kiến trả",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700",
        } satisfies ArrivalColumnMeta,
        cell: ({ row }) => formatDateTime(row.original.plannedCheckOutAt),
      },
      {
        id: "rate",
        header: "Giá phòng",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap text-sm font-bold text-amber-700",
        } satisfies ArrivalColumnMeta,
        cell: ({ row }) => formatMoney(row.original.rate ?? row.original.nightlyRateSnapshot),
      },
      {
        id: "status",
        header: "Trạng thái",
        meta: {
          headerClassName: "px-4 py-3 whitespace-nowrap",
          cellClassName: "px-4 py-3 align-middle whitespace-nowrap",
        } satisfies ArrivalColumnMeta,
        cell: ({ row }) => {
          const statusDisplay = getArrivalStatusDisplay(row.original, todayYmd);
          return (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${statusDisplay.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusDisplay.dotClass}`} />
              <span>{statusDisplay.label}</span>
            </span>
          );
        },
      },
    ],
    [todayYmd],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: arrivals,
    columns,
    getRowId: (row) => row.id,
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
                    const meta = header.column.columnDef.meta as ArrivalColumnMeta | undefined;
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
                const arrival = row.original;
                return (
                  <tr
                    key={row.id}
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
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as ArrivalColumnMeta | undefined;
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
    </>
  );
}
