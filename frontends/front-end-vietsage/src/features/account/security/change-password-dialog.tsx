"use client";

import { type FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useChangePassword } from "@/features/auth/hooks/use-change-password";
import { validatePasswordChange } from "./password-security";

const emptyForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
type PasswordField = keyof typeof emptyForm;

const passwordFields: ReadonlyArray<{
  name: PasswordField;
  label: string;
  autoComplete: "current-password" | "new-password";
}> = [
  {
    name: "currentPassword",
    label: "Mật khẩu hiện tại",
    autoComplete: "current-password",
  },
  {
    name: "newPassword",
    label: "Mật khẩu mới",
    autoComplete: "new-password",
  },
  {
    name: "confirmPassword",
    label: "Xác nhận mật khẩu mới",
    autoComplete: "new-password",
  },
];

const hiddenPasswords: Record<PasswordField, boolean> = {
  currentPassword: false,
  newPassword: false,
  confirmPassword: false,
};

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [visiblePasswords, setVisiblePasswords] = useState(hiddenPasswords);
  const [error, setError] = useState<string | null>(null);
  const { changePassword, isPending } = useChangePassword();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        setOpen(false);
        setForm(emptyForm);
        setVisiblePasswords(hiddenPasswords);
        setError(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isPending, open]);

  function close() {
    if (isPending) return;
    setOpen(false);
    setForm(emptyForm);
    setVisiblePasswords(hiddenPasswords);
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#24473d]/15 bg-white/50 px-3 py-2 text-xs font-bold text-[#24473d] hover:bg-[#f8f1e6]"
      >
        <VsIcon name="key" className="text-base" />
        <span className="hidden lg:inline">Đổi mật khẩu</span>
      </button>
      {open
        ? createPortal(
          <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/45 p-4 sm:p-6">
          <form
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 text-left shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#7b6a2f]">
                  Bảo mật tài khoản
                </p>
                <h2
                  id="change-password-title"
                  className="mt-1 text-2xl font-semibold text-[#17201b]"
                >
                  Đổi mật khẩu
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Đóng"
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <VsIcon name="close" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {passwordFields.map(({ name, label, autoComplete }) => (
                <label
                  key={name}
                  className="block text-sm font-semibold text-[#17201b]"
                >
                  {label}
                  <span className="relative mt-2 block">
                    <input
                      required
                      type={visiblePasswords[name] ? "text" : "password"}
                      autoComplete={autoComplete}
                      value={form[name]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [name]: event.target.value,
                        }))
                      }
                      className="min-h-11 w-full rounded-lg border border-slate-300 py-2 pl-3 pr-12 font-normal outline-none focus:border-[#24473d]"
                    />
                    <button
                      type="button"
                      aria-label={`${visiblePasswords[name] ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`}
                      aria-pressed={visiblePasswords[name]}
                      onClick={() =>
                        setVisiblePasswords((current) => ({
                          ...current,
                          [name]: !current[name],
                        }))
                      }
                      className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-slate-500 transition hover:bg-slate-100 hover:text-[#24473d] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#24473d]"
                    >
                      <VsIcon
                        name={
                          visiblePasswords[name]
                            ? "visibility_off"
                            : "visibility"
                        }
                        className="text-xl"
                      />
                    </button>
                  </span>
                </label>
              ))}
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </p>
              ) : null}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="min-h-11 rounded-xl border px-4 font-semibold"
              >
                Hủy
              </button>
              <button
                disabled={isPending}
                className="min-h-11 rounded-xl bg-[#17201b] px-4 font-semibold text-white disabled:opacity-50"
              >
                {isPending ? "Đang đổi..." : "Đổi mật khẩu"}
              </button>
            </div>
          </form>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
