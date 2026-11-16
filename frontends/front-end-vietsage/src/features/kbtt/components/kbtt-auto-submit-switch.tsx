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
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-labelledby={labelId}
        aria-checked={isEnabled}
        aria-busy={updating || enabled.isPending}
        disabled={!canManage || updating || unavailable}
        onClick={() => void toggle()}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B2A]/30 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
      >
        <span id={labelId} className="font-bold text-slate-800">Tự động gửi BCA</span>
        <span
          aria-hidden="true"
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
            isEnabled ? "bg-[#003B2A]" : "bg-slate-300"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out mt-0.5 ml-0.5 ${
              isEnabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
        <span className="text-xs text-slate-500 font-medium" aria-live="polite">
          {updating ? "Đang lưu…" : enabled.isPending ? "Đang tải…" : enabled.isError ? "Chưa rõ" : isEnabled ? "Bật" : "Tắt"}
        </span>
      </button>
      {enabled.isError ? (
        <span role="alert" className="text-xs text-rose-700">Lỗi tải tự động gửi</span>
      ) : null}
    </div>
  );
}
