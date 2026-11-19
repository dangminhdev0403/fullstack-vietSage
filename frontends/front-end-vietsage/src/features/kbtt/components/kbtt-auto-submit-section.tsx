"use client";

import { useEffect, useRef, useState } from "react";
import { escapeHtml, showConfirmDialog, showErrorAlert, showSuccessAlert, trustedAlertHtml } from "@/libs/swal";
import { useKbttAutoSubmit } from "../hooks/use-kbtt-auto-submit";
import { KbttAutoSubmitSwitch } from "./kbtt-auto-submit-switch";
import { computeNextVietnamDailySlot, KBTT_FIXED_SCHEDULE_SLOTS } from "../types/kbtt-contract";
import { errorText, formatDateTime } from "./kbtt-connection-format";

function showRunCompletionAlert(run: {
  status: string;
  dryRun: boolean;
  scheduledFor: string;
  successCount: number;
  totalEligible?: number | null;
  totalCount?: number | null;
  failureCount?: number | null;
  failedCount?: number | null;
  unknownCount?: number | null;
  errorMessage?: string | null;
}) {
  const failures = run.failureCount ?? run.failedCount ?? 0;
  const unknown = run.unknownCount ?? 0;
  const isFailed = run.status === "FAILED" || failures > 0;
  const isCancelled = run.status === "CANCELLED";
  const isSkipped = run.status === "SKIPPED";

  const title = isCancelled
    ? "Đã hủy phiên gửi BCA"
    : isSkipped
    ? "Bỏ qua phiên gửi BCA"
    : isFailed
    ? (run.status === "FAILED" ? "Gửi BCA thất bại" : "Gửi BCA hoàn tất (có lỗi)")
    : "Gửi BCA hoàn tất";

  const statusLabel = isCancelled
    ? "Đã hủy"
    : isSkipped
    ? "Bỏ qua"
    : run.status === "FAILED"
    ? "Thất bại"
    : failures > 0
    ? "Hoàn tất (Có lỗi)"
    : "Hoàn tất";

  const html = `
    <div class="space-y-3.5 text-left pt-1">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-2xl border border-emerald-200/90 bg-emerald-50/70 p-3 shadow-2xs">
          <div class="text-xs font-bold text-emerald-800">Thành công</div>
          <div class="mt-1 text-2xl font-black text-emerald-700 tabular-nums">${run.successCount}</div>
        </div>
        <div class="rounded-2xl border ${failures > 0 ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50/80"} p-3 shadow-2xs">
          <div class="text-xs font-bold ${failures > 0 ? "text-rose-800" : "text-slate-500"}">Lỗi</div>
          <div class="mt-1 text-2xl font-black ${failures > 0 ? "text-rose-700" : "text-slate-400"} tabular-nums">${failures}</div>
        </div>
        <div class="rounded-2xl border ${unknown > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50/80"} p-3 shadow-2xs">
          <div class="text-xs font-bold ${unknown > 0 ? "text-amber-800" : "text-slate-500"}">Chưa rõ</div>
          <div class="mt-1 text-2xl font-black ${unknown > 0 ? "text-amber-700" : "text-slate-400"} tabular-nums">${unknown}</div>
        </div>
      </div>
      <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs text-slate-700 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-medium text-slate-500">Chế độ gửi:</span>
          <span class="font-bold text-slate-900">${run.dryRun ? "Chạy thử (Dry-run)" : "Gửi thật lên BCA"}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="font-medium text-slate-500">Trạng thái:</span>
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
            isFailed ? "bg-rose-100 text-rose-800" : isSkipped ? "bg-amber-100 text-amber-800" : isCancelled ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"
          }">${statusLabel}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="font-medium text-slate-500">Thời gian thực hiện:</span>
          <span class="font-mono font-semibold text-slate-800">${formatDateTime(run.scheduledFor)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="font-medium text-slate-500">Tổng hồ sơ:</span>
          <span class="font-bold text-slate-900">${run.totalEligible ?? run.totalCount ?? run.successCount} hồ sơ</span>
        </div>
      </div>
      ${run.errorMessage ? `
        <div class="rounded-2xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-800 leading-relaxed">
          <span class="font-bold text-rose-900">Chi tiết lỗi: </span>${escapeHtml(run.errorMessage)}
        </div>
      ` : ""}
    </div>
  `;

  if (isFailed) {
    return showErrorAlert(title, trustedAlertHtml(html), {
      timer: false,
      confirmButtonText: "Đã hiểu",
    });
  }
  return showSuccessAlert(title, trustedAlertHtml(html), {
    timer: false,
    confirmButtonText: "Đóng",
  });
}

