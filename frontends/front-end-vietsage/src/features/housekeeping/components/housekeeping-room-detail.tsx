"use client";

import Link from "next/link";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useHousekeeping } from "../hooks/use-housekeeping";
import { HOUSEKEEPING_ROOM_STATES } from "../utils/housekeeping-room-state";
import { HousekeepingRealtimeNotifier } from "./housekeeping-realtime-notifier";

type Props = {
  hotelId: string;
  roomId: string;
  currentUser?: { id?: string; name?: string | null; email?: string | null };
};

export function HousekeepingRoomDetail({ hotelId, roomId, currentUser }: Props) {
  const {
    assignmentScope, allRooms, detailCard: card, isLoading, hasRoomsError,
    isFetching, handleRefresh, confirmRoomReady, isConfirming,
  } = useHousekeeping({ hotelId, roomId, currentUser });
  const state = card ? HOUSEKEEPING_ROOM_STATES[card.effectiveStatus] : undefined;
  const assignedToAnother = card?.effectiveStatus === "cleaning" && !card.isClaimedByMe;
  const canComplete = card && (card.effectiveStatus === "processing" || card.effectiveStatus === "cleaning") && !assignedToAnother;

  return (
    <section className="mx-auto w-full max-w-xl space-y-5">
      <HousekeepingRealtimeNotifier hotelId={hotelId} scope={assignmentScope} rooms={allRooms} />
      <Link href={`/hotels/${encodeURIComponent(hotelId)}/rooms`} className="inline-flex min-h-11 items-center gap-2 rounded-xl text-base font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <VsIcon name="arrow_back" className="text-xl" /> Sơ đồ phòng
      </Link>
      {isLoading ? (
        <p role="status" className="py-8 text-center text-base text-slate-600">Đang tải phòng…</p>
      ) : hasRoomsError || !card || !state ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-base text-amber-950">
          <h1 className="text-xl font-bold text-balance">Chưa thể xem phòng</h1>
          <p className="text-pretty">Phòng không khả dụng hoặc nằm ngoài phạm vi phụ trách.</p>
          <button type="button" onClick={() => void handleRefresh()} disabled={isFetching} className="min-h-11 rounded-xl border border-amber-700 px-4 font-semibold whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Tải lại</button>
        </div>
      ) : (
        <article className={`space-y-5 rounded-2xl border p-5 sm:p-6 ${state.style}`}>
          <header className="space-y-2">
            <p className="text-base font-medium">{card.floor}</p>
            <h1 className="break-words text-3xl font-bold text-balance">Phòng {card.roomNumber}</h1>
            <p role="status" className="flex items-center gap-2 text-lg font-semibold"><VsIcon name={state.icon} className="text-2xl" />{state.label}</p>
          </header>
          {card.task?.priority === "URGENT" && <p className="text-base font-bold">Ưu tiên dọn</p>}
          {card.claimedInfo && <p className="break-words text-base text-pretty">Phụ trách: {card.isClaimedByMe ? "Bạn" : card.claimedInfo.staffName}</p>}
          {card.effectiveStatus === "blocked" && card.task?.blockReason && <p className="text-base text-pretty">{card.task.blockReason}</p>}
          {canComplete && (
            <button type="button" onClick={() => void confirmRoomReady(card.room)} disabled={isConfirming} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-base font-semibold text-white whitespace-nowrap hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50">
              <VsIcon name="check_circle" className="text-xl" />{isConfirming ? "Đang lưu…" : "Đánh dấu sạch"}
            </button>
          )}
        </article>
      )}
    </section>
  );
}
