"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { filterExtraOccupants } from "@/features/hotel-ops/utils/hotel-ops-display";
import type { CheckInWorkspaceProps, CheckInStayFields } from "../types/check-in-workspace";
import { buildCccdPreviewModel } from "../utils/cccd-preview";
import type { CccdCheckInCapture } from "./cccd-check-in-panel";
import { CccdPreview } from "./cccd-preview";
import { MobileCccdScan } from "./mobile-cccd-scan";
import { DesktopDocumentOcrUpload } from "./desktop-document-ocr-upload";

const cellInputClass = "h-11 sm:h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-base sm:text-lg font-semibold text-slate-950 shadow-2xs outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 placeholder:font-normal";
const cellSelectClass = "h-11 sm:h-12 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base sm:text-lg font-semibold text-slate-950 shadow-2xs outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

function toDisplayVnDate(str?: string): string {
  if (!str) return "";
  const t = str.trim();
  if (!t) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return t;
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }
  return t;
}

function toIsoDate(str?: string): string {
  if (!str) return "";
  const t = str.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

function VnDateInput({
  id,
  value,
  onChange,
  className,
  placeholder = "ngày/tháng/năm",
  required,
}: {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [textVal, setTextVal] = useState(() => toDisplayVnDate(value));
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Browser input text mirrors controlled OCR/manual updates after render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTextVal(toDisplayVnDate(value));
  }, [value]);

  const handleTextChange = (raw: string) => {
    let cleaned = raw.replace(/[^\d/]/g, "");
    if (/^\d{2}$/.test(cleaned) && textVal.length === 1) {
      cleaned = cleaned + "/";
    } else if (/^\d{2}\/\d{2}$/.test(cleaned) && textVal.length === 4) {
      cleaned = cleaned + "/";
    }
    setTextVal(cleaned);

    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cleaned);
    if (match) {
      const [, d, m, y] = match;
      onChange(`${y}-${m}-${d}`);
    } else if (!cleaned) {
      onChange("");
    }
  };

  const handleNativePickerChange = (isoVal: string) => {
    if (isoVal) {
      onChange(isoVal);
      setTextVal(toDisplayVnDate(isoVal));
    }
  };

  const openPicker = () => {
    if (dateInputRef.current) {
      if (typeof dateInputRef.current.showPicker === "function") {
        dateInputRef.current.showPicker();
      } else {
        dateInputRef.current.focus();
      }
    }
  };

  const isoForNative = toIsoDate(value);

  return (
    <div className="relative flex items-center w-full">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        required={required}
        value={textVal}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={() => {
          const digitsOnly = textVal.replace(/\D/g, "");
          if (digitsOnly.length === 8) {
            const d = digitsOnly.slice(0, 2);
            const m = digitsOnly.slice(2, 4);
            const y = digitsOnly.slice(4, 8);
            const formatted = `${d}/${m}/${y}`;
            setTextVal(formatted);
            onChange(`${y}-${m}-${d}`);
          }
        }}
        placeholder={placeholder}
        className={`${className || ""} pr-8`}
        maxLength={10}
      />
      <input
        ref={dateInputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={isoForNative}
        onChange={(e) => handleNativePickerChange(e.target.value)}
        className="sr-only absolute pointer-events-none"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        title="Chọn ngày trên lịch"
        className="absolute right-2 text-slate-400 hover:text-blue-600 transition-colors p-0.5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
    </div>
  );
}

