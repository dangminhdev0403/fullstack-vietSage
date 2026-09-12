"use client";

import { useState, type FormEvent } from "react";
import { HttpError } from "@/core/http/http-error";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useKbttConnection } from "../hooks/use-kbtt-connection";
import { kbttCredentialsSchema, kbttErrorCode, kbttErrorMessage, type KbttConnection } from "../types/kbtt-contract";

const buttonClass = "min-h-12 rounded-xl px-5 py-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-50";
const inputClass = "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:bg-slate-100";

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    const code = kbttErrorCode(error.data);
    if (code) return kbttErrorMessage(code);
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy khách sạn hoặc bạn không có quyền truy cập.";
    return kbttErrorMessage(kbttErrorCode(error.data));
  }
  return kbttErrorMessage(null);
}

function checkedAt(value: string | null): string {
  if (!value) return "Chưa kiểm tra";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Chưa xác định" : date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function KbttConnectionPage({ hotelId, canManage }: { hotelId: string; canManage: boolean }) {
  const { connection, busy, connect, check, disconnect } = useKbttConnection(hotelId);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const data = connection.data;
  const disabled = busy || confirming || connection.isFetching;

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
    if (!canManage || disabled) return;
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
      setUsername("");
      setPassword("");
      await run(disconnect, "Đã ngắt kết nối và xóa tài khoản đã lưu.", true);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6 text-base text-slate-900" aria-labelledby="kbtt-title">
      <header className="space-y-3">
        <h1 id="kbtt-title" className="text-2xl font-extrabold sm:text-3xl">Khai báo tạm trú Bộ Công an</h1>
        <p className="max-w-prose leading-relaxed text-slate-600">Kết nối tài khoản khai báo tạm trú riêng cho khách sạn này. Giai đoạn này chỉ kiểm tra kết nối, chưa gửi dữ liệu khách lưu trú.</p>
      </header>
      <div className="min-h-48 rounded-2xl border border-slate-200 bg-white p-6" aria-busy={connection.isFetching || busy}>
        {connection.isPending ? <p role="status">Đang tải trạng thái kết nối đã lưu…</p> : connection.isError ? (
          <div className="space-y-4">
            <p role="alert" className="text-red-700">{errorText(connection.error)}</p>
            <button type="button" className={`${buttonClass} border border-slate-300`} disabled={connection.isFetching} onClick={() => void connection.refetch()}>Tải lại trạng thái</button>
          </div>
        ) : data ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Trạng thái kết nối</h2>
              <p role="status" className={`rounded-lg px-3 py-2 font-semibold ${data.status === "CONNECTED" ? "bg-emerald-50 text-emerald-800" : data.status === "AUTH_FAILED" ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                {data.status === "CONNECTED" ? "Đã kết nối" : data.status === "AUTH_FAILED" ? "Cần đăng nhập lại" : data.configured ? "Đã ngắt kết nối" : "Chưa kết nối"}
              </p>
            </div>
            <dl className="grid gap-5 sm:grid-cols-2">
              <div><dt className="text-slate-600">Tài khoản đã lưu</dt><dd className="mt-1 break-all font-semibold">{data.maskedUsername ?? "Chưa cấu hình"}</dd></div>
              <div><dt className="text-slate-600">Mã cơ sở lưu trú</dt><dd className="mt-1 break-all font-semibold">{data.csltId ?? "Chưa xác định"}</dd></div>
              <div><dt className="text-slate-600">Kiểm tra gần nhất</dt><dd className="mt-1">{checkedAt(data.lastCheckedAt)}</dd></div>
              <div><dt className="text-slate-600">Kết nối thành công gần nhất</dt><dd className="mt-1">{data.lastConnectedAt ? checkedAt(data.lastConnectedAt) : "Chưa kết nối"}</dd></div>
            </dl>
            {data.lastErrorMessage || data.lastErrorCode ? <p role="alert" className="text-red-700">{kbttErrorMessage(data.lastErrorCode)}</p> : null}
            {canManage && data.configured ? (
              <div className="flex flex-wrap gap-3">
                <button type="button" className={`${buttonClass} border border-slate-300 hover:bg-slate-50`} disabled={disabled} onClick={() => void run(check, "Đã kiểm tra kết nối thành công.")}>Kiểm tra kết nối</button>
                <button type="button" className={`${buttonClass} border border-red-200 text-red-700 hover:bg-red-50`} disabled={disabled} onClick={() => void confirmDisconnect()}>Ngắt kết nối</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {canManage && data && !connection.isError ? (
        <form onSubmit={(event) => void submit(event)} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="kbtt-account-title" autoComplete="off">
          <h2 id="kbtt-account-title" className="text-xl font-semibold">{data.configured ? "Đăng nhập lại hoặc đổi tài khoản" : "Kết nối tài khoản"}</h2>
          <p id="kbtt-credentials-help" className="leading-relaxed text-slate-600">Nhập tài khoản và mật khẩu được cấp cho cơ sở lưu trú. Mật khẩu chỉ dùng để kết nối, không hiển thị lại trên giao diện.</p>
          <fieldset disabled={disabled} className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="kbtt-username" className="block font-semibold">Tài khoản</label>
              <input id="kbtt-username" name="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={120} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="kbtt-credentials-help" className={inputClass} />
            </div>
            <div className="space-y-2">
              <label htmlFor="kbtt-password" className="block font-semibold">Mật khẩu</label>
              <input id="kbtt-password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} autoComplete="new-password" aria-describedby="kbtt-credentials-help" className={inputClass} />
            </div>
          </fieldset>
          <button type="submit" disabled={disabled || !username.trim() || !password} className={`${buttonClass} bg-slate-900 text-white hover:bg-slate-800`}>{busy ? "Đang xử lý…" : data.configured ? "Đăng nhập lại" : "Kết nối"}</button>
        </form>
      ) : !canManage ? <p className="text-slate-600">Bạn có quyền xem trạng thái. Liên hệ người quản lý để thay đổi kết nối.</p> : null}
    </section>
  );
}
