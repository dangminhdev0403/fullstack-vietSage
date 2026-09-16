"use client";

import { useEffect, useState, type FormEvent } from "react";
import { HttpError } from "@/core/http/http-error";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useKbttConnection } from "../hooks/use-kbtt-connection";
import { useKbttAutoSubmit } from "../hooks/use-kbtt-auto-submit";
import { kbttCredentialsSchema, kbttErrorCode, kbttErrorMessage, type KbttConnection } from "../types/kbtt-contract";

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    const code = kbttErrorCode(error.data);
    if (code) return kbttErrorMessage(code);
    if (error.status === 400) return "Mã khách sạn hoặc dữ liệu kết nối không hợp lệ.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy khách sạn hoặc bạn không có quyền truy cập.";
    return kbttErrorMessage(kbttErrorCode(error.data));
  }
  return kbttErrorMessage(null);
}

function formatDateTime(value: string | null): string {
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

export function KbttConnectionPage({ hotelId, canManage }: { hotelId: string; canManage: boolean }) {
  const { connection, busy, connect, check, disconnect } = useKbttConnection(hotelId);
  const [usernameEdit, setUsernameEdit] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const data = connection.data;
  const isConnected = data?.status === "CONNECTED";
  const isConfigured = Boolean(data?.configured);
  const disabled = busy || confirming || connection.isFetching;

  const username = usernameEdit ??
    (data?.maskedUsername && data.maskedUsername !== "••••••" ? data.maskedUsername : "");

  async function copyToClipboard(text: string | null | undefined, field: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback silent
    }
  }

  async function run(operation: () => Promise<KbttConnection>, successText: string, disconnecting = false) {
    try {
      const result = await operation();
      if (disconnecting ? result.configured || result.status !== "DISCONNECTED" : result.status !== "CONNECTED") {
        await showErrorAlert("Kết nối chưa thành công", kbttErrorMessage(result.lastErrorCode));
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
      });
      if (!result.isConfirmed) return;
      setUsernameEdit("");
      setPassword("");
      await run(disconnect, "Đã ngắt kết nối và xóa tài khoản đã lưu.", true);
    } finally {
      setConfirming(false);
    }
  }

  const isAuthFailed = data?.status === "AUTH_FAILED";

  const statusBadge = isConnected ? (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-sm font-bold text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      Đã kết nối trực tuyến
    </span>
  ) : isAuthFailed ? (
    <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3.5 py-1 text-sm font-bold text-red-700">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      Cần đăng nhập lại
    </span>
  ) : data?.configured ? (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3.5 py-1 text-sm font-bold text-slate-700">
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      Đã ngắt kết nối
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3.5 py-1 text-sm font-bold text-slate-700">
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      Chưa kết nối
    </span>
  );

  const statusSubtext = isConnected
    ? "Hệ thống hoạt động ổn định"
    : isAuthFailed
      ? "Tài khoản hoặc mật khẩu không chính xác"
      : data?.configured
        ? "Đã ngắt kết nối tài khoản"
        : "Chưa cấu hình tài khoản khai báo";

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 text-slate-900" aria-labelledby="kbtt-title">
      {/* Top Header & Connection Status Header Card */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <header className="space-y-1.5 shrink-0">
          <h1 id="kbtt-title" className="whitespace-nowrap text-base font-extrabold tracking-wide text-[#0f6756] sm:text-lg lg:text-xl">
            CỔNG DỊCH VỤ CÔNG • BỘ CÔNG AN
          </h1>
          <div className="h-1 w-10 rounded-full bg-[#0f6756]" />
        </header>

        {/* Top Right Status Card */}
        <div className="flex shrink-0 items-center gap-3.5 rounded-2xl border border-slate-100 bg-white px-5 py-3.5 shadow-sm">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-900 sm:text-base">Trạng thái kết nối</span>
              {statusBadge}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{statusSubtext}</p>
          </div>
        </div>
      </div>

      {/* Main Card Container */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8" aria-busy={connection.isFetching || busy}>
        {connection.isPending ? (
          <div className="space-y-6 animate-pulse py-12 text-center" role="status">
            <div className="mx-auto h-10 w-10 rounded-full border-3 border-emerald-600 border-t-transparent animate-spin" />
            <p className="text-base font-medium text-slate-600">Đang tải thông tin kết nối khai báo tạm trú…</p>
          </div>
        ) : connection.isError ? (
          <div className="space-y-4 py-10 text-center" role="alert">
            <p className="text-lg font-bold text-red-700">{errorText(connection.error)}</p>
            <button
              type="button"
              disabled={connection.isFetching}
              onClick={() => void connection.refetch()}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:opacity-50"
            >
              Tải lại trạng thái
            </button>
          </div>
        ) : data ? (
          <div className="space-y-8">
            {/* 4 Stat Cards Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4">
              {/* Stat 1: Tài khoản đăng nhập */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-500">Tài khoản đăng nhập</p>
                  <div className="mt-0.5 flex items-center justify-between gap-1.5">
                    <span className="text-sm font-bold text-slate-900 break-all sm:text-base">
                      {data.maskedUsername ?? "Chưa cấu hình"}
                    </span>
                    {data.maskedUsername ? (
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(data.maskedUsername, "username")}
                        title="Sao chép tài khoản"
                        aria-label="Sao chép tài khoản đăng nhập"
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors shrink-0"
                      >
                        {copiedField === "username" ? (
                          <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Stat 2: Mã cơ sở lưu trú */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-500">Mã cơ sở lưu trú</p>
                  <div className="mt-0.5 flex items-center justify-between gap-1.5">
                    <span className="text-sm font-bold text-slate-900 sm:text-base">
                      {data.csltId ?? "Chưa xác định"}
                    </span>
                    {data.csltId ? (
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(data.csltId, "csltId")}
                        title="Sao chép mã cơ sở lưu trú"
                        aria-label="Sao chép mã cơ sở lưu trú"
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors shrink-0"
                      >
                        {copiedField === "csltId" ? (
                          <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Stat 3: Kiểm tra gần nhất */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-500">Kiểm tra gần nhất</p>
                  <p className="mt-0.5 text-xs font-bold text-slate-900 whitespace-nowrap sm:text-sm">
                    {data.lastCheckedAt ? formatDateTime(data.lastCheckedAt) : "Chưa kiểm tra"}
                  </p>
                </div>
              </div>

              {/* Stat 4: Kết nối thành công */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-500">Kết nối thành công</p>
                  <p className="mt-0.5 text-xs font-bold text-slate-900 whitespace-nowrap sm:text-sm">
                    {data.lastConnectedAt ? formatDateTime(data.lastConnectedAt) : "Chưa kết nối"}
                  </p>
                </div>
              </div>
            </div>

            {/* Alert banner if error exists */}
            {data.lastErrorMessage || data.lastErrorCode ? (
              <div className="flex items-start gap-3.5 rounded-2xl border border-red-200 bg-red-50 p-5 text-base text-red-800" role="alert">
                <svg className="mt-0.5 h-6 w-6 shrink-0 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-bold text-lg">Thông báo từ hệ thống khai báo</p>
                  <p className="mt-1 text-red-700">{kbttErrorMessage(data.lastErrorCode) || data.lastErrorMessage}</p>
                </div>
              </div>
            ) : null}

            <hr className="border-t border-slate-100" />

            {/* Form & Actions Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <div>
                  <h2 id="kbtt-account-title" className="text-xl font-black text-slate-900 sm:text-2xl">
                    Đăng nhập tài khoản Bộ Công an
                  </h2>
                  <p id="kbtt-credentials-help" className="mt-1 text-sm text-slate-600 sm:text-base">
                    {isConfigured
                      ? "Tài khoản đang được kết nối. Bạn cần ngắt kết nối trước khi có thể đăng nhập tài khoản khác."
                      : "Nhập thông tin tài khoản cơ sở lưu trú để kết nối dịch vụ."}
                  </p>
                </div>
              </div>

              {/* Warning and actions (Kiểm tra kết nối + Ngắt kết nối) */}
              {canManage && isConfigured ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-slate-800 shadow-sm">
                  <div className="flex items-start gap-3">
                    <svg className="h-6 w-6 shrink-0 text-amber-600 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-base font-bold text-amber-950">Tài khoản đang hoạt động</p>
                      <p className="mt-0.5 text-sm text-amber-800">
                        Theo yêu cầu bảo mật, bạn phải <strong>ngắt kết nối</strong> trước khi có thể nhập tài khoản mới.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void run(check, "Đã kiểm tra kết nối thành công.")}
                      className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Kiểm tra kết nối
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void confirmDisconnect()}
                      className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Ngắt kết nối
                    </button>
                  </div>
                </div>
              ) : null}

              {canManage ? (
                <form onSubmit={(event) => void submit(event)} className="space-y-5" aria-labelledby="kbtt-account-title" autoComplete="off">
                  <fieldset disabled={disabled || isConfigured} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    {/* Field 1: Username (không viết tắt) */}
                    <div>
                      <label htmlFor="kbtt-username" className="mb-2 block text-base font-bold text-slate-800">
                        Tài khoản cơ sở lưu trú
                      </label>
                      <div className="relative flex items-center">
                        <svg className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <input
                          id="kbtt-username"
                          name="username"
                          type="text"
                          value={username}
                          onChange={(event) => setUsernameEdit(event.target.value)}
                          required
                          maxLength={120}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder={data.maskedUsername || "Nhập tài khoản cơ sở lưu trú"}
                          aria-describedby="kbtt-credentials-help"
                          className="min-h-[52px] w-full rounded-xl border border-slate-200 bg-white py-3 pr-4 pl-12 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0f6756] focus:outline-none focus:ring-2 focus:ring-[#0f6756]/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>
                    </div>

                    {/* Field 2: Password (không viết tắt) */}
                    <div>
                      <label htmlFor="kbtt-password" className="mb-2 block text-base font-bold text-slate-800">
                        Mật khẩu cơ sở lưu trú
                      </label>
                      <div className="relative flex items-center">
                        <svg className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <input
                          id="kbtt-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          maxLength={256}
                          autoComplete="new-password"
                          placeholder="••••••••••••"
                          aria-describedby="kbtt-credentials-help"
                          className="min-h-[52px] w-full rounded-xl border border-slate-200 bg-white py-3 pr-12 pl-12 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0f6756] focus:outline-none focus:ring-2 focus:ring-[#0f6756]/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                        <button
                          type="button"
                          disabled={isConfigured}
                          onClick={() => setShowPassword(!showPassword)}
                          title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                          aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                          className="absolute right-3.5 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none disabled:opacity-40"
                        >
                          {showPassword ? (
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </fieldset>

                  {/* Submit Button (Disabled if already configured/connected) */}
                  <button
                    type="submit"
                    disabled={disabled || isConfigured || !username.trim() || !password}
                    className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#0f6756] px-6 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#0c5245] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f6756] disabled:cursor-not-allowed disabled:opacity-50 sm:text-lg"
                  >
                    {busy ? (
                      <>
                        <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>Đang xử lý…</span>
                      </>
                    ) : isConfigured ? (
                      <span>Vui lòng ngắt kết nối để thao tác</span>
                    ) : (
                      <>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        <span>Đăng nhập tài khoản Bộ Công an</span>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <p className="rounded-xl bg-slate-50 p-5 text-base text-slate-600">
                  Bạn có quyền xem trạng thái kết nối. Liên hệ người quản lý khách sạn để cấu hình tài khoản.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {data && isConfigured ? (
          <KbttAutoSubmitSection hotelId={hotelId} canManage={canManage} isConnected={isConnected} />
        ) : null}
      </div>
    </section>
  );
}

function KbttAutoSubmitSection({
  hotelId,
  canManage,
  isConnected,
}: {
  hotelId: string;
  canManage: boolean;
  isConnected: boolean;
}) {
  const {
    autoSubmit,
    updating,
    testing,
    testingTelegram,
    updateConfig,
    testDryRun,
    testTelegram,
    scheduleAutoSubmit,
    cancelScheduledAutoSubmit,
    scheduling,
    cancellingSchedule,
  } = useKbttAutoSubmit(hotelId);
  const data = autoSubmit.data;

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function scheduleRun(mode: "dry-run" | "live") {
    if (!canManage || isSaving || scheduling || data?.pendingSchedule) return;
    if (mode === "live") {
      const confirmed = await showConfirmDialog({
        title: "Hẹn chạy Live + Telegram?",
        text: "Sau 15 giây hệ thống sẽ gửi hồ sơ thật tới C06 và gửi báo cáo Telegram.",
        confirmText: "Hẹn Live",
        cancelText: "Hủy",
        icon: "warning",
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

  const isEnabled = enabled ?? (data?.autoSubmitEnabled ?? false);
  const currentTime = time ?? (data?.autoSubmitTime ?? "04:30");
  const pendingSchedule = data?.pendingSchedule ?? null;
  const pendingSeconds = pendingSchedule
    ? Math.max(0, Math.ceil((new Date(pendingSchedule.scheduledFor).getTime() - now) / 1000))
    : 0;

  useEffect(() => {
    if (!pendingSchedule || pendingSeconds > 0) return;
    const timer = window.setTimeout(() => void autoSubmit.refetch(), 1000);
    return () => window.clearTimeout(timer);
  }, [pendingSchedule, pendingSeconds, autoSubmit]);

  const isSaving = updating || testing || autoSubmit.isFetching;

  async function handleSaveConfig() {
    if (!canManage || isSaving) return;
    try {
      await updateConfig({
        autoSubmitEnabled: isEnabled,
        autoSubmitTime: isEnabled ? currentTime : null,
      });
      await showSuccessAlert(
        "Lịch nộp tự động",
        `Đã lưu cấu hình: ${isEnabled ? `Tự động nộp lúc ${currentTime} hàng ngày.` : "Đã tắt tự động nộp."}`,
      );
    } catch (error) {
      await autoSubmit.refetch();
      await showErrorAlert("Không thể lưu cấu hình", errorText(error));
    }
  }

  async function handleTestDryRun() {
    if (!canManage || isSaving) return;
    try {
      const run = await testDryRun(true);
      const total = run.totalEligible ?? run.totalCount ?? 0;
      const failed = (run.failureCount ?? run.failedCount ?? 0) + (run.unknownCount ?? 0);
      await showSuccessAlert(
        "Chạy thử nghiệm hoàn tất (Dry Run)",
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
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
              Tự động nộp hồ sơ định kỳ (KBTT Auto-Submit)
            </h2>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">
              Hệ thống tự động quét và nộp các hồ sơ khách có trạng thái SẴN SÀNG theo lịch mỗi ngày.
            </p>
          </div>
        </div>

        <div>
          {isEnabled ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-800">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Đang bật • {currentTime} (UTC+7)
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 py-1.5 text-sm font-bold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Đang tắt
            </span>
          )}
        </div>
      </div>

      {!isConnected ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900">
          Khách sạn chưa kết nối tài khoản C06 thành công. Hãy đăng nhập tài khoản ở trên trước khi kích hoạt nộp tự động.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50/70 rounded-2xl p-5 border border-slate-100">
            <div className="flex items-center justify-between gap-4 p-2">
              <div>
                <label className="text-base font-bold text-slate-900">Bật tự động nộp hồ sơ</label>
                <p className="text-sm text-slate-600">Kích hoạt tác vụ cron quét hồ sơ mỗi ngày</p>
              </div>
              <input
                type="checkbox"
                disabled={!canManage || isSaving}
                checked={isEnabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-6 w-6 rounded border-slate-300 text-[#0f6756] focus:ring-[#0f6756]"
              />
            </div>

            <div className="p-2">
              <label className="block text-base font-bold text-slate-900 mb-1.5">
                Giờ nộp định kỳ (Giờ Việt Nam)
              </label>
              <input
                type="time"
                disabled={!canManage || !isEnabled || isSaving}
                value={currentTime}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base font-semibold text-slate-900 focus:border-[#0f6756] focus:ring-2 focus:ring-[#0f6756]/20 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {canManage && (
                <>
                  <button
                    type="button"
                    disabled={isSaving || Boolean(pendingSchedule)}
                    onClick={() => void handleTestDryRun()}
                    className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    <svg className="h-4 w-4 text-teal-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {testing ? "Đang thử nghiệm..." : "Thử nghiệm nộp (Dry Run)"}
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || testingTelegram || Boolean(pendingSchedule)}
                    onClick={() => void handleTelegramTest()}
                    className="flex min-h-[44px] items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-bold text-sky-800 shadow-sm transition hover:bg-sky-100 disabled:opacity-50"
                  >
                    {testingTelegram ? "Đang gửi Telegram..." : "Gửi Telegram thử"}
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || Boolean(pendingSchedule)}
                    onClick={() => void scheduleRun("dry-run")}
                    className="flex min-h-[44px] items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-5 py-2.5 text-sm font-bold text-teal-800 shadow-sm transition hover:bg-teal-100 disabled:opacity-50"
                  >
                    Hẹn Dry Run 15 giây
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || Boolean(pendingSchedule)}
                    onClick={() => void scheduleRun("live")}
                    className="flex min-h-[44px] items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-bold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
                  >
                    Hẹn Live + Telegram 15 giây
                  </button>
                  {pendingSchedule ? (
                    <button
                      type="button"
                      disabled={cancellingSchedule}
                      onClick={() => void cancelScheduledRun()}
                      className="flex min-h-[44px] items-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100"
                    >
                      {cancellingSchedule ? "Đang hủy..." : `Hủy (${pendingSeconds}s)`}
                    </button>
                  ) : null}
                </>
              )}
            </div>

            {canManage && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveConfig()}
                className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0f6756] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0c5245] disabled:opacity-50"
              >
                {updating ? "Đang lưu..." : "Lưu cấu hình nộp tự động"}
              </button>
            )}
          </div>

          {/* Recent Runs Table */}
          {data?.recentRuns && data.recentRuns.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-base font-bold text-slate-900 mb-3">Lịch sử các phiên nộp tự động gần nhất</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Thời gian</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Tổng hồ sơ</th>
                      <th className="px-4 py-3">Thành công</th>
                      <th className="px-4 py-3">Thất bại</th>
                      <th className="px-4 py-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                          {formatDateTime(run.scheduledFor)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            run.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : run.status === "SKIPPED"
                              ? "bg-slate-100 text-slate-700"
                              : "bg-red-100 text-red-800"
                          }`}>
                            {run.status === "COMPLETED" ? "Thành công" : run.status === "SKIPPED" ? "Bỏ qua (0 hồ sơ)" : "Lỗi"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold">{run.totalEligible ?? run.totalCount ?? 0}</td>
                        <td className="px-4 py-3 text-emerald-600 font-semibold">{run.successCount}</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">{(run.failureCount ?? run.failedCount ?? 0) + (run.unknownCount ?? 0)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{run.errorMessage || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

