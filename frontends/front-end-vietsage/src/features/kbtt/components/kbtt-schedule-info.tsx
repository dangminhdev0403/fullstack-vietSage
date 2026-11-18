"use client";

import { useEffect, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { computeNextVietnamDailySlot, KBTT_FIXED_SCHEDULE_SLOTS } from "../types/kbtt-contract";

const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", hour12: false,
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Chưa xác định" : timeFormat.format(date);
}

/** Read-only BCA delivery schedule for front-desk staff. */
export function KbttScheduleInfo({ nextCatchUpAt }: { nextCatchUpAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const items = [
    { icon: "schedule", label: "Giờ gửi BCA tự động", value: KBTT_FIXED_SCHEDULE_SLOTS.join(" · ") },
    { icon: "event", label: "Phiên tiếp theo", value: formatDateTime(computeNextVietnamDailySlot(new Date(now)).scheduledAt) },
    { icon: "history", label: "Gửi bù tiếp theo", value: nextCatchUpAt ? formatDateTime(nextCatchUpAt) : "Không có hồ sơ chờ" },
  ] as const;

  return (
    <dl className="grid overflow-hidden rounded-xl border border-emerald-200/70 bg-emerald-50/50 sm:grid-cols-3 sm:divide-x sm:divide-emerald-200/70 divide-y divide-emerald-200/70 sm:divide-y-0">
      {items.map(({ icon, label, value }) => (
        <div key={label} className="flex min-w-0 items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#003B2A] shadow-2xs ring-1 ring-emerald-200/70">
            <VsIcon name={icon} className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-emerald-900/70">{label}</dt>
            <dd className="truncate text-base font-bold tabular-nums text-slate-900">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
