"use client";

import { WorkstationConnectionPanel } from "./workstation-connection-panel";
import { WorkstationTestScanPanel } from "./workstation-test-scan-panel";

export function BiometricOwnerTabs({ hotelId }: { hotelId: string }) {
  return (
    <div className="space-y-6">
      <WorkstationConnectionPanel hotelId={hotelId} />
      <WorkstationTestScanPanel hotelId={hotelId} />
    </div>
  );
}
