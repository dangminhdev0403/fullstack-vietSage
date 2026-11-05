"use client";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { StaffRequestListItem } from "../types/housekeeping-contract";

type HousekeepingGuestRequestsProps = {
  requests: StaffRequestListItem[];
  onClaimRequest: (request: StaffRequestListItem) => Promise<unknown>;
  onCompleteRequest: (request: StaffRequestListItem) => Promise<unknown>;
};

export function HousekeepingGuestRequests({
  requests,
  onClaimRequest,
  onCompleteRequest,
}: HousekeepingGuestRequestsProps) {
  if (requests.length === 0) {
    return null;
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {requests.map((req) => {
        const isUrgent = req.priority === "URGENT";
        const isPending = req.status === "PENDING";
        const isAcknowledged = req.status === "ACKNOWLEDGED";

          return (
            <li
              key={req.id}
              className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${
                isUrgent ? "bg-amber-50/60" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-slate-950">
                    Phòng {req.roomNumber}
                  </span>
                  {isUrgent && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-950 whitespace-nowrap">
                      <VsIcon name="priority_high" className="text-base" />
                      Ưu tiên
                    </span>
                  )}
                  {isAcknowledged && (
                    <span className="text-sm font-medium text-blue-800">
                      Đang xử lý
                    </span>
                  )}
                </div>

                <div className="mt-1 space-y-1">
                  <h3 className="text-base font-semibold text-slate-900 text-balance">
                    {req.displayName}
                  </h3>
                  {req.description && (
                    <p className="text-sm text-slate-600 text-pretty break-words">
                      {req.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {isPending && (
                  <button
                    type="button"
                    onClick={() => void onClaimRequest(req)}
                    aria-label={`Nhận xử lý yêu cầu phòng ${req.roomNumber}`}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-base font-semibold text-white whitespace-nowrap transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:w-auto"
                  >
                    <VsIcon name="play_arrow" className="text-xl" />
                    <span>Nhận xử lý</span>
                  </button>
                )}

                {isAcknowledged && (
                  <button
                    type="button"
                    onClick={() => void onCompleteRequest(req)}
                    aria-label={`Hoàn thành yêu cầu phòng ${req.roomNumber}`}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-base font-semibold text-white whitespace-nowrap transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:w-auto"
                  >
                    <VsIcon name="check_circle" className="text-xl" />
                    <span>Hoàn thành</span>
                  </button>
                )}
              </div>
            </li>
          );
      })}
    </ul>
  );
}
