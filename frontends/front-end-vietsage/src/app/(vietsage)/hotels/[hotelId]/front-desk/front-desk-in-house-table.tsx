"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
} from "@tanstack/react-table";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { FrontDeskRoomDetailPanel } from "@/features/hotel-ops/components/front-desk-room-detail-panel";
import type { HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";
import { InHouseBcaControls, InHouseBcaStatus, useInHouseBca } from "@/features/kbtt/components/in-house-bca-status";
import type { KbttDeclarationListItem } from "@/features/kbtt/types/kbtt-contract";

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
  canViewKbtt: boolean;
  canManageKbtt: boolean;
  canConfigureKbtt: boolean;
};

type InHouseColumnMeta = {
  headerClassName: string;
  cellClassName: string;
};

type FrontDeskInHouseTableMeta = {
  hotelId: string;
  canManageKbtt: boolean;
  bcaData?: (KbttDeclarationListItem[] & { delivery?: { state: string } });
  bcaPending: boolean;
  bcaError: boolean;
  onRefreshBca: () => void;
  renderedAtTime: number;
  expandedBcaStayIds: Record<string, boolean>;
  onToggleBcaExpand: (rowKey: string) => void;
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

function GuestCell({ row }: CellContext<HotelRoomSummary, unknown>) {
  const guestName = row.original.activeStay?.guestDisplayName || "Khách lưu trú";
  return (
    <div className="font-bold text-slate-900 text-base leading-tight group-hover:text-blue-900 transition-colors">
      {guestName}
    </div>
  );
}

function RoomCell({ row, table }: CellContext<HotelRoomSummary, unknown>) {
  const meta = table.options.meta as FrontDeskInHouseTableMeta | undefined;
  const room = row.original;
  const stay = room.activeStay;
  const roomNumber = room.roomNumber || "Chưa rõ";
  const renderedAtTime = meta?.renderedAtTime ?? 0;
  const isOverdue = Boolean(
    stay?.plannedCheckOutAt &&
      new Date(stay.plannedCheckOutAt).getTime() < renderedAtTime,
  );
  return (
    <div className="inline-flex items-center gap-2">
      <span className="font-bold text-slate-800 text-base group-hover:text-blue-900 transition-colors">
        Phòng {roomNumber}
      </span>
      {isOverdue ? (
        <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700 whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
          <span>Quá hạn</span>
        </span>
      ) : null}
    </div>
  );
}

function CheckInCell({ row }: CellContext<HotelRoomSummary, unknown>) {
  const stay = row.original.activeStay;
  return <>{formatDateTime(stay?.checkedInAt ?? stay?.plannedCheckInAt)}</>;
}

function PlannedCheckOutCell({ row, table }: CellContext<HotelRoomSummary, unknown>) {
  const meta = table.options.meta as FrontDeskInHouseTableMeta | undefined;
  const stay = row.original.activeStay;
  const renderedAtTime = meta?.renderedAtTime ?? 0;
  const isOverdue = Boolean(
    stay?.plannedCheckOutAt &&
      new Date(stay.plannedCheckOutAt).getTime() < renderedAtTime,
  );
  return (
    <span className={`text-sm ${isOverdue ? "font-bold text-rose-600" : "font-medium text-slate-700"}`}>
      {formatDateTime(stay?.plannedCheckOutAt)}
    </span>
  );
}

function OccupantsCell({ row }: CellContext<HotelRoomSummary, unknown>) {
  const stay = row.original.activeStay;
  return <>{`${(stay?.occupants?.length ?? 0) + 1} khách`}</>;
}

function BcaCell({ row, table }: CellContext<HotelRoomSummary, unknown>) {
  const meta = table.options.meta as FrontDeskInHouseTableMeta | undefined;
  const stayId = row.original.activeStay?.id;
  const hotelId = meta?.hotelId ?? "";
  const bcaData = meta?.bcaData;
  const bcaRows = useMemo(
    () => (bcaData ?? []).filter((item) => Boolean(stayId && item.stayId === stayId)),
    [bcaData, stayId],
  );
  const rowKey = stayId || row.original.id;
  const isExpanded = Boolean(meta?.expandedBcaStayIds[rowKey]);

  return (
    <InHouseBcaStatus
      hotelId={hotelId}
      stayId={stayId}
      rows={bcaRows}
      loading={meta?.bcaPending ?? false}
      failed={meta?.bcaError ?? false}
      canManage={meta?.canManageKbtt ?? false}
      connectionIssue={
        bcaData?.delivery?.state === "RUNNING"
          ? null
          : bcaData?.delivery?.state === "NOT_CONFIGURED"
            ? "Cần kết nối BCA trước khi gửi."
            : "Gửi BCA đang tạm dừng."
      }
      isOpen={isExpanded}
      onToggle={() => {
        meta?.onToggleBcaExpand(rowKey);
      }}
      onRefresh={() => {
        meta?.onRefreshBca();
      }}
    />
  );
}

function DetailIndicatorCell() {
  return (
    <VsIcon
      name="chevron_right"
      className="text-xl inline-block transition-transform duration-150 group-hover:translate-x-0.5"
    />
  );
}

const IN_HOUSE_COLUMNS: ColumnDef<HotelRoomSummary>[] = [
  {
    id: "guest",
    header: "Khách hàng",
    meta: {
      headerClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 align-middle",
    } satisfies InHouseColumnMeta,
    cell: GuestCell,
  },
  {
    id: "room",
    header: "Phòng",
    meta: {
      headerClassName: "px-4 py-3 whitespace-nowrap",
      cellClassName: "px-4 py-3 align-middle whitespace-nowrap",
    } satisfies InHouseColumnMeta,
    cell: RoomCell,
  },
  {
    id: "checkIn",
    header: "Nhận phòng",
    meta: {
      headerClassName: "px-4 py-3 whitespace-nowrap",
      cellClassName: "px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700",
    } satisfies InHouseColumnMeta,
    cell: CheckInCell,
  },
  {
    id: "plannedCheckOut",
    header: "Dự kiến trả",
    meta: {
      headerClassName: "px-4 py-3 whitespace-nowrap",
      cellClassName: "px-4 py-3 align-middle whitespace-nowrap",
    } satisfies InHouseColumnMeta,
    cell: PlannedCheckOutCell,
  },
  {
    id: "occupants",
    header: "Số khách",
    meta: {
      headerClassName: "px-4 py-3 whitespace-nowrap",
      cellClassName: "px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-600",
    } satisfies InHouseColumnMeta,
    cell: OccupantsCell,
  },
  {
    id: "bca",
    header: "Trạng thái BCA",
    meta: { headerClassName: "px-4 py-3", cellClassName: "px-4 py-3 align-middle" } satisfies InHouseColumnMeta,
    cell: BcaCell,
  },
  {
    id: "detailIndicator",
    header: () => <span className="sr-only">Chi tiết</span>,
    meta: {
      headerClassName: "w-12 px-4 py-3 text-right",
      cellClassName:
        "w-12 px-4 py-3 align-middle text-right whitespace-nowrap text-slate-400 group-hover:text-blue-600 transition-colors",
    } satisfies InHouseColumnMeta,
    cell: DetailIndicatorCell,
  },
];

export function FrontDeskInHouseTable({
  hotelId,
  rooms,
  renderedAtIso,
  canViewBilling,
  canCheckoutBilling,
  canManageStays,
  canCheckOutStay,
  canCheckInStay,
  canViewKbtt,
  canManageKbtt,
  canConfigureKbtt,
}: FrontDeskInHouseTableProps) {
  const [selectedRoom, setSelectedRoom] = useState<HotelRoomSummary | null>(null);
  const [expandedBcaStayIds, setExpandedBcaStayIds] = useState<Record<string, boolean>>({});
  const lastFocusedTriggerRef = useRef<HTMLElement | null>(null);
  const renderedAtTime = new Date(renderedAtIso).getTime();

  const stayIds = useMemo(
    () => rooms.flatMap((room) => (room.activeStay?.id ? [room.activeStay.id] : [])),
    [rooms],
  );
  const bca = useInHouseBca(hotelId, stayIds, canViewKbtt);

  const handleToggleBcaExpand = useCallback((rowKey: string) => {
    setExpandedBcaStayIds((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }, []);

  const handleRefreshBca = useCallback(() => {
    void bca.refetch();
  }, [bca]);

  const meta: FrontDeskInHouseTableMeta = useMemo(
    () => ({
      hotelId,
      canManageKbtt,
      bcaData: bca.data,
      bcaPending: bca.isPending,
      bcaError: bca.isError,
      onRefreshBca: handleRefreshBca,
      renderedAtTime,
      expandedBcaStayIds,
      onToggleBcaExpand: handleToggleBcaExpand,
    }),
    [
      hotelId,
      canManageKbtt,
      bca.data,
      bca.isPending,
      bca.isError,
      handleRefreshBca,
      renderedAtTime,
      expandedBcaStayIds,
      handleToggleBcaExpand,
    ],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rooms,
    columns: IN_HOUSE_COLUMNS,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility: { bca: canViewKbtt } },
    meta,
  });

  return (
    <>
      {canViewKbtt ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {bca.data?.delivery ? (
            <p role="status" className="text-base text-slate-700">
              {bca.data.delivery.state === "RUNNING"
                ? "Gửi BCA đang hoạt động"
                : bca.data.delivery.state === "PAUSED"
                  ? "Gửi BCA đang tạm dừng"
                  : "Chưa kết nối BCA"}
            </p>
          ) : null}
          {canConfigureKbtt ? <InHouseBcaControls hotelId={hotelId} /> : null}
        </div>
      ) : null}
      {canViewKbtt && bca.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-base text-amber-900">
          <span>Không tải được trạng thái BCA.</span>
          <button
            type="button"
            disabled={bca.isFetching}
            onClick={() => void bca.refetch()}
            className="min-h-11 rounded-lg px-3 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  {headerGroup.headers.map((header) => {
                    const columnMeta = header.column.columnDef.meta as InHouseColumnMeta | undefined;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={columnMeta?.headerClassName ?? "px-4 py-3"}
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
                const room = row.original;
                const stay = room.activeStay;
                const roomNumber = room.roomNumber || "Chưa rõ";
                const guestName = stay?.guestDisplayName || "Khách lưu trú";

                return (
                  <tr
                    key={row.id}
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
                    {row.getVisibleCells().map((cell) => {
                      const cellMeta = cell.column.columnDef.meta as InHouseColumnMeta | undefined;
                      return (
                        <td
                          key={cell.id}
                          className={cellMeta?.cellClassName ?? "px-4 py-3 align-middle"}
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
