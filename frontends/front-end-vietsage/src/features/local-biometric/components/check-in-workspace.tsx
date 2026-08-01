"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import type { CheckInWorkspaceProps, CheckInStayFields } from "../types/check-in-workspace";
import { buildCccdPreviewModel } from "../utils/cccd-preview";
import { CccdCheckInPanel, type CccdCheckInCapture } from "./cccd-check-in-panel";
import { CccdPreview } from "./cccd-preview";

const inputClass = "min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-950 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100";

export function CheckInWorkspace(props: CheckInWorkspaceProps) {
  const { open, hotelId, room, canManageStays, initialStayFields, submitState, submitError, onSubmit, onClose } = props;
  const [fields, setFields] = useState<CheckInStayFields>({
    guestDisplayName: initialStayFields?.guestDisplayName || "",
    guestPhone: initialStayFields?.guestPhone || "",
    plannedCheckOutAt: initialStayFields?.plannedCheckOutAt || "",
    guestIdentityNumber: initialStayFields?.guestIdentityNumber || "",
  });
  const [capture, setCapture] = useState<CccdCheckInCapture | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(async () => {
    const dirty = Boolean(
      capture
      || fields.guestDisplayName !== (initialStayFields?.guestDisplayName || "")
      || fields.guestPhone !== (initialStayFields?.guestPhone || "")
      || fields.plannedCheckOutAt !== (initialStayFields?.plannedCheckOutAt || "")
      || fields.guestIdentityNumber !== (initialStayFields?.guestIdentityNumber || ""),
    );
    if (dirty) {
      const confirmed = await Swal.fire({
        icon: "warning",
        title: "Xác nhận hủy check-in?",
        text: "Hủy check-in và bỏ thông tin đang nhập?",
        showCancelButton: true,
        confirmButtonText: "Đồng ý hủy",
        cancelButtonText: "Hủy",
        confirmButtonColor: "#dc2626",
        cancelButtonColor: "#64748b",
      });
      if (!confirmed.isConfirmed) return;
    }
    onClose();
  }, [capture, fields, initialStayFields, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => headingRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleClose, open]);

  const handleCapture = useCallback((nextCapture: CccdCheckInCapture | null) => {
    setCapture(nextCapture);
    if (!nextCapture) return;
    setFields((current) => ({
      ...current,
      guestDisplayName: nextCapture.guestDisplayName,
      guestIdentityNumber: nextCapture.guestIdentityNumber,
      guestDateOfBirth: nextCapture.guestDateOfBirth,
      guestGender: nextCapture.guestGender,
      guestNationality: nextCapture.guestNationality,
      guestResidencePlace: nextCapture.guestResidencePlace,
    }));
  }, []);

  if (!open) return null;

  const previewModel = capture?.payload ? buildCccdPreviewModel(capture.payload) : null;
  const roomStatus = room.status === "ready" ? "Phòng sẵn sàng" : room.status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] md:p-6" role="dialog" aria-modal="true" aria-labelledby="ciw-heading">
      <div ref={dialogRef} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 shadow-2xl md:h-auto md:max-h-[calc(100dvh-48px)] md:w-[calc(100vw-48px)] md:max-w-[1080px] md:rounded-2xl md:border md:border-white/70">
        <header className="z-10 shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-6 md:py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="ciw-heading" ref={headingRef} tabIndex={-1} className="text-xl font-bold tracking-tight text-slate-950 outline-none md:text-2xl">
                Check-in phòng {room.roomNumber}
              </h2>
              <p className="mt-1 text-sm text-slate-600">Xác minh khách và hoàn tất thông tin lưu trú</p>
            </div>
            <button type="button" onClick={handleClose} className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-2xl leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-100" aria-label="Đóng">
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <ol data-ui="check-in-progress" aria-label="Tiến trình check-in" className="mt-5 grid grid-cols-3 gap-2 text-xs font-semibold sm:text-sm">
            <li className={`rounded-lg px-2 py-2.5 text-center ${capture ? "bg-emerald-50 text-emerald-800" : "bg-blue-600 text-white"}`}>1. Quét CCCD</li>
            <li className={`rounded-lg px-2 py-2.5 text-center ${capture ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>2. Kiểm tra</li>
            <li className="rounded-lg bg-slate-100 px-2 py-2.5 text-center text-slate-500">3. Hoàn tất</li>
          </ol>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-6 md:py-6">
          <section data-ui="room-summary" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="text-sm font-medium text-blue-800">Phòng</span>
              <strong className="truncate text-lg text-blue-950">{room.roomNumber}{room.type ? ` · ${room.type}` : ""}</strong>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-200">{roomStatus}</span>
          </section>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)] lg:gap-6">
            <section className="min-w-0 space-y-4" aria-labelledby="identity-heading">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 id="identity-heading" className="text-base font-bold text-slate-950">Xác thực CCCD</h3>
                  <p className="mt-0.5 text-sm text-slate-600">Dữ liệu dùng để đối chiếu trong phiên check-in này.</p>
                </div>
                {capture ? <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Xác thực thành công</span> : null}
              </div>
              <CccdCheckInPanel hotelId={hotelId} onCapture={handleCapture} />
              {previewModel ? <CccdPreview model={previewModel} /> : null}
            </section>

            <form data-ui="stay-form" id="ciw-form" onSubmit={(event) => { event.preventDefault(); onSubmit(fields); }} className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <div>
                <h3 className="text-base font-bold text-slate-950">Thông tin lưu trú</h3>
                <p className="mt-1 text-sm text-slate-600">Kiểm tra dữ liệu và bổ sung thông tin còn thiếu.</p>
              </div>

              {submitError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800" role="alert" aria-live="assertive">{submitError}</div> : null}

              <div className="space-y-2">
                <label htmlFor="ciw-name" className="block text-sm font-semibold text-slate-800">Họ và tên khách <span className="text-red-700" aria-hidden="true">*</span></label>
                <input id="ciw-name" type="text" required value={fields.guestDisplayName} onChange={(event) => setFields({ ...fields, guestDisplayName: event.target.value })} className={inputClass} />
                {capture ? <p className="text-xs font-medium text-emerald-700">Đã điền từ CCCD</p> : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="ciw-phone" className="block text-sm font-semibold text-slate-800">Số điện thoại <span className="font-normal text-slate-500">(không bắt buộc)</span></label>
                <input id="ciw-phone" type="tel" inputMode="tel" value={fields.guestPhone} onChange={(event) => setFields({ ...fields, guestPhone: event.target.value })} className={inputClass} />
              </div>

              <div className="space-y-2">
                <label htmlFor="ciw-checkout" className="block text-sm font-semibold text-slate-800">Dự kiến trả phòng <span className="text-red-700" aria-hidden="true">*</span></label>
                <input id="ciw-checkout" type="datetime-local" required value={fields.plannedCheckOutAt} onChange={(event) => setFields({ ...fields, plannedCheckOutAt: event.target.value })} className={inputClass} />
              </div>
            </form>
          </div>
        </main>

        <footer data-ui="sticky-actions" className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <p className="text-center text-xs text-slate-600 sm:text-left">Dữ liệu CCCD chỉ xử lý tạm thời. Không lưu trên VPS.</p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button type="button" onClick={handleClose} className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 sm:w-auto">Hủy</button>
            <button type="submit" form="ciw-form" disabled={!canManageStays || submitState === "submitting"} className="min-h-[46px] w-full rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              {submitState === "submitting" ? "Đang xử lý..." : "Hoàn tất check-in"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
