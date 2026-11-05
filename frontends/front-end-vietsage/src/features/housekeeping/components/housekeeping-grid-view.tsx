"use client";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { HotelRoomSummary, HousekeepingTaskCardModel } from "../types/housekeeping-contract";

type HousekeepingGridViewProps = {
  taskCardsByFloor: Array<[string, HousekeepingTaskCardModel[]]>;
  onConfirmReady: (room: HotelRoomSummary) => Promise<unknown>;
  isConfirming?: boolean;
};

const ROOM_STATES = {
  processing: { label: "Cần dọn", icon: "cleaning_services", style: "border-amber-300 bg-amber-50 text-amber-950" },
  cleaning: { label: "Đang dọn", icon: "cleaning_services", style: "border-blue-300 bg-blue-50 text-blue-950" },
  available: { label: "Sạch", icon: "check_circle", style: "border-emerald-300 bg-emerald-50 text-emerald-950" },
  occupied: { label: "Có khách", icon: "hotel", style: "border-slate-200 bg-white text-slate-700" },
  reserved: { label: "Đã đặt", icon: "event", style: "border-slate-200 bg-white text-slate-700" },
  maintenance: { label: "Bảo trì", icon: "build", style: "border-slate-300 bg-slate-100 text-slate-700" },
  blocked: { label: "Tạm dừng", icon: "pause_circle", style: "border-rose-300 bg-rose-50 text-rose-950" },
} as const;

export function HousekeepingGridView({ taskCardsByFloor, onConfirmReady, isConfirming = false }: HousekeepingGridViewProps) {
  return (
    <div className="space-y-6">
      {taskCardsByFloor.map(([floor, cards]) => (
        <section key={floor} aria-label={floor} className="space-y-3">
          <h2 className="text-lg font-bold text-slate-950 text-balance">{floor}</h2>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {cards.map((card) => {
              const state = ROOM_STATES[card.effectiveStatus];
              const needsCleaning = card.effectiveStatus === "processing" || card.effectiveStatus === "cleaning";
              const assignedToAnother = card.effectiveStatus === "cleaning" && !card.isClaimedByMe;
              const canComplete = needsCleaning && !assignedToAnother;
              return (
                <article key={card.room.id} aria-label={`Phòng ${card.roomNumber}, ${state.label}`} className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-3 ${state.style}`}>
                  <div className="space-y-1">
                    <h3 className="break-words text-xl font-bold text-balance">{card.roomNumber}</h3>
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
