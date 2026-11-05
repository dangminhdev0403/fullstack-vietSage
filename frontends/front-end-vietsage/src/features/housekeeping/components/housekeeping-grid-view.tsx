"use client";

import Link from "next/link";
import { HOUSEKEEPING_ROOM_STATES } from "../utils/housekeeping-room-state";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { HotelRoomSummary, HousekeepingTaskCardModel } from "../types/housekeeping-contract";

type HousekeepingGridViewProps = {
  hotelId: string;
  taskCardsByFloor: Array<[string, HousekeepingTaskCardModel[]]>;
  onConfirmReady: (room: HotelRoomSummary) => Promise<unknown>;
  isConfirming?: boolean;
};


export function HousekeepingGridView({ hotelId, taskCardsByFloor, onConfirmReady, isConfirming = false }: HousekeepingGridViewProps) {
  return (
    <div className="space-y-6">
      {taskCardsByFloor.map(([floor, cards]) => (
        <section key={floor} aria-label={floor} className="space-y-3">
          <h2 className="text-lg font-bold text-slate-950 text-balance">{floor}</h2>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {cards.map((card) => {
              const state = HOUSEKEEPING_ROOM_STATES[card.effectiveStatus];
              const needsCleaning = card.effectiveStatus === "processing" || card.effectiveStatus === "cleaning";
              const assignedToAnother = card.effectiveStatus === "cleaning" && !card.isClaimedByMe;
              const canComplete = needsCleaning && !assignedToAnother;
              return (
                <article key={card.room.id} aria-label={`Phòng ${card.roomNumber}, ${state.label}`} className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-3 ${state.style}`}>
                  <div className="space-y-1">
                    <h3 className="break-words text-xl font-bold text-balance"><Link href={`/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(card.room.id)}`} aria-label={`Xem phòng ${card.roomNumber}`} className="inline-flex min-h-11 items-center rounded-md underline decoration-current/40 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{card.roomNumber}</Link></h3>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <VsIcon name={state.icon} className="text-lg" />
                      {state.label}
                    </p>
                  </div>
                  {needsCleaning && card.task?.priority === "URGENT" && (
                    <span className="text-sm font-bold text-amber-950">Ưu tiên dọn</span>
                  )}
                  {assignedToAnother && <p className="break-words text-sm text-pretty">{card.claimedInfo?.staffName || "Nhân viên khác"} đang phụ trách</p>}
                  {card.effectiveStatus === "blocked" && card.task?.blockReason && <p className="break-words text-sm text-pretty">{card.task.blockReason}</p>}
                  {canComplete && (
                    <button
                      type="button"
                      aria-label={`Đánh dấu sạch phòng ${card.roomNumber}`}
                      disabled={isConfirming}
                      onClick={() => void onConfirmReady(card.room)}
                      className="mt-auto min-h-11 w-full rounded-xl bg-emerald-800 px-2 py-2 text-base font-semibold text-white whitespace-nowrap hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50"
                    >Đánh dấu sạch</button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
