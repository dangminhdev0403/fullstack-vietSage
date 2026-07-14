"use client";

import { type FormEvent, useEffect, useId, useRef } from "react";
import { m } from "motion/react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { GuestPortalRequestPriority, GuestServiceItem } from "../../types/guest-os-contract";
import { guestMotionTokens } from "../motion/guest-motion-tokens";

type GuestRequestSheetProps = {
  service: GuestServiceItem;
  quantity: string;
  priority: GuestPortalRequestPriority;
  note: string;
  error: string | null;
  isSubmitting: boolean;
  labels: {
    eyebrow: string;
    close: string;
    quantity: string;
    quantityHint: string;
    decrease: string;
    increase: string;
    normal: string;
    urgent: string;
    note: string;
    notePlaceholder: string;
    submit: string;
    submitting: string;
  };
  onClose: () => void;
  onQuantityChange: (value: string) => void;
  onQuantityStep: (delta: number) => void;
  onPriorityChange: (priority: GuestPortalRequestPriority) => void;
  onNoteChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function GuestRequestSheet(props: GuestRequestSheetProps) {
  const { isSubmitting, onClose } = props;
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isSubmitting, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-[#18211d]/50 backdrop-blur-[2px] md:items-center md:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !props.isSubmitting) props.onClose(); }}>
      <m.form ref={panelRef} onSubmit={props.onSubmit} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} initial={{ opacity: 0, y: guestMotionTokens.distance.standard }} animate={{ opacity: 1, y: 0 }} transition={{ duration: guestMotionTokens.duration.standard }} className="max-h-[calc(100dvh-24px)] w-full overflow-y-auto rounded-t-[28px] bg-[#fffdfa] p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-[0_28px_80px_rgba(24,33,29,0.28)] md:max-w-xl md:rounded-[28px] md:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8a6a13]">{props.labels.eyebrow}</p>
            <h2 id={titleId} className="vs-display mt-1 text-2xl font-semibold text-[#18211d]">{props.service.name}</h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-[#5e6a62]">{props.service.description}</p>
          </div>
          <button ref={closeRef} type="button" onClick={props.onClose} disabled={props.isSubmitting} aria-label={props.labels.close} className="vs-touch-button grid size-11 shrink-0 place-items-center rounded-full bg-[#eef3ee] text-[#25483f] transition-colors duration-200 hover:bg-[#e0e9e1] active:bg-[#d3dfd4] disabled:opacity-50">
            <VsIcon name="close" className="text-xl" />
          </button>
        </div>

        {props.service.quantityEnabled ? (
          <fieldset className="mb-5 rounded-2xl border border-[#25483f]/10 bg-[#f3f3ef] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <legend className="text-sm font-bold text-[#18211d]">{props.labels.quantity}</legend>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#745c00]">{props.labels.quantityHint}</span>
            </div>
            <div className="grid grid-cols-[48px_minmax(0,1fr)_48px] overflow-hidden rounded-xl border border-[#25483f]/15 bg-white focus-within:border-[#25483f]">
              <button type="button" onClick={() => props.onQuantityStep(-1)} disabled={Number(props.quantity) <= props.service.minQuantity || props.isSubmitting} aria-label={props.labels.decrease} className="min-h-12 border-r border-[#25483f]/10 text-xl font-semibold text-[#25483f] transition-colors duration-200 hover:bg-[#eef3ee] active:bg-[#e0e9e1] disabled:cursor-not-allowed disabled:opacity-40">-</button>
              <label className="sr-only" htmlFor={`${titleId}-quantity`}>{props.labels.quantity}</label>
              <input id={`${titleId}-quantity`} type="text" inputMode="numeric" pattern="[0-9]*" value={props.quantity} onChange={(event) => props.onQuantityChange(event.target.value.replace(/\D/g, ""))} disabled={props.isSubmitting} className="min-h-12 w-full border-0 bg-white px-3 text-center text-lg font-bold text-[#18211d] outline-none" />
              <button type="button" onClick={() => props.onQuantityStep(1)} disabled={(props.service.maxQuantity !== null && Number(props.quantity) >= props.service.maxQuantity) || props.isSubmitting} aria-label={props.labels.increase} className="min-h-12 border-l border-[#25483f]/10 text-xl font-semibold text-[#25483f] transition-colors duration-200 hover:bg-[#eef3ee] active:bg-[#e0e9e1] disabled:cursor-not-allowed disabled:opacity-40">+</button>
            </div>
          </fieldset>
        ) : null}

        <fieldset className="mb-5 rounded-2xl border border-[#25483f]/10 bg-[#f3f3ef] p-1">
          <legend className="sr-only">{props.labels.normal} / {props.labels.urgent}</legend>
          <div className="grid grid-cols-2 gap-1">
            {(["NORMAL", "URGENT"] as const).map((priority) => (
              <button key={priority} type="button" onClick={() => props.onPriorityChange(priority)} disabled={props.isSubmitting} aria-pressed={props.priority === priority} className={`min-h-11 rounded-xl px-3 text-sm font-bold transition-colors duration-200 ${props.priority === priority ? priority === "URGENT" ? "bg-[#ffdad6] text-[#93000a] shadow-sm" : "bg-white text-[#25483f] shadow-sm" : "text-[#5e6a62] hover:bg-white/70"}`}>
                {priority === "URGENT" ? props.labels.urgent : props.labels.normal}
              </button>
            ))}
          </div>
        </fieldset>

        <label htmlFor={`${titleId}-note`} className="mb-2 block text-sm font-bold text-[#18211d]">{props.labels.note}</label>
        <textarea id={`${titleId}-note`} rows={4} value={props.note} onChange={(event) => props.onNoteChange(event.target.value)} placeholder={props.labels.notePlaceholder} disabled={props.isSubmitting} wrap="soft" className="w-full resize-y overflow-x-hidden break-words rounded-2xl border border-[#25483f]/15 bg-white p-4 text-sm leading-6 text-[#18211d] outline-none [overflow-wrap:anywhere] focus:border-[#25483f] disabled:opacity-60" />
        {props.error ? <p className="mt-3 text-sm font-semibold text-[#93000a]" role="alert">{props.error}</p> : null}
        <button type="submit" disabled={props.isSubmitting} className="vs-touch-button mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25483f] px-5 text-sm font-bold text-white shadow-[0_16px_36px_rgba(37,72,63,0.18)] transition-colors duration-200 hover:bg-[#19382f] active:bg-[#122b24] disabled:cursor-not-allowed disabled:opacity-60">
          <VsIcon name="send" className="text-xl" />
          {props.isSubmitting ? props.labels.submitting : props.labels.submit}
        </button>
      </m.form>
    </div>
  );
}
