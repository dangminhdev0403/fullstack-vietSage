"use client";

import { useId } from "react";
import { HttpError } from "@/core/http/http-error";
import { showErrorAlert } from "@/libs/swal";
import { sanitizeErrorMessage, sanitizeProviderDetail } from "../types/kbtt-contract";
import { useKbttAutoSubmitEnabled } from "../hooks/use-kbtt-auto-submit-enabled";

export function KbttAutoSubmitSwitch({ hotelId, canManage, isConnected }: {
  hotelId: string;
  canManage: boolean;
  isConnected: boolean;
}) {
  const labelId = useId();
  const { enabled, updating, setEnabled } = useKbttAutoSubmitEnabled(hotelId);
  const isEnabled = enabled.data?.autoSubmitEnabled ?? false;
  const unavailable = !enabled.isSuccess || (!isEnabled && !isConnected);

  async function toggle() {
    if (!canManage || updating || unavailable) return;
    try {
      await setEnabled(!isEnabled);
    } catch (error) {
      await showErrorAlert("Không thể đổi tự động gửi BCA", sanitizeProviderDetail(error instanceof HttpError ? error.data : null) ?? sanitizeErrorMessage(error instanceof Error ? error.message : null));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span id={labelId} className="text-base font-semibold text-slate-900">Tự động gửi BCA</span>
        <button
          type="button"
          role="switch"
          aria-labelledby={labelId}
          aria-checked={isEnabled}
          aria-busy={updating || enabled.isPending}
          disabled={!canManage || updating || unavailable}
          onClick={() => void toggle()}
          className="inline-flex min-h-11 items-center gap-3 whitespace-nowrap rounded-xl px-2 text-base font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden="true" className={isEnabled ? "relative h-6 w-11 rounded-full bg-emerald-800" : "relative h-6 w-11 rounded-full bg-slate-400"}>
            <span className={isEnabled ? "absolute left-1 top-1 h-4 w-4 translate-x-5 rounded-full bg-white" : "absolute left-1 top-1 h-4 w-4 rounded-full bg-white"} />
          </span>
          <span aria-live="polite">{updating ? "Đang lưu…" : enabled.isPending ? "Đang tải…" : enabled.isError ? "Chưa xác định" : isEnabled ? "Đang bật" : "Đang tắt"}</span>
        </button>
      </div>
      {enabled.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-base text-amber-900">
          <span>Không tải được trạng thái tự động gửi BCA.</span>
          <button type="button" disabled={enabled.isFetching} onClick={() => void enabled.refetch()} className="min-h-11 rounded-lg px-2 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-60">Thử lại</button>
        </div>
      ) : canManage && enabled.isSuccess && !isEnabled && !isConnected ? (
        <p className="text-pretty text-base text-amber-900">Cần kết nối BCA để bật tự động gửi.</p>
      ) : null}
    </div>
  );
}
