"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { buildInlineDraft } from "../in-house-draft";
import { kbttResource } from "../resources/kbtt-resource";
import { sanitizeErrorMessage, type KbttReconciliationRow, type KbttCatalogItem } from "../types/kbtt-contract";

const controlClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:bg-slate-50 disabled:text-slate-600";
export const declarationColumnLabels = ["Khách", "Phòng", "Giới tính", "Ngày sinh", "Giấy tờ", "Nhận phòng", "Dự kiến trả"];

function displayDate(raw: string): string {
  if (!raw) return "—";
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);
  return match ? match[3] + "/" + match[2] + "/" + match[1] : raw;
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
    && !["SENDING", "UNKNOWN", "SUBMITTED", "CANCELLED"].includes(row.declarationStatus ?? "");
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
  function input(field: string, label: string, fallback = "", type = "text", width = "min-w-40") {
    const dateField = type === "date" || type === "datetime-local";
    const raw = value(field);
    if (!editable || field === "soPhong") return <span className="block max-w-xs break-words">{dateField ? displayDate(raw || fallback) : raw || fallback || "—"}</span>;
    return <input aria-label={label + (field === "ngayDenCsltStr" || field === "ngayDiDuKienStr" ? " khai báo BCA" : "") + " · " + row.fullName} required type="text"
      inputMode={dateField ? "numeric" : undefined} placeholder={dateField ? "dd/mm/yyyy" : undefined}
      value={dateField ? raw ? displayDate(raw) : "" : raw} maxLength={dateField ? 10 : field === "hoTen" ? 120 : undefined} disabled={busy} className={controlClass + " " + width}
      onBlur={() => void saveRow()}
      onChange={(event) => {
        let next = event.target.value;
        if (dateField) {
          const match = next.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (match) {
            next = match[3] + "-" + match[2] + "-" + match[1];
            if (type === "datetime-local") next += " " + (String(row.draftPayload?.[field] ?? "").match(/[ T](\d{2}:\d{2}:\d{2})/)?.[1] ?? "00:00:00");
          }
        }
        update(field, next);
      }} />;
  }

  function select(field: string, label: string, options: Array<{ value: string; label: string }>, numeric = false) {
    const current = value(field);
    if (!editable) return <span>{options.find((option) => option.value === current)?.label ?? (current || "—")}</span>;
    return <select aria-label={`${label}${field === "ngayDenCsltStr" || field === "ngayDiDuKienStr" ? " khai báo BCA" : ""} · ${row.fullName}`} required value={current} disabled={busy} className={`${controlClass} min-w-36`}
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
    <td className="p-3"><div className="min-w-60">{input("hoTen", "Họ tên", row.fullName)}</div></td>
    <td className="p-3">{input("soPhong", "Phòng", row.roomNumber ?? "", "text", "min-w-24")}</td>
    <td className="p-3">{select("gioiTinh", "Giới tính", [{ value: "M", label: "Nam" }, { value: "F", label: "Nữ" }])}</td>
    <td className="p-3"><div className="space-y-2">{foreign ? select("loaiNgayThangNamSinh", "Độ chính xác ngày sinh", [{ value: "D", label: "Đủ ngày tháng năm" }, { value: "Y", label: "Chỉ biết năm" }]) : null}{input("ngayThangNamSinhStr", "Ngày sinh", "", "date")}</div></td>
    <td className="p-3"><div className="space-y-2">{!foreign ? select("loaiGiayTo", "Loại giấy tờ", catalogOptions(documents.data), true) : null}{input(foreign ? "soHoChieu" : "soGiayTo", foreign ? "Hộ chiếu" : "Số giấy tờ", row.identityNumber ?? "")}</div></td>
    <td className="p-3">{input("ngayDenCsltStr", "Nhận phòng", row.checkedInAt ?? "", "datetime-local", "min-w-60")}</td>
    <td className="p-3">{input("ngayDiDuKienStr", "Dự kiến trả", row.plannedCheckOutAt ?? "", "datetime-local", "min-w-60")}</td>
    {foreign ? <td className="p-3">{select("quocTich", "Quốc tịch", catalogOptions(nationalities.data))}</td> : null}
    {foreign ? <td className="p-3">{input("thoiHanTamTruStr", "Hạn tạm trú", "", "datetime-local", "min-w-60")}</td> : null}
    <td className="p-3"><span className={row.status === "MATCHED" ? "font-semibold text-emerald-800" : "font-semibold text-slate-700"}>{row.status === "MATCHED" ? "Đã có" : row.status === "NOT_FOUND" ? "Chưa có" : "—"}</span>{row.declarationStatus === "SENDING" ? <p className="mt-1 text-sm text-slate-600">Đang gửi…</p> : null}</td>
    <td className="p-3"><div className="flex min-w-40 flex-col items-start gap-2">{busy ? <span role="status" className="text-sm text-slate-600">Đang lưu…</span> : null}{renderActions(dirty || busy)}{editable && failedCatalog ? <div role="alert" className="max-w-xs text-sm text-amber-900">Không tải được danh mục.<button type="button" className="ml-2 min-h-11 font-semibold underline" onClick={() => void failedCatalog.refetch()}>Thử lại</button></div> : null}{issue ? <p role="alert" className="max-w-xs text-sm text-amber-900">{issue}</p> : null}</div></td>
  </>;
}
