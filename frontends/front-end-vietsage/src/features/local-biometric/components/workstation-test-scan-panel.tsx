"use client";

import { useState } from "react";
import type { IntakePayloadV2 } from "../intake/intake-contract";
import { buildCccdPreviewModel } from "../utils/cccd-preview";
import { CccdCheckInPanel } from "./cccd-check-in-panel";
import { CccdPreview } from "./cccd-preview";

export function WorkstationTestScanPanel({ hotelId }: { hotelId: string }) {
  const [payload, setPayload] = useState<IntakePayloadV2 | null>(null);

  return (
    <section className="space-y-4 rounded-xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm">
      <div>
        <h2 className="vs-display text-xl font-semibold text-[var(--primary)]">Test quét CCCD</h2>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Kết quả chỉ hiển thị tạm thời, không tạo check-in và không lưu vào VietSage.
        </p>
      </div>

      <CccdCheckInPanel hotelId={hotelId} onCapture={(capture) => setPayload(capture?.payload ?? null)} />
      {payload ? <CccdPreview model={buildCccdPreviewModel(payload)} /> : null}
    </section>
  );
}