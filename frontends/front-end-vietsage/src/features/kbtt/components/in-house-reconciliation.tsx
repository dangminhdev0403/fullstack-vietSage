"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kbttResource } from "../resources/kbtt-resource";
import { DeclarationModal } from "./kbtt-declarations-page";
import {
  canRetryReconciledGuest, getKbttSubmissionIssue, sanitizeErrorMessage,
  type KbttDeclarationListItem, type KbttReconciliationRow,
} from "../types/kbtt-contract";

const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 text-base font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-60";
const states = {
  MATCHED: { label: "Đã có trên BCA", className: "text-emerald-800" },
  NOT_FOUND: { label: "Chưa thấy trên BCA", className: "text-slate-700" },
  REVIEW: { label: "Cần kiểm tra", className: "text-amber-900" },
} as const;
function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(parsed);
}
function LocalGuestDetail({ hotelId, row, canManage, onClose, onUpdated }: {
  hotelId: string; row: KbttReconciliationRow; canManage: boolean; onClose: () => void; onUpdated: () => void;
}) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const detail = useQuery({ ...resource.queries.declarationDetail.options({ occupantId: row.occupantId! }), retry: false });
  if (!detail.data || detail.isError) return <div role={detail.isError ? "alert" : "status"} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4 text-base">
    <span>{detail.isError ? "Không tải được hồ sơ khách." : "Đang tải hồ sơ…"}</span>
    {detail.isError ? <button type="button" className={buttonClass} onClick={() => void detail.refetch()}>Thử lại</button> : null}
    <button type="button" className={buttonClass} onClick={onClose}>Đóng</button>
  </div>;
  const { occupant, declaration, derivedStatus } = detail.data;
  const summary: KbttDeclarationListItem = {
    ...occupant, occupantId: occupant.id, roomId: row.roomId, roomNumber: row.roomNumber,
    documentType: row.documentType, derivedStatus, stayStatus: "", reservationCode: null,
    checkedInAt: row.checkedInAt, plannedCheckInAt: row.checkedInAt ?? "", plannedCheckOutAt: row.plannedCheckOutAt ?? "",
    declaration,
  };
  return <DeclarationModal hotelId={hotelId} occupantId={occupant.id} occupantSummary={summary}
    canManage={canManage && canRetryReconciledGuest(row)} retryFailedOnly connectionIssue={null}
    onClose={onClose} onUpdated={onUpdated} />;
}