export function KbttAutoSubmitSection({
  hotelId,
  canManage,
  isConnected,
  connectionNextCatchUpAt = null,
  toolsOnly = false,
}: {
  hotelId: string;
  canManage: boolean;
  isConnected: boolean;
  connectionNextCatchUpAt?: string | null;
  toolsOnly?: boolean;
}) {
  const {
    autoSubmit,
    updating,
    testing,
    scheduleAutoSubmit,
    cancelScheduledAutoSubmit,
    scheduling,
    cancellingSchedule,
  } = useKbttAutoSubmit(hotelId);
  const data = autoSubmit.data;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [waitingForRunResult, setWaitingForRunResult] = useState(false);
  const scheduledRunAtRef = useRef<number | null>(null);
  const lastAlertedRunIdRef = useRef<string | null>(null);

  async function scheduleRun(mode: "dry-run" | "live") {
    if (!canManage || isSaving || scheduling || Boolean(data?.pendingSchedule || data?.activeRun)) return;
    if (mode === "live") {
      const confirmed = await showConfirmDialog({
        title: "Hẹn gửi BCA thật?",
        text: "Sau 5 giây hệ thống sẽ gửi các hồ sơ đủ điều kiện của khách sạn này tới BCA.",
        confirmText: "Hẹn gửi BCA",
        cancelText: "Hủy bỏ",
        icon: "warning",
        reverseButtons: false,
      });
      if (!confirmed.isConfirmed) return;
    }
    try {
      scheduledRunAtRef.current = Date.now();
      setWaitingForRunResult(true);
      await scheduleAutoSubmit(mode);
      await autoSubmit.refetch();
    } catch (error) {
      setWaitingForRunResult(false);
      scheduledRunAtRef.current = null;
      await showErrorAlert("Không thể hẹn gửi BCA", errorText(error));
    }
  }

  async function cancelScheduledRun() {
    if (cancellingSchedule) return;
    try {
      setWaitingForRunResult(false);
      scheduledRunAtRef.current = null;
      await cancelScheduledAutoSubmit();
      await autoSubmit.refetch();
    } catch (error) {
      await showErrorAlert("Không thể hủy phiên KBTT", errorText(error));
    }
  }

  const pendingSchedule = data?.pendingSchedule ?? null;
  const activeRun = data?.activeRun ?? null;
  const isRunning = Boolean(activeRun);
  const hasOngoingAction = Boolean(pendingSchedule || isRunning);
  const pendingSeconds = pendingSchedule
    ? Math.max(0, Math.ceil((new Date(pendingSchedule.scheduledFor).getTime() - now) / 1000))
    : 0;

  useEffect(() => {
    if (!waitingForRunResult) return;

    const interval = window.setInterval(() => {
      void autoSubmit.refetch();
    }, 1500);

    if (!hasOngoingAction && data?.recentRuns?.[0] && scheduledRunAtRef.current) {
      const latestRun = data.recentRuns[0];
      const runTime = new Date(latestRun.scheduledFor).getTime();
      if (runTime >= scheduledRunAtRef.current - 5000 && latestRun.status !== "RUNNING") {
        setWaitingForRunResult(false);
        scheduledRunAtRef.current = null;
        if (latestRun.id !== lastAlertedRunIdRef.current) {
          lastAlertedRunIdRef.current = latestRun.id;
          void showRunCompletionAlert(latestRun);
        }
      }
    }

    return () => window.clearInterval(interval);
  }, [waitingForRunResult, hasOngoingAction, data?.recentRuns, autoSubmit]);

  useEffect(() => {
    if (!pendingSchedule || pendingSeconds > 0) return;
    const timer = window.setTimeout(() => void autoSubmit.refetch(), 1000);
    return () => window.clearTimeout(timer);
  }, [pendingSchedule, pendingSeconds, autoSubmit]);

  const isSaving = updating || testing || autoSubmit.isFetching;
  const nextScheduledSlotAt =
    data?.nextScheduledSlotAt ?? computeNextVietnamDailySlot(new Date(now)).scheduledAt;
  const nextCatchUpAt = data?.nextCatchUpAt ?? connectionNextCatchUpAt ?? null;

  return (
    <div className={toolsOnly ? "space-y-3" : "rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 sm:p-5 space-y-4"}>
      {!toolsOnly ? <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <KbttAutoSubmitSwitch hotelId={hotelId} canManage={canManage} isConnected={isConnected} />
        {!isConnected ? (
          <span className="inline-flex items-center whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800">
            Kết nối BCA để gửi hồ sơ tự động
          </span>
        ) : null}
      </div>
      {autoSubmit.isError ? <p className="text-pretty text-sm font-medium text-red-700" role="alert">{errorText(autoSubmit.error)}</p> : null}
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <dt className="text-sm font-medium text-slate-500">Khung giờ gửi tự động cố định</dt>
          <dd className="mt-1 text-base font-bold text-slate-900">
            {KBTT_FIXED_SCHEDULE_SLOTS.join(" và ")}
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <dt className="text-sm font-medium text-slate-500">Phiên định kỳ tiếp theo</dt>
          <dd className="mt-1 text-base font-bold text-slate-900">
            {formatDateTime(nextScheduledSlotAt)}
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <dt className="text-sm font-medium text-slate-500">Gửi bù 10 phút tiếp theo</dt>
          <dd className="mt-1 text-base font-bold text-slate-900">
            {nextCatchUpAt ? formatDateTime(nextCatchUpAt) : "Không có hồ sơ chờ gửi bù"}
          </dd>
        </div>
      </dl>
      </> : null}
      {toolsOnly && autoSubmit.isError ? <p className="text-pretty text-sm font-medium text-red-700" role="alert">{errorText(autoSubmit.error)}</p> : null}
      {toolsOnly ? (
        <>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!isConnected || isSaving || scheduling || hasOngoingAction} onClick={() => void scheduleRun("live")} className="min-h-11 whitespace-nowrap rounded-xl border border-amber-300 bg-amber-50/70 px-3.5 text-base font-medium text-amber-900 shadow-2xs hover:bg-amber-100/70 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Gửi BCA thật sau 5 giây</button>
                </div>
              ) : null}
          {canManage && !isConnected ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm font-medium text-amber-900 shadow-2xs flex items-center gap-2" role="status">
              <span className="text-base" aria-hidden="true">⚠️</span>
              <span>Kết nối BCA để gửi hồ sơ tự động.</span>
            </div>
          ) : null}
          {isRunning ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-3.5 shadow-2xs flex items-center gap-3 text-blue-900" role="status">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600" />
              </span>
              <p className="text-sm font-bold text-blue-900">
                Đang {activeRun?.dryRun ? "chạy thử" : "gửi BCA"}… Vui lòng đợi trong giây lát.
              </p>
            </div>
          ) : null}
          {pendingSchedule && !isRunning ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50/90 p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3" role="status">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-800 text-base" aria-hidden="true">
                  ⏱
                </span>
                <div>
                  <p className="text-sm font-bold text-teal-950">
                    {pendingSchedule.dryRun ? "Chạy thử" : "Gửi BCA"} sau {pendingSeconds} giây.
                  </p>
                  <p className="text-xs text-teal-800">
                    Hệ thống sẽ tự động quét và gửi các hồ sơ đủ điều kiện lên BCA.
                  </p>
                </div>
              </div>
              {canManage ? (
                <button
                  type="button"
                  disabled={cancellingSchedule}
                  onClick={() => void cancelScheduledRun()}
                  className="min-h-11 whitespace-nowrap rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 shadow-2xs"
                >
                  {cancellingSchedule ? "Đang hủy…" : "Hủy hẹn"}
                </button>
              ) : null}
            </div>
          ) : null}
          {!hasOngoingAction && data?.recentRuns?.[0] ? (() => {
            const run = data.recentRuns[0];
            const failures = run.failureCount ?? run.failedCount ?? 0;
            const unknown = run.unknownCount ?? 0;
            const isCompleted = run.status === "COMPLETED";
            const isFailed = run.status === "FAILED" || failures > 0;
            const isSkipped = run.status === "SKIPPED";
            const isCancelled = run.status === "CANCELLED";

            const containerTheme = isFailed
              ? "border-rose-200 bg-rose-50/80 text-rose-950"
              : isSkipped
              ? "border-amber-200 bg-amber-50/80 text-amber-950"
              : isCancelled
              ? "border-slate-200 bg-slate-50/90 text-slate-900"
              : "border-emerald-200 bg-emerald-50/80 text-emerald-950";

            const statusTitle = run.dryRun ? "Chạy thử" : "Gửi BCA";
            const statusLabel = isCancelled
              ? "Đã hủy"
              : isSkipped
              ? "Bỏ qua"
              : run.status === "FAILED"
              ? "Thất bại"
              : failures > 0
              ? "Hoàn tất (có cảnh báo)"
              : "Hoàn tất";

            return (
              <div
                tabIndex={0}
                role="status"
                onClick={() => void showRunCompletionAlert(run)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void showRunCompletionAlert(run);
                  }
                }}
                className={`group/alert cursor-pointer rounded-xl border p-3.5 sm:p-4 shadow-2xs transition-all hover:border-[#003B2A]/40 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B2A] ${containerTheme}`}
                title="Nhấn để xem thông báo chi tiết (SweetAlert2)"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isFailed
                          ? "bg-rose-100 text-rose-700"
                          : isSkipped
                          ? "bg-amber-100 text-amber-700"
                          : isCancelled
                          ? "bg-slate-200 text-slate-700"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                      aria-hidden="true"
                    >
                      {isFailed ? (
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                      ) : isSkipped || isCancelled ? (
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold tracking-tight text-slate-900">
                          {statusTitle}: {statusLabel}
                        </span>
                        {run.scheduledFor ? (
                          <span className="text-xs text-slate-700 font-mono">
                            ({formatDateTime(run.scheduledFor)})
                          </span>
                        ) : null}
                      </div>
                      {run.errorMessage ? (
                        <p className="mt-0.5 text-xs text-rose-700 font-medium">
                          {run.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100/80 px-2.5 py-0.5 text-xs font-bold text-emerald-800 whitespace-nowrap shadow-2xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      {run.successCount} thành công
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap shadow-2xs ${
                        failures > 0
                          ? "border-rose-300 bg-rose-100 text-rose-800"
                          : "border-slate-200 bg-white/80 text-slate-700"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          failures > 0 ? "bg-rose-600" : "bg-slate-500"
                        }`}
                      />
                      {failures} lỗi
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap shadow-2xs ${
                        unknown > 0
                          ? "border-amber-300 bg-amber-100 text-amber-800"
                          : "border-slate-200 bg-white/80 text-slate-700"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          unknown > 0 ? "bg-amber-600" : "bg-slate-500"
                        }`}
                      />
                      {unknown} chưa rõ kết quả
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void showRunCompletionAlert(run);
                      }}
                      className="ml-1 inline-flex items-center gap-1 rounded-lg border border-slate-300/80 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900 transition-colors"
                      title="Mở popup SweetAlert2"
                    >
                      <span>Xem thông báo</span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : null}
          <details className="border-t border-emerald-200/60 pt-2">
            <summary className="min-h-11 cursor-pointer py-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2">Kiểm tra và lịch sử gửi</summary>
            <div className="space-y-4 pt-3">
              {data?.recentRuns && data.recentRuns.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white">
                  <table className="w-full text-sm text-slate-700">
                    <thead className="border-b border-slate-200 bg-slate-50/80 text-sm font-semibold text-slate-600">
                      <tr>
                        <th className="px-3 py-2.5 text-center">Thời gian</th>
                        <th className="px-3 py-2.5 text-center">Trạng thái</th>
                        <th className="px-3 py-2.5 text-center">Tổng</th>
                        <th className="px-3 py-2.5 text-center">Thành công</th>
                        <th className="px-3 py-2.5 text-center">Lỗi / Chưa rõ</th>
                        <th className="px-3 py-2.5 text-left">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recentRuns.map((run) => (
                        <tr key={run.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-xs">{formatDateTime(run.scheduledFor)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap border ${
                              run.status === "COMPLETED" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                              run.status === "RUNNING" ? "bg-blue-50 text-blue-800 border-blue-200 animate-pulse" :
                              run.status === "SKIPPED" ? "bg-amber-50 text-amber-800 border-amber-200" :
                              run.status === "CANCELLED" ? "bg-slate-100 text-slate-700 border-slate-200" :
                              "bg-rose-50 text-rose-800 border-rose-200"
                            }`}>
                              {run.status === "COMPLETED" ? "Hoàn tất" : run.status === "SKIPPED" ? "Bỏ qua" : run.status === "RUNNING" ? "Đang gửi" : run.status === "CANCELLED" ? "Đã hủy" : "Lỗi"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-semibold text-slate-900">{run.totalEligible ?? run.totalCount ?? 0}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-emerald-700">{run.successCount}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-slate-600">
                            {(() => {
                              const count = (run.failureCount ?? run.failedCount ?? 0) + (run.unknownCount ?? 0);
                              return count > 0 ? <span className="text-rose-700 font-bold">{count}</span> : <span className="text-slate-400">0</span>;
                            })()}
                          </td>
                          <td className="min-w-48 break-words px-3 py-2.5 text-left text-xs text-slate-600">{run.errorMessage || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
