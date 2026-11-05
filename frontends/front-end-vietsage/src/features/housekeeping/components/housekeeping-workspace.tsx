"use client";

import Link from "next/link";
import { useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useHousekeeping } from "../hooks/use-housekeeping";
import type { HotelOpsPage, HotelRoomSummary } from "../types/housekeeping-contract";
import { HousekeepingFilterBar } from "./housekeeping-filter-bar";
import { HousekeepingGridView } from "./housekeeping-grid-view";
import { HousekeepingGuestRequests } from "./housekeeping-guest-requests";
import { HousekeepingRealtimeNotifier } from "./housekeeping-realtime-notifier";

type HousekeepingWorkspaceProps = {
  hotelId: string;
  initialRoomsPage?: HotelOpsPage<HotelRoomSummary>;
  currentUser?: { id?: string; name?: string | null; email?: string | null };
};

export function HousekeepingWorkspace({ hotelId, initialRoomsPage, currentUser }: HousekeepingWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"rooms" | "notifications">("rooms");
  const {
    assignmentScope, allRooms, filter, setFilter, summaryMetrics, availableFloors, taskCards, taskCardsByFloor,
    roomNotifications, cleaningRequests, isLoading, isNotificationsLoading, hasRoomsError, hasRequestsError,
    isFetching, confirmRoomReady, isConfirming, claimRequest, completeRequest, handleRefresh,
  } = useHousekeeping({ hotelId, initialRoomsPage, currentUser });
  const notificationCount = roomNotifications.length + cleaningRequests.length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <HousekeepingRealtimeNotifier hotelId={hotelId} scope={assignmentScope} rooms={allRooms} />
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-950 text-balance">Buồng phòng</h1>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isFetching}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50"
        >
          <VsIcon name="refresh" className={isFetching ? "text-xl animate-spin" : "text-xl"} />
          Tải lại
        </button>
      </header>

      {assignmentScope && assignmentScope.mode !== "ALL" && (
        <p className="text-base font-medium text-slate-700">
          Phụ trách: {assignmentScope.mode === "FLOORS" ? `Tầng ${assignmentScope.floors.join(", ")}` : `${assignmentScope.roomIds.length} phòng`}
        </p>
      )}

      <nav aria-label="Buồng phòng" className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1">
        {([
          ["rooms", "Sơ đồ phòng", "dashboard"],
          ["notifications", "Thông báo", "notifications"],
        ] as const).map(([tab, label, icon]) => (
          <button
            key={tab}
            type="button"
            aria-pressed={activeTab === tab}
            aria-controls="housekeeping-content"
            onClick={() => setActiveTab(tab)}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-2 text-base font-semibold whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${activeTab === tab ? "bg-emerald-800 text-white" : "text-emerald-900 hover:bg-emerald-50"}`}
          >
            <VsIcon name={icon} className="hidden text-xl sm:inline" />
            {label}
            {tab === "notifications" && notificationCount > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-sm ${activeTab === tab ? "bg-white text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{notificationCount}</span>
            )}
          </button>
        ))}
      </nav>

      <section id="housekeeping-content" aria-label={activeTab === "rooms" ? "Sơ đồ phòng" : "Thông báo"} className="space-y-5">
        {activeTab === "rooms" ? (
          <>
            <HousekeepingFilterBar
              filter={filter}
              onFilterChange={setFilter}
              availableFloors={availableFloors}
              dirtyRoomsCount={summaryMetrics.dirtyRoomsCount}
              totalRoomsCount={summaryMetrics.totalRooms}
            />
            {isLoading ? (
              <p role="status" className="py-8 text-center text-base text-slate-600">Đang tải phòng…</p>
            ) : hasRoomsError ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-base text-red-900">Chưa tải được phòng. Vui lòng tải lại.</p>
            ) : taskCards.length === 0 ? (
              <div className="py-8 text-center text-base text-slate-600">
                <p>{filter.floor !== "all" || filter.search ? "Không có phòng khớp bộ lọc." : filter.status === "all" ? "Chưa có phòng." : "Không có phòng cần dọn."}</p>
                {(filter.floor !== "all" || filter.search) && (
                  <button type="button" onClick={() => setFilter({ floor: "all", search: "" })} className="mt-3 min-h-11 rounded-xl px-4 py-2 font-semibold text-emerald-800 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">Xóa bộ lọc</button>
                )}
              </div>
            ) : (
              <HousekeepingGridView hotelId={hotelId} taskCardsByFloor={taskCardsByFloor} onConfirmReady={confirmRoomReady} isConfirming={isConfirming} />
            )}
          </>
        ) : (
          <>
            {hasRoomsError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-base text-red-900">Chưa tải được thông báo phòng cần dọn. Vui lòng tải lại.</p>}
            {roomNotifications.length > 0 && (
              <section aria-labelledby="dirty-room-notifications" className="space-y-3">
                <h2 id="dirty-room-notifications" className="text-lg font-bold text-slate-950 text-balance">Phòng cần dọn</h2>
                <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {roomNotifications.map((card) => (
                    <li key={card.room.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-slate-950">Phòng {card.roomNumber}</p>
                        <p className="text-sm text-slate-600">{card.floor}{card.task?.priority === "URGENT" ? " · Ưu tiên dọn" : " · Cần dọn"}</p>
                      </div>
                      <Link
                        href={`/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(card.room.id)}`}
                        aria-label={`Xem phòng ${card.roomNumber}`}
                        className="min-h-11 shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-base font-semibold text-emerald-800 whitespace-nowrap hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                      >Xem phòng</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {hasRequestsError ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-base text-red-900">Chưa tải được yêu cầu từ khách. Vui lòng tải lại.</p>
            ) : cleaningRequests.length > 0 && (
              <section aria-labelledby="guest-cleaning-requests" className="space-y-3">
                <h2 id="guest-cleaning-requests" className="text-lg font-bold text-slate-950 text-balance">Yêu cầu từ khách</h2>
                <HousekeepingGuestRequests requests={cleaningRequests} onClaimRequest={claimRequest} onCompleteRequest={completeRequest} />
              </section>
            )}
            {notificationCount === 0 && !hasRoomsError && !hasRequestsError && (
              <p role="status" className="py-8 text-center text-base text-slate-600">{isNotificationsLoading ? "Đang tải thông báo…" : "Không có yêu cầu cần xử lý."}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
