"use client";

import { useState, type FormEvent } from "react";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { getKbttConnectionStatusInfo, useKbttConnection } from "../hooks/use-kbtt-connection";
import { KbttAutoSubmitSection } from "./kbtt-auto-submit-section";
import { connectionErrorText, errorText, formatDateTime } from "./kbtt-connection-format";
import {
  kbttCredentialsSchema,
  type KbttConnection,
} from "../types/kbtt-contract";

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

  async function run(operation: () => Promise<KbttConnection>, successText: string | null, disconnecting = false) {
    try {
      const result = await operation();
      if (disconnecting ? result.configured || result.status !== "DISCONNECTED" : result.status !== "CONNECTED") {
        await showErrorAlert(
          "Kết nối chưa thành công",
          connectionErrorText(result.lastErrorCode, result.lastErrorMessage),
        );
        return;
      }
      if (successText) await showSuccessAlert("Khai báo tạm trú", successText);
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
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs" aria-busy={connection.isFetching || busy}>
        {connection.isPending ? (
          <p className="text-pretty text-base text-slate-600" role="status">Đang tải thông tin kết nối…</p>
        ) : connection.isError ? (
          <div className="space-y-3" role="alert">
            <p className="text-pretty text-base text-red-700">{errorText(connection.error)}</p>
            <button type="button" disabled={connection.isFetching} onClick={() => void connection.refetch()} className="min-h-11 whitespace-nowrap rounded-lg border border-slate-300 px-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Tải lại</button>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {isConfigured && canManageAutoSubmit ? (
              <KbttAutoSubmitSection
                hotelId={hotelId}
                canManage={canManage}
                isConnected={isConnected}
                connectionNextCatchUpAt={data.nextCatchUpAt ?? null}
              />
            ) : null}

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-balance text-base font-bold text-slate-900">Thông tin tài khoản BCA</h2>
                {canManage && isConfigured ? (
                  <div className="flex flex-wrap gap-2.5">
                    <button type="button" disabled={disabled} onClick={() => void run(check, null)} className="min-h-10 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Kiểm tra kết nối</button>
                    <button type="button" disabled={disabled} onClick={() => void confirmDisconnect()} className="min-h-10 whitespace-nowrap rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 shadow-2xs transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50">Ngắt kết nối</button>
                  </div>
                ) : null}
              </div>

              <dl className="grid gap-3 sm:grid-cols-3">
                {([
                  ["Tài khoản", data.username ?? (isConfigured ? "Không đọc được tài khoản" : "Chưa cấu hình")],
                  ["Mã cơ sở lưu trú", data.csltId ?? "Chưa xác định"],
                  ["Kiểm tra gần nhất", data.lastCheckedAt ? formatDateTime(data.lastCheckedAt) : "Chưa kiểm tra"],
                ] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
                    <dt className="text-xs font-medium text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words text-base font-bold text-slate-900 [overflow-wrap:anywhere]">{value}</dd>
                  </div>
                ))}
              </dl>

              {isConnected ? (
                data.providerProfile.state === "READY" && data.providerProfile.accommodation ? (
                  [data.providerProfile.accommodation.name, data.providerProfile.accommodation.address, data.providerProfile.accommodation.managingUnit].some((value) => value?.trim()) ? (
                    <dl className="grid gap-3 pt-1 sm:grid-cols-3">
                      {([
                        ["Tên cơ sở lưu trú", data.providerProfile.accommodation.name],
                        ["Địa chỉ", data.providerProfile.accommodation.address],
                        ["Đơn vị quản lý", data.providerProfile.accommodation.managingUnit],
                      ] as const).filter(([, value]) => value?.trim()).map(([label, value]) => (
                        <div key={label} className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
                          <dt className="text-xs font-medium text-slate-500">{label}</dt>
                          <dd className="mt-1 break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="text-pretty text-sm text-slate-600">BCA chưa cung cấp thông tin cơ sở.</p>
                ) : data.providerProfile.state === "FAILED" ? (
                  <p className="text-pretty text-sm text-amber-800" role="alert">{data.providerProfile.error?.message ?? "Không tải được thông tin cơ sở."}</p>
                ) : <p className="text-pretty text-sm text-slate-600">Kiểm tra kết nối để cập nhật thông tin cơ sở.</p>
              ) : null}

              {connectionStatus.isTemporaryDisconnect ? (
                <p className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3.5 py-2.5 text-pretty text-sm font-medium text-amber-800" role="status">
                  {connectionStatus.message}
                  {data.cooldownUntil ? ` Thời điểm thử lại: ${formatDateTime(data.cooldownUntil)}.` : ""}
                </p>
              ) : data.lastErrorMessage || data.lastErrorCode ? (
                <p className="rounded-lg border border-red-200/80 bg-red-50/70 px-3.5 py-2.5 text-pretty text-sm font-medium text-red-700" role="alert">
                  {connectionErrorText(data.lastErrorCode, data.lastErrorMessage)}
                </p>
              ) : null}
            </div>

            {!isConnected && !connectionStatus.isTemporaryDisconnect ? (
              canManage ? (
                <form onSubmit={(event) => void submit(event)} className="max-w-lg space-y-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs" aria-labelledby="kbtt-account-title" autoComplete="off">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="kbtt-account-title" className="text-balance text-base font-bold text-slate-900">Đăng nhập BCA</h2>
                    {isConfigured ? (
                      <span className="inline-flex items-center whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Ngắt kết nối trước khi đăng nhập lại
                      </span>
                    ) : null}
                  </div>
                  <fieldset disabled={disabled || isConfigured} className="space-y-4">
                    <div>
                      <label htmlFor="kbtt-username" className="mb-1.5 block text-sm font-semibold text-slate-700">Tài khoản cơ sở lưu trú</label>
                      <input id="kbtt-username" name="username" value={username} onChange={(event) => setUsernameEdit(event.target.value)} required maxLength={120} autoComplete="off" autoCapitalize="none" spellCheck={false} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base text-slate-900 shadow-2xs transition-colors hover:border-slate-300 focus:border-[#0f6756] focus:outline-none focus:ring-1 focus:ring-[#0f6756] disabled:bg-slate-100 disabled:text-slate-500" />
                    </div>
                    <div>
                      <label htmlFor="kbtt-password" className="mb-1.5 block text-sm font-semibold text-slate-700">Mật khẩu</label>
                      <div className="relative">
                        <input id="kbtt-password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} autoComplete="new-password" className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-3.5 pr-16 text-base text-slate-900 shadow-2xs transition-colors hover:border-slate-300 focus:border-[#0f6756] focus:outline-none focus:ring-1 focus:ring-[#0f6756] disabled:bg-slate-100 disabled:text-slate-500" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} className="absolute inset-y-0 right-0 min-h-11 whitespace-nowrap px-3.5 text-xs font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2">{showPassword ? "Ẩn" : "Hiện"}</button>
                      </div>
                    </div>
                    <button type="submit" disabled={disabled || isConfigured || !username.trim() || !password} className="min-h-11 whitespace-nowrap rounded-xl bg-[#0f6756] px-5 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-[#0c5245] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{busy ? "Đang kết nối…" : "Đăng nhập"}</button>
                  </fieldset>
                </form>
              ) : <p className="text-pretty text-base text-slate-600">Liên hệ người quản lý khách sạn để cấu hình tài khoản.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
