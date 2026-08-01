"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkstationScan } from "../hooks/use-workstation-scan";

export type CccdCheckInCapture = {
  guestDisplayName: string;
  guestIdentityNumber: string;
  guestDateOfBirth?: string;
  guestGender?: string;
  guestNationality?: string;
  guestResidencePlace?: string;
  payload?: import("../intake/intake-contract").IntakePayloadV2;
};

type Props = {
  hotelId: string;
  onCapture: (capture: CccdCheckInCapture | null) => void;
  activeGuestLabel?: string;
  autoRequestScanKey?: string | number;
};

export function CccdCheckInPanel({ hotelId, onCapture, activeGuestLabel, autoRequestScanKey }: Props) {
  const { state, requestScan } = useWorkstationScan(hotelId);
  const [now, setNow] = useState(() => Date.now());
  const emittedTransferId = useRef<string | null>(null);
  const prevScanKeyRef = useRef<string | number | undefined>(autoRequestScanKey);

  useEffect(() => {
    if (state.phase !== "requested") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "received") return;
    const payload = state.payload;
    if (emittedTransferId.current === payload.transferId) return;
    emittedTransferId.current = payload.transferId;
    onCapture({
      guestDisplayName: payload.guest.displayName,
      guestIdentityNumber: payload.guest.identityNumber,
      guestDateOfBirth: payload.guest.dateOfBirth,
      guestGender: payload.guest.gender,
      guestNationality: payload.guest.nationality,
      guestResidencePlace: payload.guest.residencePlace,
      payload,
    });
  }, [onCapture, state]);

  // Continuous auto-scan stream when active guest slot changes
  useEffect(() => {
    if (autoRequestScanKey === undefined) return;
    if (prevScanKeyRef.current !== autoRequestScanKey) {
      prevScanKeyRef.current = autoRequestScanKey;
      emittedTransferId.current = null;
      onCapture(null);
      const online = ["ready", "requested", "receiving", "received", "expired"].includes(state.phase);
      if (online && state.phase !== "requested" && state.phase !== "receiving") {
        requestScan();
      }
    }
  }, [autoRequestScanKey, onCapture, requestScan, state.phase]);

  const timeLeft = state.phase === "requested" ? Math.max(0, Math.ceil((state.expiresAt - now) / 1000)) : 0;
  const online = ["ready", "requested", "receiving", "received", "expired"].includes(state.phase);
  const busy = state.phase === "requested" || state.phase === "receiving";
  const received = state.phase === "received";

  const guestSuffix = activeGuestLabel ? ` (${activeGuestLabel})` : "";

  let title = "Đang kiểm tra máy quét";
  let message = "Vui lòng chờ trong giây lát.";
  if (state.phase === "offline") { title = "Máy quét chưa kết nối"; message = "Cấu hình máy quét tại Dashboard Tiếp Tân rồi quay lại quét."; }
  if (state.phase === "ready") { title = `Máy quét sẵn sàng${guestSuffix}`; message = "Đặt thẻ CCCD lên máy đọc HN-212 để tự động quét."; }
  if (busy) { title = `Đang đọc chip CCCD${guestSuffix}`; message = `Giữ nguyên thẻ trên máy. Còn ${timeLeft} giây.`; }
  if (received) { title = `Đã đọc CCCD${guestSuffix}`; message = "Tự động nạp thông tin vị trí này. Đang chờ thẻ tiếp theo..."; }
  if (state.phase === "expired") { title = `Lượt quét đã hết hạn${guestSuffix}`; message = "Bấm 'Quét CCCD' để bắt đầu lượt quét mới."; }

  const error = state.phase === "error" ? state.message : null;

  return (
    <section className={`rounded-2xl border p-4 md:p-5 ${received ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`} aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-slate-950">{title}</p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{online ? "Đã kết nối" : "Ngoại tuyến"}</span>
          </div>
          <p className="mt-1.5 text-sm leading-6 text-slate-700">{message}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => { onCapture(null); requestScan(); }}
            disabled={!online || busy}
            className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${received ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50" : "bg-blue-700 text-white hover:bg-blue-800"}`}
          >
            {busy ? "Đang chờ CCCD..." : received ? "Quét lại slot này" : "Quét CCCD"}
          </button>
        </div>
      </div>

      {busy ? <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-blue-600" /></div> : null}
      {error ? <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p> : null}
      {state.phase === "expired" ? <p role="alert" className="mt-3 text-sm font-semibold text-amber-800">Lượt quét đã hết hạn. Hãy quét lại.</p> : null}
    </section>
  );
}
