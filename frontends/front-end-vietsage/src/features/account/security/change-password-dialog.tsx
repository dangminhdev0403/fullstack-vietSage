"use client";

import { type FormEvent, useState } from "react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useChangePassword } from "@/features/auth/hooks/use-change-password";
import { validatePasswordChange } from "./password-security";

const emptyForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const { changePassword, isPending } = useChangePassword();

  function close() {
    if (isPending) return;
    setOpen(false);
    setForm(emptyForm);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validatePasswordChange(form);
    if (validationError) return setError(validationError);
    setError(null);
    try {
      await changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể đổi mật khẩu.");
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#24473d]/15 bg-white/50 px-3 py-2 text-xs font-bold text-[#24473d] hover:bg-[#f8f1e6]">
        <VsIcon name="key" className="text-base" />
        <span className="hidden lg:inline">Đổi mật khẩu</span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
          <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 text-left shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#7b6a2f]">Bảo mật tài khoản</p><h2 id="change-password-title" className="mt-1 text-2xl font-semibold text-[#17201b]">Đổi mật khẩu</h2></div>
              <button type="button" onClick={close} aria-label="Đóng" className="rounded-lg p-2 hover:bg-slate-100"><VsIcon name="close" /></button>
            </div>
            <div className="mt-5 space-y-4">
              {[["currentPassword", "Mật khẩu hiện tại"], ["newPassword", "Mật khẩu mới"], ["confirmPassword", "Xác nhận mật khẩu mới"]].map(([name, label]) => (
                <label key={name} className="block text-sm font-semibold text-[#17201b]">{label}<input required type="password" autoComplete={name === "currentPassword" ? "current-password" : "new-password"} value={form[name as keyof typeof form]} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-[#24473d]" /></label>
              ))}
              {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={close} disabled={isPending} className="min-h-11 rounded-xl border px-4 font-semibold">Hủy</button><button disabled={isPending} className="min-h-11 rounded-xl bg-[#17201b] px-4 font-semibold text-white disabled:opacity-50">{isPending ? "Đang đổi..." : "Đổi mật khẩu"}</button></div>
          </form>
        </div>
      ) : null}
    </>
  );
}
