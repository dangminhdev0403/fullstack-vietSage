"use client";

import { useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type Props = { temporaryPassword: string | null; accountLabel: string; onClose: () => void };

export function OneTimePasswordDialog({ temporaryPassword, accountLabel, onClose }: Readonly<Props>) {
  const [copied, setCopied] = useState(false);
  if (!temporaryPassword) return null;
  const close = () => { setCopied(false); onClose(); };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/45 p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="temporary-password-title">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#7b6a2f]">Hiển thị một lần</p><h2 id="temporary-password-title" className="mt-1 text-2xl font-semibold text-[#17201b]">Mật khẩu tạm thời</h2></div><button type="button" onClick={close} aria-label="Đóng" className="rounded-lg p-2 hover:bg-slate-100"><VsIcon name="close" /></button></div>
        <p className="mt-4 text-sm text-slate-600">Gửi mật khẩu này cho {accountLabel} qua kênh an toàn. Mật khẩu sẽ bị xóa khỏi màn hình khi đóng.</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border bg-slate-50 p-3"><code className="min-w-0 flex-1 break-all text-base font-bold text-[#17201b]">{temporaryPassword}</code><button type="button" onClick={async () => { await navigator.clipboard.writeText(temporaryPassword); setCopied(true); }} className="min-h-10 rounded-lg border bg-white px-3 text-sm font-semibold">{copied ? "Đã sao chép" : "Sao chép"}</button></div>
        <button type="button" onClick={close} className="mt-6 min-h-11 w-full rounded-xl bg-[#17201b] px-4 font-semibold text-white">Đã lưu, đóng</button>
      </section>
    </div>
  );
}
