"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

export function RevenueBookDialog({
  title,
  busy = false,
  onClose,
  children,
}: {
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-2xl bg-white p-0 text-[var(--on-surface)] shadow-2xl backdrop:bg-slate-900/50"
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--outline-variant)] px-5 py-4 sm:px-6">
        <h2 id={titleId} className="text-xl font-semibold text-balance">
          {title}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Đóng cửa sổ"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-50"
        >
          <VsIcon name="close" className="text-xl" />
        </button>
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </dialog>
  );
}