export function CheckInWorkspace(props: CheckInWorkspaceProps) {
  const { open, hotelId, room, canManageStays, initialStayFields, submitState, submitError, onSubmit, onClose } = props;
  const [fields, setFields] = useState<CheckInStayFields>({
    guestDisplayName: initialStayFields?.guestDisplayName || "",
    guestPhone: initialStayFields?.guestPhone || "",
    plannedCheckOutAt: initialStayFields?.plannedCheckOutAt || "",
    guestIdentityNumber: initialStayFields?.guestIdentityNumber || "",
    guestDateOfBirth: initialStayFields?.guestDateOfBirth || "",
    guestGender: initialStayFields?.guestGender || "",
    guestNationality: initialStayFields?.guestNationality || "",
    guestResidencePlace: initialStayFields?.guestResidencePlace || "",
  });
  const [capturesByGuest, setCapturesByGuest] = useState<Record<number, CccdCheckInCapture>>({});
  const [occupants, setOccupants] = useState<Array<{ fullName: string; phone?: string; identityNumber?: string; dateOfBirth?: string; gender?: string; nationality?: string; residencePlace?: string }>>([]);
  const [activeGuestIndex, setActiveGuestIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedOccupants, setSelectedOccupants] = useState<Set<number>>(new Set());
  const [intakeMethod, setIntakeMethod] = useState<"upload" | "mobile">("upload");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [checkoutDate, checkoutTime] = useMemo(() => {
    if (!fields.plannedCheckOutAt) return ["", "12:00"];
    if (fields.plannedCheckOutAt.includes("T")) {
      const [d, t] = fields.plannedCheckOutAt.split("T");
      return [d, t ? t.slice(0, 5) : "12:00"];
    }
    return [fields.plannedCheckOutAt.slice(0, 10), "12:00"];
  }, [fields.plannedCheckOutAt]);

  const handleAddOccupant = useCallback(() => {
    setOccupants((prev) => [...prev, { fullName: "", phone: "", identityNumber: "" }]);
  }, []);

  const handleRemoveOccupant = useCallback((index: number) => {
    setOccupants((prev) => prev.filter((_, i) => i !== index));
    setSelectedOccupants((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
    setActiveGuestIndex((curr) => (curr > index + 1 ? curr - 1 : curr === index + 1 ? 0 : curr));
  }, []);

  const handleOccupantChange = useCallback((index: number, key: "fullName" | "phone" | "identityNumber" | "dateOfBirth" | "gender" | "nationality" | "residencePlace", value: string) => {
    setOccupants((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }, []);

  const hasAnyCapture = Object.keys(capturesByGuest).length > 0;

  const handleClose = useCallback(async () => {
    const hasNonEmptyOccupant = occupants.some((occ) =>
      Boolean(
        occ.fullName?.trim()
        || occ.phone?.trim()
        || occ.identityNumber?.trim()
        || occ.dateOfBirth?.trim()
        || occ.gender?.trim()
        || occ.nationality?.trim()
        || occ.residencePlace?.trim(),
      ),
    );
    const dirty = Boolean(
      hasAnyCapture
      || fields.guestDisplayName !== (initialStayFields?.guestDisplayName || "")
      || fields.guestPhone !== (initialStayFields?.guestPhone || "")
      || fields.plannedCheckOutAt !== (initialStayFields?.plannedCheckOutAt || "")
      || fields.guestIdentityNumber !== (initialStayFields?.guestIdentityNumber || "")
      || fields.guestDateOfBirth !== (initialStayFields?.guestDateOfBirth || "")
      || fields.guestGender !== (initialStayFields?.guestGender || "")
      || fields.guestNationality !== (initialStayFields?.guestNationality || "")
      || fields.guestResidencePlace !== (initialStayFields?.guestResidencePlace || "")
      || hasNonEmptyOccupant,
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
  }, [hasAnyCapture, fields, initialStayFields, occupants, onClose]);

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

  const isSameIdentity = (
    capture: CccdCheckInCapture,
    idNumber?: string,
    name?: string,
    dob?: string,
  ): boolean => {
    const capId = capture.guestIdentityNumber?.trim().toLowerCase();
    const tgtId = idNumber?.trim().toLowerCase();
    if (capId && tgtId && capId === tgtId) return true;

    const capName = capture.guestDisplayName?.trim().toLowerCase();
    const tgtName = name?.trim().toLowerCase();
    if (capName && tgtName && capName === tgtName) {
      if (capture.guestDateOfBirth && dob) {
        return capture.guestDateOfBirth === dob;
      }
      return true;
    }
    return false;
  };

  const handleCapture = useCallback((nextCapture: CccdCheckInCapture | null) => {
    if (!nextCapture) return;

    // Check if duplicate of primary guest
    const matchesPrimary = isSameIdentity(
      nextCapture,
      fields.guestIdentityNumber,
      fields.guestDisplayName,
      fields.guestDateOfBirth,
    );

    // Check if duplicate of an existing occupant
    const matchOccIdx = occupants.findIndex((occ) =>
      isSameIdentity(nextCapture, occ.identityNumber, occ.fullName, occ.dateOfBirth),
    );

    let targetSlot = activeGuestIndex;
    const isPrimaryEmpty = !fields.guestDisplayName?.trim() && !fields.guestIdentityNumber?.trim();

    if (matchesPrimary) {
      targetSlot = 0;
    } else if (matchOccIdx !== -1) {
      targetSlot = matchOccIdx + 1;
    } else if (isPrimaryEmpty) {
      targetSlot = 0;
    } else {
      // Primary has data and capture is new ("không trùng"): auto add to new or empty occupant
      const blankOccIdx = occupants.findIndex(
        (occ) => !occ.fullName?.trim() && !occ.identityNumber?.trim(),
      );
      if (blankOccIdx !== -1) {
        targetSlot = blankOccIdx + 1;
      } else {
        // Auto-add new occupant
        targetSlot = 1 + occupants.length;
      }
    }

    setCapturesByGuest((prev) => ({ ...prev, [targetSlot]: nextCapture }));

    if (targetSlot === 0) {
      setFields((current) => ({
        ...current,
        guestDisplayName: nextCapture.guestDisplayName?.trim() || current.guestDisplayName,
        guestIdentityNumber: nextCapture.guestIdentityNumber?.trim() || current.guestIdentityNumber,
        guestDateOfBirth: nextCapture.guestDateOfBirth?.trim() || current.guestDateOfBirth,
        guestGender: nextCapture.guestGender?.trim() || current.guestGender,
        guestNationality: nextCapture.guestNationality?.trim() || current.guestNationality,
        guestResidencePlace: nextCapture.guestResidencePlace?.trim() || current.guestResidencePlace,
      }));
    } else {
      const occupantIdx = targetSlot - 1;
      setOccupants((prev) => {
        const next = [...prev];
        while (next.length <= occupantIdx) {
          next.push({ fullName: "", phone: "", identityNumber: "" });
        }
        const existing = next[occupantIdx] || { fullName: "", phone: "", identityNumber: "" };
        next[occupantIdx] = {
          ...existing,
          fullName: nextCapture.guestDisplayName?.trim() || existing.fullName,
          identityNumber: nextCapture.guestIdentityNumber?.trim() || existing.identityNumber,
          dateOfBirth: nextCapture.guestDateOfBirth?.trim() || existing.dateOfBirth,
          gender: nextCapture.guestGender?.trim() || existing.gender,
          nationality: nextCapture.guestNationality?.trim() || existing.nationality,
          residencePlace: nextCapture.guestResidencePlace?.trim() || existing.residencePlace,
        };
        return next;
      });
    }

    setActiveGuestIndex(targetSlot);
  }, [activeGuestIndex, fields, occupants]);

  const handleDocumentCaptures = useCallback((captures: CccdCheckInCapture[]) => {
    if (!captures.length) return;

    const primaryEmpty = !fields.guestDisplayName?.trim() && !fields.guestIdentityNumber?.trim();
    let lastTargetIndex = activeGuestIndex;

    // Check if any incoming capture matches the primary guest
    const primaryMatchIdx = captures.findIndex((cap) =>
      !primaryEmpty && isSameIdentity(cap, fields.guestIdentityNumber, fields.guestDisplayName, fields.guestDateOfBirth),
    );

    let primaryCapture: CccdCheckInCapture | null = null;
    let primaryCaptureIndex = -1;

    if (primaryMatchIdx !== -1) {
      primaryCapture = captures[primaryMatchIdx];
      primaryCaptureIndex = primaryMatchIdx;
    } else if (primaryEmpty) {
      // First passport uploaded into empty form belongs to Primary Guest
      primaryCapture = captures[0];
      primaryCaptureIndex = 0;
    }

    if (primaryCapture) {
      const cap = primaryCapture;
      setFields((current) => ({
        ...current,
        guestDisplayName: cap.guestDisplayName?.trim() || current.guestDisplayName,
        guestIdentityNumber: cap.guestIdentityNumber?.trim() || current.guestIdentityNumber,
        guestDateOfBirth: cap.guestDateOfBirth?.trim() || current.guestDateOfBirth,
        guestGender: cap.guestGender?.trim() || current.guestGender,
        guestNationality: cap.guestNationality?.trim() || current.guestNationality,
        guestResidencePlace: cap.guestResidencePlace?.trim() || current.guestResidencePlace,
      }));
      setCapturesByGuest((prev) => ({ ...prev, [0]: cap }));
      lastTargetIndex = 0;
    }

    // Populate occupants only with non-primary captures
    setOccupants((current) => {
      const next = [...current];

      captures.forEach((capture, offset) => {
        // CRITICAL FIX: Never add the primary guest's capture to occupants (prevents duplicate on first upload)
        if (offset === primaryCaptureIndex) {
          return;
        }

        // Also never duplicate primary guest
        if (!primaryEmpty && isSameIdentity(capture, fields.guestIdentityNumber, fields.guestDisplayName, fields.guestDateOfBirth)) {
          return;
        }

        // Deduplicate against existing occupants
        const occMatchIdx = next.findIndex(
          (occ) => isSameIdentity(capture, occ.identityNumber, occ.fullName, occ.dateOfBirth),
        );

        let occupantIndex: number;
        if (occMatchIdx !== -1) {
          occupantIndex = occMatchIdx;
        } else {
          // Find first empty occupant or auto-append new occupant
          const emptyIdx = next.findIndex(
            (occ) => !occ.fullName?.trim() && !occ.identityNumber?.trim(),
          );
          if (emptyIdx !== -1) {
            occupantIndex = emptyIdx;
          } else {
            occupantIndex = next.length;
          }
        }

        while (next.length <= occupantIndex) {
          next.push({ fullName: "", phone: "", identityNumber: "" });
        }
        const existing = next[occupantIndex];
        next[occupantIndex] = {
          ...existing,
          fullName: capture.guestDisplayName?.trim() || existing.fullName,
          identityNumber: capture.guestIdentityNumber?.trim() || existing.identityNumber,
          dateOfBirth: capture.guestDateOfBirth?.trim() || existing.dateOfBirth,
          gender: capture.guestGender?.trim() || existing.gender,
          nationality: capture.guestNationality?.trim() || existing.nationality,
          residencePlace: capture.guestResidencePlace?.trim() || existing.residencePlace,
        };

        const targetSlot = occupantIndex + 1;
        setCapturesByGuest((prev) => ({ ...prev, [targetSlot]: capture }));
        lastTargetIndex = targetSlot;
      });

      return next;
    });

    setActiveGuestIndex(lastTargetIndex);
  }, [activeGuestIndex, fields]);

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOccupants(new Set(occupants.map((_, i) => i)));
    } else {
      setSelectedOccupants(new Set());
    }
  };

  const handleToggleSelectOne = (index: number) => {
    setSelectedOccupants((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedOccupants.size === 0) return;
    setOccupants((prev) => prev.filter((_, i) => !selectedOccupants.has(i)));
    setSelectedOccupants(new Set());
    setActiveGuestIndex(0);
  };

  const handleSetAsPrimary = useCallback((occIdx: number) => {
    if (occIdx < 0 || occIdx >= occupants.length) return;
    const targetOcc = occupants[occIdx];
    const oldPrimary = {
      fullName: fields.guestDisplayName,
      phone: fields.guestPhone,
      identityNumber: fields.guestIdentityNumber,
      nationality: fields.guestNationality,
      residencePlace: fields.guestResidencePlace,
      dateOfBirth: fields.guestDateOfBirth,
      gender: fields.guestGender,
    };
    setFields((prev) => ({
      ...prev,
      guestDisplayName: targetOcc.fullName || "",
      guestIdentityNumber: targetOcc.identityNumber || "",
      guestNationality: targetOcc.nationality || prev.guestNationality,
      guestResidencePlace: targetOcc.residencePlace || prev.guestResidencePlace,
      guestDateOfBirth: targetOcc.dateOfBirth || prev.guestDateOfBirth,
      guestGender: targetOcc.gender || prev.guestGender,
    }));
    setOccupants((prev) => {
      const next = [...prev];
      next[occIdx] = oldPrimary;
      return next;
    });
    setCapturesByGuest((prev) => {
      const cap0 = prev[0];
      const capTarget = prev[occIdx + 1];
      const next = { ...prev };
      if (capTarget) next[0] = capTarget;
      else delete next[0];
      if (cap0) next[occIdx + 1] = cap0;
      else delete next[occIdx + 1];
      return next;
    });
    setSelectedOccupants(new Set());
    setActiveGuestIndex(0);
  }, [fields, occupants]);

  if (!open) return null;

  const currentGuestCapture = capturesByGuest[activeGuestIndex] ?? null;
  const previewModel = currentGuestCapture?.payload ? buildCccdPreviewModel(currentGuestCapture.payload) : null;
  const roomStatus = room.status === "ready" ? "Phòng sẵn sàng" : room.status;

  const totalGuests = 1 + occupants.length;
  const query = searchQuery.trim().toLowerCase();
  const showPrimary = !query || fields.guestDisplayName.toLowerCase().includes(query) || (fields.guestIdentityNumber || "").toLowerCase().includes(query) || (fields.guestResidencePlace || "").toLowerCase().includes(query);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-0 sm:p-3 md:p-6 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="ciw-heading">
      <div ref={dialogRef} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 shadow-2xl md:h-auto md:max-h-[calc(100dvh-48px)] md:w-[calc(100vw-32px)] md:max-w-[880px] md:rounded-2xl md:border md:border-white/70">

        {/* TOP HEADER: Clean Title + Status Badge (No room duplication!) */}
        <header className="z-10 shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="hidden sm:grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shrink-0">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 id="ciw-heading" ref={headingRef} tabIndex={-1} className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 outline-none">
                  Check-in phòng {room.roomNumber}{room.type ? ` · ${room.type}` : ""}
                </h2>
                <span className="rounded-full bg-emerald-50 px-3 py-0.5 text-xs sm:text-sm font-bold text-emerald-800 border border-emerald-200">
                  {roomStatus}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Accessible step contract */}
              <ol data-ui="check-in-progress" aria-label="Tiến trình check-in" className="sr-only">
                <li>1. Quét giấy tờ</li>
                <li>2. Kiểm tra</li>
                <li>3. Hoàn tất</li>
              </ol>

              <button type="button" onClick={handleClose} className="grid min-h-[38px] min-w-[38px] place-items-center rounded-xl text-2xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none" aria-label="Đóng">
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        </header>

        {/* MAIN SCROLLABLE CONTENT */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-4 md:p-5 space-y-3.5">

          {/* SLIM STAY SETTINGS BAR (No duplicate room name!) */}
          <section data-ui="room-summary" className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 sm:px-4 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="text-base sm:text-lg font-black text-slate-900">Liên hệ & Hạn trả phòng</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="ciw-phone" className="text-base font-bold text-slate-800 whitespace-nowrap">SĐT khách:</label>
                <input
                  id="ciw-phone"
                  type="tel"
                  inputMode="tel"
                  value={fields.guestPhone}
                  onChange={(event) => setFields({ ...fields, guestPhone: event.target.value })}
                  className="h-11 w-40 sm:w-48 rounded-lg border border-slate-300 bg-white px-3.5 text-base sm:text-lg font-bold text-slate-950 shadow-2xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  placeholder="0901234567"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="ciw-checkout" className="text-base font-bold text-slate-800 whitespace-nowrap">
                  Dự kiến trả phòng <span className="text-red-600">*</span>:
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="w-38 sm:w-44">
                    <VnDateInput
                      id="ciw-checkout"
                      required
                      value={checkoutDate}
                      onChange={(newDateIso) => {
                        if (newDateIso) {
                          setFields({ ...fields, plannedCheckOutAt: `${newDateIso}T${checkoutTime || "12:00"}` });
                        } else {
                          setFields({ ...fields, plannedCheckOutAt: "" });
                        }
                      }}
                      className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base sm:text-lg font-bold text-slate-950 shadow-2xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      placeholder="ngày/tháng/năm"
                    />
                  </div>
                  <input
                    type="time"
                    value={checkoutTime}
                    onChange={(e) => {
                      const newTime = e.target.value;
                      setFields({ ...fields, plannedCheckOutAt: `${checkoutDate || new Date().toISOString().slice(0, 10)}T${newTime}` });
                    }}
                    className="h-11 w-24 rounded-lg border border-slate-300 bg-white px-2.5 text-base sm:text-lg font-bold text-slate-950 shadow-2xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-center"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* UNIFIED IDENTITY DOCUMENT INTAKE PANEL */}
          <div className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3 space-y-2.5 lg:grid-cols-[minmax(0,3fr)_minmax(340px,2.2fr)] shadow-2xs">
            <span className="sr-only">Dữ liệu giấy tờ chỉ xử lý tạm thời</span>

            {/* Control Bar: Guest Slot Selector (Left) + Mode Switch (Right) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Left: Guest Slot Selector */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm font-bold">
                <span id="identity-heading" className="flex items-center gap-1.5 text-slate-800 font-bold px-1">
                  <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
                  CCCD / hộ chiếu — Vị trí quét:
                </span>
                <button
                  type="button"
                  onClick={() => setActiveGuestIndex(0)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold transition-all ${
                    activeGuestIndex === 0
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100/80"
                  }`}
                  aria-pressed={activeGuestIndex === 0}
                >
                  <span>Khách 1 (Đại diện)</span>
                  {fields.guestDisplayName ? (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-black text-emerald-600 shadow-2xs" title="Đã có thông tin">✓</span>
                  ) : null}
                </button>
                {occupants.map((occ, idx) => {
                  const slotIdx = idx + 1;
                  const active = activeGuestIndex === slotIdx;
                  const hasInfo = Boolean(occ.fullName?.trim() || occ.identityNumber?.trim());
                  return (
                    <button
                      key={slotIdx}
                      type="button"
                      onClick={() => setActiveGuestIndex(slotIdx)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold transition-all ${
                        active
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100/80"
                      }`}
                      aria-pressed={active}
                    >
                      <span>Khách {slotIdx + 1}</span>
                      {hasInfo ? (
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-700" title="Đã có thông tin">✓</span>
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    handleAddOccupant();
                    setActiveGuestIndex(occupants.length + 1);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-blue-400 bg-blue-50/80 px-2.5 py-1.5 text-xs sm:text-sm font-bold text-blue-700 hover:bg-blue-100 transition-all"
                >
                  <span className="text-base leading-none">+</span>
                  <span>Thêm người ở cùng</span>
                </button>
              </div>

              {/* Right: Validation status badge + Segmented Mode Switch */}
              <div className="flex items-center gap-2">
                {currentGuestCapture ? (
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 border border-blue-200">
                    {currentGuestCapture.documentKind
                      ? currentGuestCapture.mrzValid ? "MRZ hợp lệ" : "MRZ cần kiểm tra"
                      : previewModel?.chipVerified ? "Chip và SOD đã xác thực" : "Đã đọc thông tin — chưa xác thực chip"}
                  </span>
                ) : null}

                {/* Segmented Mode Switch */}
                <div className="inline-flex items-center rounded-xl bg-slate-200/80 p-1 text-xs sm:text-sm font-bold shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setIntakeMethod("upload")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all ${
                      intakeMethod === "upload"
                        ? "bg-white text-blue-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    aria-pressed={intakeMethod === "upload"}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>Chọn file</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntakeMethod("mobile")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all ${
                      intakeMethod === "mobile"
                        ? "bg-white text-blue-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    aria-pressed={intakeMethod === "mobile"}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="5" y="2" width="14" height="20" rx="3" strokeWidth={2} />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
                    </svg>
                    <span>Quét bằng điện thoại</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Active intake action banner */}
            <div className="w-full">
              <div className={intakeMethod === "upload" ? "block" : "hidden"}>
                <DesktopDocumentOcrUpload onCaptures={handleDocumentCaptures} />
              </div>

              <div className={intakeMethod === "mobile" ? "block" : "hidden"}>
                <section className="min-w-0" aria-label="Điện thoại quét QR CCCD">
                  <MobileCccdScan
                    hotelId={hotelId}
                    onCapture={handleCapture}
                    targetContext={`${room.id}:${activeGuestIndex}`}
                    targetLabel={`Phòng ${room.roomNumber} — Khách ${activeGuestIndex + 1}`}
                  />
                </section>
              </div>

              {previewModel ? <CccdPreview model={previewModel} /> : null}
            </div>
          </div>

          {/* MULTI-GUEST INLINE EDITABLE GRID (No Status Column, Larger Font) */}
          <form data-ui="stay-form" id="ciw-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...fields, occupants: filterExtraOccupants(occupants, fields) }); }} className="space-y-2.5">
            {submitError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800" role="alert" aria-live="assertive">{submitError}</div> : null}

            {/* Table Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <h3 className="text-base sm:text-lg font-black text-slate-900">Danh sách khách</h3>
                <span className="rounded-full bg-blue-50 px-3 py-0.5 text-sm font-bold text-blue-700 border border-blue-100">
                  {totalGuests} khách
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên, số CCCD / Hộ chiếu..."
                  className="h-11 min-w-[340px] w-96 sm:w-[440px] md:w-[500px] rounded-lg border border-slate-300 bg-slate-50 px-3.5 text-sm sm:text-base text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 font-medium"
                />
                <button
                  type="button"
                  onClick={() => {
                    handleAddOccupant();
                    setActiveGuestIndex(occupants.length + 1);
                  }}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-blue-600 bg-white px-4 text-base font-bold text-blue-700 hover:bg-blue-50 transition-colors shadow-2xs"
                >
                  <span>+ Thêm khách</span>
                </button>
                {selectedOccupants.size === 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const [selectedIdx] = Array.from(selectedOccupants);
                      handleSetAsPrimary(selectedIdx);
                    }}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 text-base font-bold text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs"
                    title="Đặt khách này làm khách đại diện"
                  >
                    <span className="text-amber-600">⭐</span>
                    <span>Đặt làm đại diện</span>
                  </button>
                ) : null}
                {selectedOccupants.size > 0 ? (
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="inline-flex h-11 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3.5 text-base font-bold text-red-700 hover:bg-red-100 transition-colors"
                  >
                    <span>Xóa ({selectedOccupants.size})</span>
                  </button>
                ) : null}
              </div>
            </div>

            {/* Grid Table: Clean, large readable text, No Status Column */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left text-base text-slate-900">
                <thead className="border-b-2 border-slate-200 bg-slate-100/90 font-black text-slate-900 whitespace-nowrap text-base">
                  <tr>
                    <th className="w-9 px-3.5 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={occupants.length > 0 && selectedOccupants.size === occupants.length}
                        onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="w-12 px-2.5 py-3.5 font-black text-slate-900">#</th>
                    <th className="min-w-[190px] px-3.5 py-3.5 font-black text-slate-900">Họ và tên <span className="text-red-600">*</span></th>
                    <th className="min-w-[150px] px-3.5 py-3.5 font-black text-slate-900">Số CCCD / Hộ chiếu</th>
                    <th className="min-w-[140px] px-3.5 py-3.5 font-black text-slate-900">Quốc tịch</th>
                    <th className="min-w-[190px] px-3.5 py-3.5 font-black text-slate-900">Quê quán / Địa chỉ</th>
                    <th className="w-40 px-3.5 py-3.5 font-black text-slate-900">
                      Ngày sinh <span className="block text-[11px] font-normal text-slate-400">ngày/tháng/năm</span>
                    </th>
                    <th className="w-32 px-3.5 py-3.5 font-black text-slate-900">Giới tính</th>
                    <th className="w-14 px-2.5 py-3.5 text-center font-black text-slate-900">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Row 1: Primary Guest */}
                  {showPrimary ? (
                    <tr className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-3 py-2 text-center text-slate-400">—</td>
                      <td className="px-2 py-2 font-bold text-slate-700">
                        1
                        <span className="block text-[11px] font-bold text-blue-600">Đại diện</span>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          id="ciw-name"
                          type="text"
                          required
                          value={fields.guestDisplayName}
                          onChange={(e) => setFields({ ...fields, guestDisplayName: e.target.value })}
                          className={cellInputClass}
                          placeholder="NGUYỄN VĂN A"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          id="ciw-id"
                          type="text"
                          value={fields.guestIdentityNumber || ""}
                          onChange={(e) => setFields({ ...fields, guestIdentityNumber: e.target.value })}
                          className={`${cellInputClass} font-mono uppercase`}
                          placeholder="Số CCCD / Hộ chiếu"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          id="ciw-nationality"
                          type="text"
                          value={fields.guestNationality || ""}
                          onChange={(e) => setFields({ ...fields, guestNationality: e.target.value })}
                          className={cellInputClass}
                          placeholder="Việt Nam"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          id="ciw-residence"
                          type="text"
                          value={fields.guestResidencePlace || ""}
                          onChange={(e) => setFields({ ...fields, guestResidencePlace: e.target.value })}
                          className={cellInputClass}
                          placeholder="Quê quán / Địa chỉ"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <VnDateInput
                          id="ciw-dob"
                          value={fields.guestDateOfBirth || ""}
                          onChange={(val) => setFields({ ...fields, guestDateOfBirth: val })}
                          className={cellInputClass}
                          placeholder="ngày/tháng/năm"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          id="ciw-gender"
                          value={fields.guestGender || ""}
                          onChange={(e) => setFields({ ...fields, guestGender: e.target.value })}
                          className={cellSelectClass}
                        >
                          <option value="">-- Chọn --</option>
                          <option value="Nam">Nam</option>
                          <option value="Nữ">Nữ</option>
                          <option value="Khác">Khác</option>
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setFields((f) => ({ ...f, guestDisplayName: "", guestIdentityNumber: "", guestDateOfBirth: "", guestGender: "", guestResidencePlace: "" }))}
                          className="grid h-8 w-8 place-items-center mx-auto rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          title="Làm trống khách đại diện"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ) : null}

                  {/* Rows 2..N: Occupants */}
                  {occupants.map((occ, occIdx) => {
                    const slotIdx = occIdx + 1;
                    const matchOcc = !query || (occ.fullName || "").toLowerCase().includes(query) || (occ.identityNumber || "").toLowerCase().includes(query) || (occ.residencePlace || "").toLowerCase().includes(query);
                    if (!matchOcc) return null;
                    const isChecked = selectedOccupants.has(occIdx);

                    return (
                      <tr key={slotIdx} className={`hover:bg-slate-50/60 transition-colors ${isChecked ? "bg-blue-50/40" : ""}`}>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelectOne(occIdx)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-2 py-2 font-bold text-slate-600">
                          <div className="flex flex-col items-start gap-1">
                            <span>{slotIdx + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleSetAsPrimary(occIdx)}
                              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors whitespace-nowrap"
                              title="Đặt khách này làm khách đại diện"
                            >
                              <span>⭐ Đặt làm đại diện</span>
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            id={`occ-name-${slotIdx}`}
                            type="text"
                            required
                            value={occ.fullName || ""}
                            onChange={(e) => handleOccupantChange(occIdx, "fullName", e.target.value)}
                            className={cellInputClass}
                            placeholder="TRẦN THỊ B"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            id={`occ-id-${slotIdx}`}
                            type="text"
                            value={occ.identityNumber || ""}
                            onChange={(e) => handleOccupantChange(occIdx, "identityNumber", e.target.value)}
                            className={`${cellInputClass} font-mono uppercase`}
                            placeholder="Số CCCD / Hộ chiếu"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            id={`occ-nationality-${slotIdx}`}
                            type="text"
                            value={occ.nationality || ""}
                            onChange={(e) => handleOccupantChange(occIdx, "nationality", e.target.value)}
                            className={cellInputClass}
                            placeholder="Việt Nam"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            id={`occ-residence-${slotIdx}`}
                            type="text"
                            value={occ.residencePlace || ""}
                            onChange={(e) => handleOccupantChange(occIdx, "residencePlace", e.target.value)}
                            className={cellInputClass}
                            placeholder="Quê quán / Địa chỉ"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <VnDateInput
                            id={`occ-dob-${slotIdx}`}
                            value={occ.dateOfBirth || ""}
                            onChange={(val) => handleOccupantChange(occIdx, "dateOfBirth", val)}
                            className={cellInputClass}
                            placeholder="ngày/tháng/năm"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            id={`occ-gender-${slotIdx}`}
                            value={occ.gender || ""}
                            onChange={(e) => handleOccupantChange(occIdx, "gender", e.target.value)}
                            className={cellSelectClass}
                          >
                            <option value="">-- Chọn --</option>
                            <option value="Nam">Nam</option>
                            <option value="Nữ">Nữ</option>
                            <option value="Khác">Khác</option>
                          </select>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveOccupant(occIdx)}
                            className="grid h-8 w-8 place-items-center mx-auto rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            title="Xóa khách này"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </form>
        </main>

        {/* FOOTER: Summary & Clean Action Buttons */}
        <footer data-ui="sticky-actions" className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-black text-slate-900">Hiển thị <strong>{totalGuests} khách</strong></span>
            <span className="sr-only">Dữ liệu giấy tờ chỉ xử lý tạm thời. Không lưu trên VPS.</span>
          </div>

          <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
            <button type="button" onClick={handleClose} className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-base font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none sm:w-auto">
              Hủy
            </button>
            <button type="submit" form="ciw-form" disabled={!canManageStays || submitState === "submitting"} className="min-h-[46px] w-full rounded-xl bg-blue-700 px-7 py-2.5 text-base font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              {submitState === "submitting" ? "Đang xử lý..." : `Hoàn tất check-in (${totalGuests} khách)`}
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
}
