"use client";

import { useState } from "react";
import { FaceIdNotificationTest } from "./face-id-notification-test";
import { WorkstationConnectionPanel } from "./workstation-connection-panel";
import { WorkstationTestScanPanel } from "./workstation-test-scan-panel";

export function BiometricOwnerTabs({ hotelId }: { hotelId: string }) {
  const [tab, setTab] = useState<"cccd" | "face-id">("cccd");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Thiết bị nhận diện" className="flex gap-2 border-b border-slate-200">
        <button type="button" role="tab" aria-selected={tab === "cccd"} onClick={() => setTab("cccd")} className={`min-h-11 border-b-2 px-4 text-sm font-bold ${tab === "cccd" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-slate-500"}`}>CCCD</button>
        <button type="button" role="tab" aria-selected={tab === "face-id"} onClick={() => setTab("face-id")} className={`min-h-11 border-b-2 px-4 text-sm font-bold ${tab === "face-id" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-slate-500"}`}>FaceID</button>
      </div>
      {tab === "cccd" ? <><WorkstationConnectionPanel hotelId={hotelId} /><WorkstationTestScanPanel hotelId={hotelId} /></> : <FaceIdNotificationTest hotelId={hotelId} />}
    </div>
  );
}
