"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { formatVnDateInput, toIsoDate } from "@/features/local-biometric/components/check-in-workspace";
import { buildInlineDraft } from "../in-house-draft";
import { kbttResource } from "../resources/kbtt-resource";
import {
  getVietnamCalendarDate,
  isArrivalDayWithinBcaWindow,
  sanitizeErrorMessage,
  type KbttReconciliationRow,
  type KbttCatalogItem,
} from "../types/kbtt-contract";

const controlClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-base font-medium text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#003B2A] focus:outline-none focus:ring-1 focus:ring-[#003B2A] disabled:bg-slate-50 disabled:text-slate-500";
export const declarationColumnLabels = ["Khách", "Giới tính", "Ngày sinh", "Giấy tờ", "Nhận phòng", "Dự kiến trả"];

export function getReconciliationRowStatusBadge(row: KbttReconciliationRow): {
  label: string;
  dotColor: string;
  badgeClass: string;
} | null {
  const code = row.reason ?? row.providerMessage ?? "";
  if (row.status === "MATCHED" || row.declarationStatus === "SUBMITTED") {
    return {
      label: "Đã có trên BCA",
      dotColor: "bg-emerald-600",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  const isFailedReason =
    code === "OUT_OF_DATE_WINDOW" ||
    code === "PRIOR_DAY_MANUAL" ||
    code === "PRIOR_DAY_MANUAL_REQUIRED" ||
    code === "KBTT_TEMP_DISCONNECTED" ||
    code === "KBTT_SESSION_ENDED" ||
    code === "RECONCILIATION_REQUIRED";
  const arrivalDay = getVietnamCalendarDate(row.checkedInAt);
  const outOfWindow = Boolean(
    arrivalDay &&
    !isArrivalDayWithinBcaWindow(arrivalDay) &&
    row.declarationStatus !== "DRAFT" &&
    row.declarationStatus !== "READY" &&
    row.declarationStatus !== null
  );
  const failed =
    isFailedReason ||
    outOfWindow ||
    row.declarationStatus === "FAILED" ||
    row.declarationStatus === "UNKNOWN";
  return {
    label: failed ? "Gửi lỗi" : "Chưa có",
    dotColor: failed ? "bg-rose-500" : "bg-amber-500",
    badgeClass: failed
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-amber-200 bg-amber-50 text-amber-800",
  };
}

function displayDate(raw: string): string {
  if (!raw) return "";
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);
  return match ? match[3] + "/" + match[2] + "/" + match[1] : raw;
}

function DateInputCell({
  field,
  label,
  value,
  fallback = "",
  type,
  fullName,
  disabled,
  className,
  originalTime,
  onCommit,
  onBlurSave,
}: {
  field: string;
  label: string;
  value: string;
  fallback?: string;
  type: "date" | "datetime-local";
  fullName: string;
  disabled: boolean;
  className: string;
  originalTime?: string;
  onCommit: (field: string, next: string) => void;
  onBlurSave: () => void;
}) {
  const [text, setText] = useState(() => displayDate(value || fallback));
  const [isFocused, setIsFocused] = useState(false);
  const isDateTime = type === "datetime-local";
  const dateInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isFocused) {
      setText(displayDate(value || fallback));
    }
  }, [value, fallback, isFocused]);

  useEffect(() => {
    if (cursorRef.current !== null && textInputRef.current) {
      const pos = cursorRef.current;
      textInputRef.current.setSelectionRange(pos, pos);
      cursorRef.current = null;
    }
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const curPos = e.target.selectionStart;
    const formatted = formatVnDateInput(rawVal, text);

    if (curPos !== null) {
      const diff = formatted.length - rawVal.length;
      cursorRef.current = Math.max(0, curPos + diff);
    }

    setText(formatted);

    // Only commit intermediate date if it forms a complete 10-char date (DD/MM/YYYY)
    if (formatted.length === 10) {
      const isoDate = toIsoDate(formatted);
      if (isoDate) {
        let iso = isoDate;
        if (isDateTime) {
          iso += ` ${originalTime || "00:00:00"}`;
        }
        onCommit(field, iso);
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);

    if (/^\d{4}$/.test(text.trim())) {
      const year = text.trim();
      const isoDate = toIsoDate(`01/01/${year}`);
      if (isoDate) {
        setText(`01/01/${year}`);
        let iso = isoDate;
        if (isDateTime) iso += ` ${originalTime || "00:00:00"}`;
        onCommit(field, iso);
        onBlurSave();
        return;
      }
    }

    const isoDate = toIsoDate(text);
    if (isoDate) {
      let iso = isoDate;
      if (isDateTime) iso += ` ${originalTime || "00:00:00"}`;
      setText(displayDate(iso));
      onCommit(field, iso);
      onBlurSave();
      return;
    }

    setText(displayDate(value || fallback));
    onBlurSave();
  };

  const isoForNative = useMemo(() => {
    const fromText = toIsoDate(text);
    if (fromText) return fromText;
    const raw = value || fallback;
    if (!raw) return "";
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    return toIsoDate(raw) || "";
  }, [text, value, fallback]);

  const handleNativePickerChange = (isoVal: string) => {
    if (!isoVal) return;
    const parts = isoVal.split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const formatted = `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
      setText(formatted);
      let iso = isoVal;
      if (isDateTime) {
        iso += ` ${originalTime || "00:00:00"}`;
      }
      onCommit(field, iso);
      onBlurSave();
    }
  };

  return (
    <div className="relative flex items-center w-full group">
      <input
        ref={textInputRef}
        aria-label={`${label}${field === "ngayDenCsltStr" || field === "ngayDiDuKienStr" ? " khai báo BCA" : ""} · ${fullName}`}
        required
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        maxLength={12}
        value={text}
        disabled={disabled}
        className={`${className} font-mono text-base font-semibold tracking-wide !pl-2.5 !pr-9 text-slate-900`}
        onFocus={() => setIsFocused(true)}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
      />
      <input
        ref={dateInputRef}
        type="date"
        tabIndex={-1}
        aria-label={`Chọn ${label.toLowerCase()} trên lịch`}
        disabled={disabled}
        value={isoForNative}
        onChange={(e) => handleNativePickerChange(e.target.value)}
        className="absolute right-0 top-0 h-full w-9 opacity-0 cursor-pointer z-10 disabled:pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute right-1.5 flex h-7 w-7 pointer-events-none items-center justify-center rounded-md text-slate-400 group-hover:text-[#003B2A] transition-colors"
      >
        <VsIcon name="calendar_today" className="h-4 w-4" />
      </div>
    </div>
  );
}

export function formatIdentityNumber(val: string): string {
  const raw = String(val ?? "").replace(/\s+/g, "");
  if (!raw) return "";
  if (/^\d+$/.test(raw)) {
    return raw.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  }
  return raw.toUpperCase();
}

function IdentityInputCell({
  label,
  value,
  fallback = "",
  fullName,
  disabled,
  className,
  onCommit,
  onBlurSave,
}: {
  label: string;
  value: string;
  fallback?: string;
  fullName: string;
  disabled: boolean;
  className: string;
  onCommit: (clean: string) => void;
  onBlurSave: () => void;
}) {
  const [text, setText] = useState(() => formatIdentityNumber(value || fallback));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(formatIdentityNumber(value || fallback));
    }
  }, [value, fallback, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;
    const clean = rawInput.replace(/\s+/g, "").slice(0, 20);
    const formatted = formatIdentityNumber(clean);
    setText(formatted);
    onCommit(clean);
  };

  return (
    <input
      aria-label={`${label} · ${fullName}`}
      required
      type="text"
      value={text}
      disabled={disabled}
      className={className}
      onFocus={() => setIsFocused(true)}
      onChange={handleChange}
      onBlur={() => {
        setIsFocused(false);
        onBlurSave();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export function InHouseDeclarationCells({ hotelId, row, canManage, onUpdated, renderActions }: {
  hotelId: string; row: KbttReconciliationRow; canManage: boolean;
  onUpdated: () => Promise<void>; renderActions: (dirty: boolean) => ReactNode;
}) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const save = useMutation(resource.mutations.saveDraft.options());
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [issue, setIssue] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const editsRef = useRef<Record<string, unknown>>({});
  const saving = useRef(false);
  const foreign = row.kind === "FOREIGN";
  const editable = canManage && Boolean(row.occupantId && row.kind && row.draftPayload) && row.status !== "MATCHED"
    && !["UNKNOWN", "SUBMITTED", "CANCELLED"].includes(row.declarationStatus ?? "");
  const documents = useQuery({ ...resource.queries.catalog.options({ kind: "DOCUMENT_TYPE" }), enabled: editable && !foreign });
  const nationalities = useQuery({ ...resource.queries.catalog.options({ kind: "NATIONALITY" }), enabled: editable && foreign });
  const data = { ...(row.draftPayload ?? {}), ...edits };
  const dirty = Object.keys(edits).length > 0;
  const busy = save.isPending || reconciling;
  const value = (field: string) => String(data[field] ?? "");
  function update(field: string, next: unknown, commit = false) {
    if (saving.current) return;
    setIssue(null);
    const pending = { ...editsRef.current, [field]: next };
    if (next === row.draftPayload?.[field]) delete pending[field];
    editsRef.current = pending;
    setEdits(pending);
    if (commit) void saveRow();
  }
  function input(field: string, label: string, fallback = "", type = "text", width = "w-full") {
    const dateField = type === "date" || type === "datetime-local";
    const raw = value(field);
    const isCenter = width.includes("text-center");
    const isMono = width.includes("font-mono");
    const isIdentityField = field === "soGiayTo" || field === "soHoChieu";

    if (isIdentityField) {
      if (!editable) {
        return (
          <span className={`block text-base sm:text-lg font-bold font-mono tracking-wider text-slate-900 break-words leading-tight ${isCenter ? "text-center" : ""}`}>
            {formatIdentityNumber(raw || fallback)}
          </span>
        );
      }
      return (
        <IdentityInputCell
          label={label}
          value={raw}
          fallback={fallback}
          fullName={row.fullName}
          disabled={busy}
          className={`${controlClass} ${width} text-base font-bold font-mono tracking-wider text-slate-900`}
          onCommit={(clean) => update(field, clean)}
          onBlurSave={() => void saveRow()}
        />
      );
    }

    if (!editable || field === "soPhong") {
      return (
        <span className={`block text-base font-semibold text-slate-800 break-words leading-tight ${isCenter ? "text-center" : ""} ${isMono ? "font-mono" : ""}`}>
          {dateField ? displayDate(raw || fallback) : raw || fallback || ""}
        </span>
      );
    }
    if (dateField) {
      return (
        <DateInputCell
          field={field}
          label={label}
          value={raw}
          fallback={fallback}
          type={type as "date" | "datetime-local"}
          fullName={row.fullName}
          disabled={busy}
          className={`${controlClass} ${width}`}
          originalTime={String(row.draftPayload?.[field] ?? "").match(/[ T](\d{2}:\d{2}:\d{2})/)?.[1]}
          onCommit={(f, next) => update(f, next)}
          onBlurSave={() => void saveRow()}
        />
      );
    }
    return <input aria-label={`${label} · ${row.fullName}`} required type="text"
      value={raw} maxLength={field === "hoTen" ? 120 : undefined} disabled={busy} className={`${controlClass} ${width} text-base font-semibold`}
      onBlur={() => void saveRow()}
      onChange={(event) => update(field, event.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }} />;
  }

  function select(field: string, label: string, options: Array<{ value: string; label: string }>, numeric = false, customClass = "") {
    const current = value(field);
    const isCenter = customClass.includes("text-center");
    if (!editable) return <span className={`block text-base font-medium text-slate-800 break-words leading-tight ${isCenter ? "text-center" : ""}`}>{options.find((option) => option.value === current)?.label ?? (current || "")}</span>;
    return <select aria-label={`${label}${field === "ngayDenCsltStr" || field === "ngayDiDuKienStr" ? " khai báo BCA" : ""} · ${row.fullName}`} required value={current} disabled={busy} className={`${customClass ? `${controlClass} ${customClass}` : controlClass}`}
      onChange={(event) => update(field, numeric && event.target.value ? Number(event.target.value) : event.target.value, true)}>
      <option value="">Chọn {label.toLocaleLowerCase("vi")}</option>
      {current && !options.some((option) => option.value === current) ? <option value={current}>{current}</option> : null}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>;
  }
  const catalogOptions = (items: KbttCatalogItem[] | undefined) => (items ?? []).filter((item) => item.isActive).map((item) => ({ value: item.code, label: item.nameVi }));
  async function saveRow() {
    if (!editable || !Object.keys(editsRef.current).length || saving.current || !row.kind || !row.occupantId) return;
    saving.current = true;
    try {
      setIssue(null);
      const body = buildInlineDraft(row, editsRef.current);
      await save.mutateAsync({ occupantId: row.occupantId, body });
      setReconciling(true);
      await onUpdated();
      editsRef.current = {};
      setEdits({});
    } catch (error) { setIssue(sanitizeErrorMessage(error instanceof Error ? error.message : null) ?? "Không lưu được hồ sơ."); }
    finally { saving.current = false; setReconciling(false); }
  }
  const failedCatalog = documents.isError ? documents : nationalities.isError ? nationalities : null;
  return <>
    <td className={`px-2.5 py-2.5 align-middle text-left ${foreign ? "w-[16%] min-w-[170px]" : "w-[18%] min-w-[180px]"}`}>
      <div className="w-full min-w-0">
        {editable ? input("hoTen", "Họ tên", row.fullName) : <span className="text-sm font-bold text-slate-900 block break-words leading-tight" title={row.fullName}>{row.fullName}</span>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {row.roomNumber ? (
            <span className="inline-flex items-center rounded-md border border-[#003B2A]/20 bg-[#003B2A]/5 px-2 py-0.5 text-xs font-bold text-[#003B2A] whitespace-nowrap">
              Phòng {row.roomNumber}
            </span>
          ) : null}
          {row.groupCode ? (
            <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-xs font-bold text-purple-700 border border-purple-200/80 whitespace-nowrap">
              Đoàn #{row.groupCode}
            </span>
          ) : null}
        </div>
      </div>
    </td>
    <td className={`px-2 py-2.5 align-middle whitespace-nowrap text-center ${foreign ? "w-[6%] min-w-[75px]" : "w-[8%] min-w-[80px]"}`}>
      <div className="w-full flex justify-center text-center">
        {select("gioiTinh", "Giới tính", [{ value: "M", label: "Nam" }, { value: "F", label: "Nữ" }], false, "text-center")}
      </div>
    </td>
    <td className={`px-2 py-2.5 align-middle text-center ${foreign ? "w-[10%] min-w-[120px]" : "w-[12%] min-w-[125px]"}`}>
      <div className="w-full flex flex-col items-center justify-center gap-1 text-center">
        {foreign ? select("loaiNgayThangNamSinh", "Độ chính xác ngày sinh", [{ value: "D", label: "Đủ ngày tháng năm" }, { value: "Y", label: "Chỉ biết năm" }], false, "block h-7 w-full rounded border border-slate-200 bg-slate-50/50 px-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus:border-[#003B2A] focus:outline-none focus:ring-1 focus:ring-[#003B2A]") : null}
        {input("ngayThangNamSinhStr", "Ngày sinh", "", "date", "w-full text-center")}
      </div>
    </td>
    <td className={`px-2 py-2.5 align-middle text-center ${foreign ? "w-[14%] min-w-[140px]" : "w-[17%] min-w-[160px]"}`}>
      <div className="w-full flex flex-col items-center justify-center gap-1 text-center">
        {!foreign && editable ? select("loaiGiayTo", "Loại giấy tờ", catalogOptions(documents.data), true, "block h-8 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2 text-xs font-semibold text-slate-800 hover:border-slate-300 focus:border-[#003B2A] focus:outline-none focus:ring-1 focus:ring-[#003B2A]") : null}
        {input(foreign ? "soHoChieu" : "soGiayTo", foreign ? "Hộ chiếu" : "Số giấy tờ", row.identityNumber ?? "", "text", "block w-full font-mono !px-2 text-base text-center")}
      </div>
    </td>
    <td className={`px-2 py-2.5 align-middle whitespace-nowrap text-center ${foreign ? "w-[11%] min-w-[125px]" : "w-[13%] min-w-[130px]"}`}>
      <div className="w-full flex justify-center text-center">
        {input("ngayDenCsltStr", "Nhận phòng", row.checkedInAt ?? "", "datetime-local", "w-full text-center")}
      </div>
    </td>
    <td className={`px-2 py-2.5 align-middle whitespace-nowrap text-center ${foreign ? "w-[11%] min-w-[125px]" : "w-[13%] min-w-[130px]"}`}>
      <div className="w-full flex justify-center text-center">
        {input("ngayDiDuKienStr", "Dự kiến trả", row.plannedCheckOutAt ?? "", "datetime-local", "w-full text-center")}
      </div>
    </td>
    {foreign ? <td className="px-2 py-2.5 align-middle text-center w-[9%] min-w-[110px]"><div className="w-full flex justify-center text-center">{select("quocTich", "Quốc tịch", catalogOptions(nationalities.data), false, "text-center")}</div></td> : null}
    {foreign ? <td className="px-2 py-2.5 align-middle whitespace-nowrap text-center w-[10%] min-w-[125px]"><div className="w-full flex justify-center text-center">{input("thoiHanTamTruStr", "Hạn tạm trú", "", "datetime-local", "w-full text-center")}</div></td> : null}
    <td className={`px-2 py-2.5 align-middle whitespace-nowrap text-center ${foreign ? "w-[7%] min-w-[90px]" : "w-[9%] min-w-[100px]"}`}>
      <div className="flex flex-col items-center justify-center gap-1 text-center">
        {(() => {
          const badge = getReconciliationRowStatusBadge(row);
          if (!badge) return null;
          return (
            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold shadow-2xs ${badge.badgeClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dotColor}`} />
              <span>{badge.label}</span>
            </span>
          );
        })()}
      </div>
    </td>
    <td className={`px-2 py-2.5 align-middle whitespace-nowrap text-center ${foreign ? "w-[6%] min-w-[90px]" : "w-[10%] min-w-[100px]"}`}>
      <div className="flex flex-col items-center justify-center gap-1 text-center">
        {busy ? <span role="status" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-700 animate-pulse" />Đang lưu…</span> : null}
        {renderActions(dirty || busy)}
        {editable && failedCatalog ? <div role="alert" className="max-w-xs text-xs text-amber-800">Không tải được danh mục.<button type="button" className="ml-1 font-bold underline hover:text-amber-950" onClick={() => void failedCatalog.refetch()}>Thử lại</button></div> : null}
        {issue ? <p role="alert" className="max-w-xs text-xs font-medium text-rose-700">{issue}</p> : null}
      </div>
    </td>
  </>;
}
