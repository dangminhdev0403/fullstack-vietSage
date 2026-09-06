"use client";

import { MobileCccdConnectionPanel } from "./mobile-cccd-connection-panel";
import { MobileCccdTestScanPanel } from "./mobile-cccd-test-scan-panel";

export function BiometricOwnerTabs({ hotelId }: { hotelId: string }) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
      <MobileCccdConnectionPanel hotelId={hotelId} />
      <MobileCccdTestScanPanel hotelId={hotelId} />
    </div>
  );
}