export function InHouseReconciliation({ hotelId, canManage, canViewRooms, baseRoutePrefix, initialQuery = "" }: {
  hotelId: string; canManage: boolean; canViewRooms: boolean; baseRoutePrefix: string; initialQuery?: string;
}) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const queryClient = useQueryClient();
  const local = useQuery({
    ...resource.queries.reconciliationLocal.options(), enabled: Boolean(hotelId), retry: false,
    refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 0, gcTime: 0,
  });
  const query = useQuery({
    ...resource.queries.reconciliation.options(), enabled: Boolean(hotelId), retry: false,
    refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 0, gcTime: 0,
  });
  const refresh = useMutation(resource.mutations.refreshReconciliation.options());
  const submit = useMutation(resource.mutations.submit.options());
  const [kind, setKind] = useState<"VIETNAMESE" | "FOREIGN" | "UNCLASSIFIED">("VIETNAMESE");
  const [search, setSearch] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<KbttReconciliationRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const sending = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const data = query.data ?? local.data;
  const pending = query.isFetching || refresh.isPending;
  const rows = data?.items ?? [];
  const counts = {
    VIETNAMESE: rows.filter((row) => row.kind === "VIETNAMESE").length,
    FOREIGN: rows.filter((row) => row.kind === "FOREIGN").length,
    UNCLASSIFIED: rows.filter((row) => row.kind === null).length,
  };
  const needle = search.trim().toLocaleLowerCase("vi");
  const filtered = rows.filter((row) => (kind === "UNCLASSIFIED" ? row.kind === null : row.kind === kind)
    && (!needle || [row.fullName, row.roomNumber, row.groupCode, row.identityNumber].some((value) => value?.toLocaleLowerCase("vi").includes(needle))));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const selectedCurrent = selected ? rows.find((row) => row.id === selected.id) : null;
  const ready = query.isSuccess && !query.isError && !refresh.isError && !pending;

  async function refreshBoth() {
    if (pending) return;
    setIssue(null);
    try {
      const result = await refresh.mutateAsync();
      resource.queries.reconciliation.set(queryClient, undefined, result);
    } catch (error) { setIssue(sanitizeErrorMessage(error instanceof Error ? error.message : null)); }
  }
  async function retry(row: KbttReconciliationRow) {
    if (!canManage || !ready || sending.current || !canRetryReconciledGuest(row)) return;
    sending.current = true; setIssue(null);
    try {
      const result = await submit.mutateAsync({ occupantId: row.occupantId! });
      setIssue(getKbttSubmissionIssue(result));
    } catch (error) { setIssue(sanitizeErrorMessage(error instanceof Error ? error.message : null)); }
    finally { sending.current = false; }
  }
  function closeDetail() { setSelected(null); trigger.current?.focus(); }
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Khách đang lưu trú" aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Nhóm khách">
        {([ ["VIETNAMESE", "Khách Việt Nam"], ["FOREIGN", "Khách nước ngoài"], ...(counts.UNCLASSIFIED ? [["UNCLASSIFIED", "Cần phân loại"]] : []) ] as Array<[typeof kind, string]>).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={kind === value}
          onClick={() => { setKind(value); setPage(1); }} className={kind === value ? buttonClass + " border-emerald-800 bg-emerald-50 text-emerald-900" : buttonClass}>{label} ({data ? counts[value] : "…"})</button>)}
      </div>
      <button type="button" className={buttonClass} disabled={pending} onClick={() => void refreshBoth()}>{pending ? "Đang đối soát cả VN và NNN…" : "Làm mới"}</button>
    </div>
    {data ? <p className="text-sm text-slate-600">{data.checkedAt ? `Đối soát gần nhất: ${date(data.checkedAt)}` : "Chưa hoàn tất đối soát cả hai nhóm khách."}</p> : null}
    {data ? <div className="space-y-2">{([ ["VIETNAMESE", "Khách Việt Nam"], ["FOREIGN", "Khách nước ngoài"] ] as const).map(([value, label]) => data.sources[value].state !== "COMPLETE" ? <p key={value} role={data.sources[value].state === "PENDING" && pending ? "status" : "alert"} className="text-pretty text-base text-amber-900">{label}: {data.sources[value].error?.message ?? (data.sources[value].state === "PENDING" ? pending ? "Đang đối soát BCA…" : "Chưa đối soát được BCA." : data.sources[value].state === "NEEDS_LOGIN" ? "Cần đăng nhập lại BCA." : data.sources[value].state === "NOT_CONNECTED" ? "Chưa kết nối BCA." : "Chưa đọc đủ dữ liệu BCA.")}</p> : null)}</div> : null}
    {query.isError ? <p role="alert" className="text-pretty text-base text-amber-900">Không tải được dữ liệu đối soát. {query.data ? "Đang hiển thị kết quả lần trước." : local.data ? "Đang hiển thị khách VietSage." : ""}</p> : null}
    {issue ? <p role="alert" className="text-pretty text-base text-amber-900">{issue}</p> : null}
    <label className="block max-w-md text-base font-medium text-slate-800">Tìm khách, giấy tờ, phòng hoặc đoàn
      <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800" />
    </label>
    {selected && selected.occupantId ? <LocalGuestDetail key={selected.occupantId} hotelId={hotelId} row={selectedCurrent ?? selected} canManage={canManage && ready && selectedCurrent !== null}
      onClose={closeDetail} onUpdated={() => { void refreshBoth(); }} /> : null}
    {!data && (query.isPending || local.isPending) ? <p role="status" className="py-8 text-center text-base text-slate-600">Đang tải khách và đối soát cả hai nhóm BCA…</p> : !visible.length ? <p className="py-8 text-center text-base text-slate-600">{query.isError ? "Chưa có dữ liệu để hiển thị." : "Không có khách phù hợp."}</p> : <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] text-left text-base">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr><th scope="col" className="p-3 font-semibold">Khách / Giấy tờ</th><th scope="col" className="p-3 font-semibold">Phòng / Đoàn</th><th scope="col" className="p-3 font-semibold">Nhận – dự kiến trả</th><th scope="col" className="p-3 font-semibold">BCA</th><th scope="col" className="p-3 font-semibold">Thao tác</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{visible.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/60">
          <td className="p-3"><div className="max-w-sm break-words font-semibold">{row.occupantId ? <button type="button" className="min-h-11 text-left underline decoration-slate-300 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2" onClick={(event) => { trigger.current = event.currentTarget; setSelected(row); }}>{row.fullName}</button> : row.fullName}</div><div className="text-sm text-slate-600">{row.identityNumber ?? "Chưa có giấy tờ"}{row.source === "BCA_ONLY" ? " · Chỉ có trên BCA" : ""}</div></td>
          <td className="p-3">{canViewRooms && row.roomId && row.source === "VIETSAGE" ? <Link className="inline-flex min-h-11 items-center font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2" href={`${baseRoutePrefix}/${encodeURIComponent(hotelId)}/rooms?q=${encodeURIComponent(row.roomNumber ?? "")}`}>{row.roomNumber ?? "—"}</Link> : <span>{row.roomNumber ?? "—"}</span>}{row.groupCode ? <div className="text-sm text-slate-600">{row.groupCode}</div> : null}</td>
          <td className="p-3"><div className="whitespace-nowrap">{date(row.checkedInAt)}</div><div className="mt-1 whitespace-nowrap text-sm text-slate-600">{date(row.plannedCheckOutAt)}</div></td>
          <td className="p-3"><span className={row.status ? states[row.status].className + " font-semibold" : "text-slate-600"}>{row.status ? states[row.status].label : "—"}</span>{row.reason ? <p className="mt-1 max-w-sm text-pretty text-sm text-slate-600">{row.reason}</p> : null}{row.declarationStatus === "SENDING" ? <p className="mt-1 text-sm text-slate-600">Đang gửi…</p> : null}</td>
          <td className="p-3">{canManage && canRetryReconciledGuest(row) ? <button type="button" className={buttonClass} disabled={!ready || submit.isPending} onClick={() => void retry(row)}>{submit.isPending ? "Đang gửi…" : "Gửi lại BCA"}</button> : row.source === "BCA_ONLY" ? <details open={expanded === row.id} onToggle={(event) => { if (event.currentTarget.open) setExpanded(row.id); }}><summary className="min-h-11 cursor-pointer py-2 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2">Chi tiết</summary><dl className="mt-2 min-w-48 space-y-2 text-sm"><div><dt className="text-slate-600">Quốc tịch</dt><dd>{row.nationality ?? "—"}</dd></div><div><dt className="text-slate-600">Ngày đến</dt><dd>{date(row.checkedInAt)}</dd></div><div><dt className="text-slate-600">Dự kiến trả</dt><dd>{date(row.plannedCheckOutAt)}</dd></div></dl></details> : null}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {totalPages > 1 ? <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4" aria-label="Phân trang khách"><button type="button" className={buttonClass} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Trang trước</button><span className="text-base text-slate-700">{currentPage}/{totalPages} · {filtered.length} khách</span><button type="button" className={buttonClass} disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Trang sau</button></nav> : null}
  </section>;
}
