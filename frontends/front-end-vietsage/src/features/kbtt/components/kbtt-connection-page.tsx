"use client";

import { useEffect, useState, type FormEvent } from "react";
import { HttpError } from "@/core/http/http-error";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { getKbttConnectionStatusInfo, useKbttConnection } from "../hooks/use-kbtt-connection";
import { useKbttAutoSubmit } from "../hooks/use-kbtt-auto-submit";
import { KbttAutoSubmitSwitch } from "./kbtt-auto-submit-switch";
import {
  computeNextVietnamDailySlot,
  KBTT_FIXED_SCHEDULE_SLOTS,
  KBTT_SCHEDULE_TIMEZONE,
  kbttCredentialsSchema,
  kbttErrorCode,
  kbttErrorMessage,
  type KbttConnection,
} from "../types/kbtt-contract";

function connectionErrorText(code: string | null | undefined, fallbackMessage?: string | null): string {
  if (code === "KBTT_RETRY_PENDING") {
    return fallbackMessage?.trim() || "Đang thử kết nối lại sau 10 giây.";
  }
  if (code === "KBTT_TEMP_DISCONNECTED") {
    return fallbackMessage?.trim() || "Tạm ngắt kết nối BCA — đang chờ kết nối lại.";
  }
  if (code === "KBTT_SESSION_ENDED" || code === "KBTT_AUTH_FAILED") {
    return fallbackMessage?.trim() || "Cần đăng nhập lại BCA.";
  }
  if (code === "KBTT_FACILITY_CONFLICT") {
    return (
      fallbackMessage?.trim() ||
      "Tài khoản cơ sở BCA này đang được liên kết với một khách sạn khác trên hệ thống."
    );
  }
  if (fallbackMessage?.trim()) return fallbackMessage.trim();
  return kbttErrorMessage(code ?? null);
}

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    const code = kbttErrorCode(error.data);
    if (code) return connectionErrorText(code);
    if (error.status === 400) return "Mã khách sạn hoặc dữ liệu kết nối không hợp lệ.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy khách sạn hoặc bạn không có quyền truy cập.";
    return kbttErrorMessage(kbttErrorCode(error.data));
  }
  return kbttErrorMessage(null);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}:${get("second")} ${get("day")}/${get("month")}/${get("year")}`;
}

export function KbttConnectionPage({
  hotelId,
  canManage,
  canManageAutoSubmit = canManage,
}: {
  hotelId: string;
  canManage: boolean;
  canManageAutoSubmit?: boolean;
}) {
  const { connection, busy, connect, check, disconnect } = useKbttConnection(hotelId);
  const [usernameEdit, setUsernameEdit] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const data = connection.data;
  const isConnected = connection.isSuccess && data?.status === "CONNECTED";
  const isConfigured = Boolean(data?.configured);
  const disabled = busy || confirming || connection.isFetching;

  const username = usernameEdit ?? data?.username ?? "";

  async function run(operation: () => Promise<KbttConnection>, successText: string, disconnecting = false) {
    try {
      const result = await operation();
      if (disconnecting ? result.configured || result.status !== "DISCONNECTED" : result.status !== "CONNECTED") {
        await showErrorAlert(
          "Kết nối chưa thành công",
          connectionErrorText(result.lastErrorCode, result.lastErrorMessage),
        );
        return;
      }
      await showSuccessAlert("Khai báo tạm trú", successText);
    } catch (error) {
      await connection.refetch();
      await showErrorAlert("Không thể hoàn tất thao tác", errorText(error));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || disabled || isConfigured) return;
    const parsed = kbttCredentialsSchema.safeParse({ username, password });
    if (!parsed.success) {
      await showErrorAlert("Thông tin chưa hợp lệ", "Nhập tài khoản tối đa 120 ký tự và mật khẩu tối đa 256 ký tự.");
      return;
    }

    const confirmResult = await showConfirmDialog({
      title: "Xác nhận kết nối tài khoản Cổng BCA?",
      text: `Kết nối tài khoản "${parsed.data.username}" với Cổng dịch vụ công Bộ Công an để đồng bộ khai báo lưu trú tự động?`,
      confirmText: "Kết nối tài khoản",
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });
    if (!confirmResult.isConfirmed) return;

    setPassword("");
    await run(() => connect(parsed.data), "Đã kết nối tài khoản khai báo tạm trú của khách sạn.");
  }

  async function confirmDisconnect() {
    if (!canManage || disabled) return;
    setConfirming(true);
    try {
      const result = await showConfirmDialog({
        title: "Ngắt kết nối khai báo tạm trú?",
        text: "Tài khoản đã lưu của khách sạn sẽ bị xóa. Bạn cần nhập lại tài khoản và mật khẩu để kết nối lại.",
        confirmText: "Ngắt kết nối",
        cancelText: "Hủy bỏ",
        reverseButtons: false,
      });
      if (!result.isConfirmed) return;
      setUsernameEdit("");
      setPassword("");
      await run(disconnect, "Đã ngắt kết nối và xóa tài khoản đã lưu.", true);
    } finally {
      setConfirming(false);
    }
  }

  const connectionStatus = getKbttConnectionStatusInfo(data);

  const statusBadge = connection.isPending || connection.isError || !data ? (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-3.5 py-1 text-sm font-bold text-slate-700">
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      {connection.isPending ? "Đang tải trạng thái" : "Chưa xác định kết nối"}
    </span>
  ) : isConnected ? (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-sm font-bold text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      Đã kết nối
    </span>
  ) : connectionStatus.isRetryPending ? (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1 text-sm font-bold text-amber-800">
      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
      Đang thử kết nối lại sau 10 giây
    </span>
  ) : connectionStatus.isTemporaryDisconnect ? (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1 text-sm font-bold text-amber-800">
      <span className="h-2 w-2 rounded-full bg-amber-500" />
      Tạm ngắt kết nối BCA — đang chờ kết nối lại
    </span>
  ) : connectionStatus.isFacilityConflict ? (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-3.5 py-1 text-sm font-bold text-red-700">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      {connectionStatus.badgeLabel}
    </span>
  ) : connectionStatus.isLoginRequired ? (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-3.5 py-1 text-sm font-bold text-red-700">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      Cần đăng nhập lại BCA
    </span>
  ) : data?.configured ? (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-3.5 py-1 text-sm font-bold text-slate-700">
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      Đã ngắt kết nối
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-3.5 py-1 text-sm font-bold text-slate-700">
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      Chưa kết nối
    </span>
  );

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 text-slate-900" aria-labelledby="kbtt-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="kbtt-title" className="text-balance text-xl font-bold text-[#0f6756]">Cổng dịch vụ công Bộ Công an</h1>
        {statusBadge}
      </header>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-busy={connection.isFetching || busy}>
        {connection.isPending ? (
          <p className="text-pretty text-base text-slate-600" role="status">Đang tải thông tin kết nối…</p>
        ) : connection.isError ? (
          <div className="space-y-3" role="alert">
            <p className="text-pretty text-base text-red-700">{errorText(connection.error)}</p>
            <button type="button" disabled={connection.isFetching} onClick={() => void connection.refetch()} className="min-h-11 whitespace-nowrap rounded-lg border border-slate-300 px-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Tải lại</button>
          </div>
        ) : data ? (
          <div className="space-y-5">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
              {([
                ["Tài khoản", data.username ?? (isConfigured ? "Không đọc được tài khoản" : "Chưa cấu hình")],
                ["Mã cơ sở lưu trú", data.csltId ?? "Chưa xác định"],
                ["Kiểm tra gần nhất", data.lastCheckedAt ? formatDateTime(data.lastCheckedAt) : "Chưa kiểm tra"],
              ] as const).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-sm text-slate-600">{label}</dt>
                  <dd className="mt-1 break-words text-base font-semibold [overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
            {isConnected ? (
              data.providerProfile.state === "READY" && data.providerProfile.accommodation ? (
                [data.providerProfile.accommodation.name, data.providerProfile.accommodation.address, data.providerProfile.accommodation.managingUnit].some((value) => value?.trim()) ? (
                  <dl className="grid gap-x-8 gap-y-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                    {([
                      ["Tên cơ sở lưu trú", data.providerProfile.accommodation.name],
                      ["Địa chỉ", data.providerProfile.accommodation.address],
                      ["Đơn vị quản lý", data.providerProfile.accommodation.managingUnit],
                    ] as const).filter(([, value]) => value?.trim()).map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-sm text-slate-600">{label}</dt>
                        <dd className="mt-1 break-words text-base font-semibold [overflow-wrap:anywhere]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="text-pretty text-base text-slate-600">BCA chưa cung cấp thông tin cơ sở.</p>
              ) : data.providerProfile.state === "FAILED" ? (
                <p className="text-pretty text-base text-amber-800" role="alert">{data.providerProfile.error?.message ?? "Không tải được thông tin cơ sở."}</p>
              ) : <p className="text-pretty text-base text-slate-600">Kiểm tra kết nối để cập nhật thông tin cơ sở.</p>
            ) : null}
            {connectionStatus.isTemporaryDisconnect ? (
              <p className="text-pretty text-base text-amber-800" role="status">
                {connectionStatus.message}
                {data.cooldownUntil ? ` Thời điểm thử lại: ${formatDateTime(data.cooldownUntil)}.` : ""}
              </p>
            ) : data.lastErrorMessage || data.lastErrorCode ? (
              <p className="text-pretty text-base text-red-700" role="alert">
                {connectionErrorText(data.lastErrorCode, data.lastErrorMessage)}
              </p>
            ) : null}
            {canManage && isConfigured ? (
              <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
                <button type="button" disabled={disabled} onClick={() => void run(check, "Đã kiểm tra kết nối thành công.")} className="min-h-11 whitespace-nowrap rounded-lg border border-slate-300 px-4 text-base font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Kiểm tra kết nối</button>
                <button type="button" disabled={disabled} onClick={() => void confirmDisconnect()} className="min-h-11 whitespace-nowrap rounded-lg border border-red-200 px-4 text-base font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50">Ngắt kết nối</button>
              </div>
            ) : null}
            {!isConnected && !connectionStatus.isTemporaryDisconnect ? (
              canManage ? (
                <form onSubmit={(event) => void submit(event)} className="max-w-lg space-y-4 border-t border-slate-100 pt-5" aria-labelledby="kbtt-account-title" autoComplete="off">
                  <h2 id="kbtt-account-title" className="text-balance text-lg font-bold">Đăng nhập BCA</h2>
                  {isConfigured ? <p className="text-pretty text-base text-amber-800">Ngắt kết nối trước khi đăng nhập lại.</p> : null}
                  <fieldset disabled={disabled || isConfigured} className="space-y-4">
                    <div>
                      <label htmlFor="kbtt-username" className="mb-1.5 block text-base font-medium">Tài khoản cơ sở lưu trú</label>
                      <input id="kbtt-username" name="username" value={username} onChange={(event) => setUsernameEdit(event.target.value)} required maxLength={120} autoComplete="off" autoCapitalize="none" spellCheck={false} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-slate-100" />
                    </div>
                    <div>
                      <label htmlFor="kbtt-password" className="mb-1.5 block text-base font-medium">Mật khẩu</label>
                      <div className="relative">
                        <input id="kbtt-password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} autoComplete="new-password" className="min-h-11 w-full rounded-lg border border-slate-300 pl-3 pr-16 text-base focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-slate-100" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} className="absolute inset-y-0 right-0 min-h-11 whitespace-nowrap px-3 text-sm font-medium text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2">{showPassword ? "Ẩn" : "Hiện"}</button>
                      </div>
                    </div>
                    <button type="submit" disabled={disabled || isConfigured || !username.trim() || !password} className="min-h-11 whitespace-nowrap rounded-lg bg-[#0f6756] px-5 text-base font-semibold text-white hover:bg-[#0c5245] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{busy ? "Đang kết nối…" : "Đăng nhập"}</button>
                  </fieldset>
                </form>
              ) : <p className="text-pretty text-base text-slate-600">Liên hệ người quản lý khách sạn để cấu hình tài khoản.</p>
            ) : null}
          </div>
        ) : null}
        {connection.isSuccess && data && isConfigured && canManageAutoSubmit ? (
          <KbttAutoSubmitSection
            hotelId={hotelId}
            canManage={canManage}
            isConnected={isConnected}
            connectionNextCatchUpAt={data.nextCatchUpAt ?? null}
          />
        ) : null}
      </div>
    </section>
  );
}

function KbttAutoSubmitSection({
  hotelId,
  canManage,
  isConnected,
  connectionNextCatchUpAt,
}: {
  hotelId: string;
  canManage: boolean;
  isConnected: boolean;
  connectionNextCatchUpAt: string | null;
}) {
  const {
    autoSubmit,
    updating,
    testing,
    testingTelegram,
    testDryRun,
    testTelegram,
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

  async function scheduleRun(mode: "dry-run" | "live") {
    if (!canManage || isSaving || scheduling || Boolean(data?.pendingSchedule || data?.activeRun)) return;
    if (mode === "live") {
      const confirmed = await showConfirmDialog({
        title: "Hẹn chạy Live + Telegram?",
        text: "Sau 15 giây hệ thống sẽ gửi hồ sơ thật tới C06 và gửi báo cáo Telegram.",
        confirmText: "Hẹn Live",
        cancelText: "Hủy bỏ",
        icon: "warning",
        reverseButtons: false,
      });
      if (!confirmed.isConfirmed) return;
    }
    try {
      await scheduleAutoSubmit(mode);
      await autoSubmit.refetch();
    } catch (error) {
      await showErrorAlert("Không thể hẹn phiên KBTT", errorText(error));
    }
  }

  async function cancelScheduledRun() {
    if (cancellingSchedule) return;
    try {
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
    if (!pendingSchedule || pendingSeconds > 0) return;
    const timer = window.setTimeout(() => void autoSubmit.refetch(), 1000);
    return () => window.clearTimeout(timer);
  }, [pendingSchedule, pendingSeconds, autoSubmit]);

  const isSaving = updating || testing || autoSubmit.isFetching;
  const nextScheduledSlotAt =
    data?.nextScheduledSlotAt ?? computeNextVietnamDailySlot(new Date(now)).scheduledAt;
  const nextCatchUpAt = data?.nextCatchUpAt ?? connectionNextCatchUpAt ?? null;

  async function handleTestDryRun() {
    if (!canManage || isSaving) return;
    try {
      const run = await testDryRun(true);
      const total = run.totalEligible ?? run.totalCount ?? 0;
      const failed = (run.failureCount ?? run.failedCount ?? 0) + (run.unknownCount ?? 0);
      await showSuccessAlert(
        "Chạy thử nghiệm hoàn tất",
        `Tổng hồ sơ đủ điều kiện: ${total}\nThành công giả lập: ${run.successCount}\nLỗi/Timeout: ${failed}`,
      );
    } catch (error) {
      await autoSubmit.refetch();
      await showErrorAlert("Thử nghiệm thất bại", errorText(error));
    }
  }

  async function handleTelegramTest() {
    if (!canManage || isSaving || testingTelegram) return;
    try {
      await testTelegram();
      await showSuccessAlert("Telegram hoạt động", "Đã gửi thông báo thử tới nhóm nhận báo cáo KBTT.");
    } catch (error) {
      await showErrorAlert("Không thể gửi Telegram thử", errorText(error));
    }
  }

  return (
    <div className="mt-6 space-y-4 border-t border-slate-200 pt-5">
      <KbttAutoSubmitSwitch hotelId={hotelId} canManage={canManage} isConnected={isConnected} />
      {autoSubmit.isError ? <p className="text-pretty text-base text-red-700" role="alert">{errorText(autoSubmit.error)}</p> : null}
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-sm text-slate-600">Khung giờ gửi tự động cố định</dt>
          <dd className="mt-1 text-base font-semibold text-slate-900">
            {KBTT_FIXED_SCHEDULE_SLOTS.join(" và ")} ({KBTT_SCHEDULE_TIMEZONE})
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-slate-600">Phiên định kỳ tiếp theo</dt>
          <dd className="mt-1 text-base font-semibold text-slate-900">
            {formatDateTime(nextScheduledSlotAt)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-slate-600">Gửi bù 10 phút tiếp theo</dt>
          <dd className="mt-1 text-base font-semibold text-slate-900">
            {nextCatchUpAt ? formatDateTime(nextCatchUpAt) : "Không có hồ sơ chờ gửi bù"}
          </dd>
        </div>
      </dl>
      {!isConnected ? (
        <p className="text-pretty text-base text-amber-800">Kết nối BCA để gửi hồ sơ tự động.</p>
      ) : (
        <>
          {isRunning ? <p className="text-pretty text-base text-blue-800" role="status">Đang {activeRun?.dryRun ? "chạy thử" : "gửi BCA và báo cáo Telegram"}…</p> : null}
          {pendingSchedule && !isRunning ? (
            <div className="flex flex-wrap items-center gap-3" role="status">
              <p className="text-pretty text-base text-teal-800">{pendingSchedule.dryRun ? "Chạy thử" : "Gửi BCA và báo cáo Telegram"} sau {pendingSeconds} giây.</p>
              {canManage ? <button type="button" disabled={cancellingSchedule} onClick={() => void cancelScheduledRun()} className="min-h-11 whitespace-nowrap rounded-lg border border-red-200 px-4 text-base font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{cancellingSchedule ? "Đang hủy…" : "Hủy hẹn"}</button> : null}
            </div>
          ) : null}
          <details className="border-t border-slate-100 pt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2">Kiểm tra và lịch sử gửi</summary>
            <div className="space-y-4 pt-2">
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={isSaving || hasOngoingAction} onClick={() => void handleTestDryRun()} className="min-h-11 whitespace-nowrap rounded-lg border border-slate-300 px-3 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{testing ? "Đang chạy thử…" : "Chạy thử không gửi BCA"}</button>
                  <button type="button" disabled={isSaving || testingTelegram || hasOngoingAction} onClick={() => void handleTelegramTest()} className="min-h-11 whitespace-nowrap rounded-lg border border-slate-300 px-3 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{testingTelegram ? "Đang gửi…" : "Thử Telegram"}</button>
                  <button type="button" disabled={isSaving || hasOngoingAction} onClick={() => void scheduleRun("dry-run")} className="min-h-11 whitespace-nowrap rounded-lg border border-slate-300 px-3 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Hẹn chạy thử sau 15 giây</button>
                  <button type="button" disabled={isSaving || hasOngoingAction} onClick={() => void scheduleRun("live")} className="min-h-11 whitespace-nowrap rounded-lg border border-amber-300 px-3 text-base font-medium text-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Hẹn gửi BCA thật sau 15 giây</button>
                </div>
              ) : null}
              {data?.recentRuns && data.recentRuns.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-base text-slate-700">
                    <thead className="border-b border-slate-200 text-sm text-slate-600">
                      <tr><th className="px-3 py-2">Thời gian</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Tổng</th><th className="px-3 py-2">Thành công</th><th className="px-3 py-2">Lỗi / Chưa rõ</th><th className="px-3 py-2">Ghi chú</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recentRuns.map((run) => (
                        <tr key={run.id}>
                          <td className="whitespace-nowrap px-3 py-3">{formatDateTime(run.scheduledFor)}</td>
                          <td className="whitespace-nowrap px-3 py-3">{run.status === "COMPLETED" ? "Hoàn tất" : run.status === "SKIPPED" ? "Bỏ qua" : run.status === "RUNNING" ? "Đang gửi" : "Lỗi"}</td>
                          <td className="px-3 py-3">{run.totalEligible ?? run.totalCount ?? 0}</td>
                          <td className="px-3 py-3">{run.successCount}</td>
                          <td className="px-3 py-3">{(run.failureCount ?? run.failedCount ?? 0) + (run.unknownCount ?? 0)}</td>
                          <td className="min-w-48 break-words px-3 py-3">{run.errorMessage || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
