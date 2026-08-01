"use client";

import { useState } from "react";
import { useWorkstationScan } from "../hooks/use-workstation-scan";

export function WorkstationConnectionPanel({ hotelId }: { hotelId: string }) {
  const { state, pairCode, createPairing, disconnect } = useWorkstationScan(hotelId);
  const [actionError, setActionError] = useState<string | null>(null);
  const online = ["ready", "requested", "receiving", "received", "expired"].includes(state.phase);

  return (
    <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm" aria-live="polite">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="vs-display text-xl font-semibold text-[var(--primary)]">Kết nối máy quét CCCD</h2>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            {online ? "Máy quét tại quầy đang sẵn sàng." : "Tạo mã một lần, sau đó nhập mã tại trạm HN-212."}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            {online ? "Đã kết nối" : "Ngoại tuyến"}
          </span>
          {online ? (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Hủy kết nối máy quét? Dữ liệu thiết bị và dữ liệu đã quét không bị xóa. Bạn có thể kết nối lại sau.")) return;
                setActionError(null);
                try { await disconnect(); }
                catch (error) { setActionError(error instanceof Error ? error.message : "Không thể hủy kết nối máy quét"); }
              }}
              className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800"
            >
              Hủy kết nối
            </button>
          ) : null}
        </div>
      </div>

      {!online ? (
        <button type="button" onClick={createPairing} className="mt-4 min-h-11 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white">
          Tạo mã ghép nối
        </button>
      ) : null}

      {pairCode ? (
        <div className="mt-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
          <p className="text-xs font-bold text-[var(--on-surface-variant)]">Mã ghép nối một lần</p>
          <code className="mt-2 block break-all text-sm font-bold text-[var(--primary)]">{pairCode}</code>
        </div>
      ) : null}
      {actionError ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{actionError}</p> : null}
    </section>
  );
}