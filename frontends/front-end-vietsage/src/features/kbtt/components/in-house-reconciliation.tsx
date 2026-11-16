"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kbttResource } from "../resources/kbtt-resource";
import { InHouseBcaControls } from "./in-house-bca-status";
import { InHouseDeclarationCells, declarationColumnLabels } from "./in-house-declaration-cells";
import { DeclarationModal } from "./kbtt-declarations-page";
import {
  canRetryReconciledGuest, getKbttSubmissionIssue, sanitizeErrorMessage,
  type KbttDeclarationListItem, type KbttReconciliationRow,
} from "../types/kbtt-contract";

const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 text-base font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-60";
const states = {
  MATCHED: { label: "Đã có", className: "text-emerald-800" },
  NOT_FOUND: { label: "Chưa có", className: "text-slate-700" },
} as const;
function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}
function LocalGuestDetail({ hotelId, row, canManage, sendBlockedReason, verifyBeforeSubmit, onClose, onUpdated }: {
  hotelId: string; row: KbttReconciliationRow; canManage: boolean; sendBlockedReason: string | null; verifyBeforeSubmit: () => Promise<void>; onClose: () => void; onUpdated: () => void;
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
    canManage={canManage && row.status !== "MATCHED"} connectionIssue={null} sendBlockedReason={sendBlockedReason} verifyBeforeSubmit={verifyBeforeSubmit}
    onClose={onClose} onUpdated={onUpdated} />;
}

function BcaGuestDetailModal({ row, onClose }: {
  row: KbttReconciliationRow; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const fields = [
    ["Giấy tờ", row.identityNumber], ["Quốc tịch", row.nationality],
    ["Phòng", row.roomNumber], ["Đoàn", row.groupCode],
    ["Nhận phòng", date(row.checkedInAt)],
    [row.checkedOutAt ? "Trả phòng" : "Dự kiến trả", date(row.checkedOutAt ?? row.plannedCheckOutAt)],
    ["BCA", row.status === "MATCHED" || row.status === "NOT_FOUND" ? states[row.status].label : null],
    ["Đối chiếu", row.reason], ["Lỗi gửi", row.providerMessage],
  ].filter(([, value]) => Boolean(value));
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
      <div className="min-w-0"><h2 id={titleId} className="break-words text-xl font-bold">{row.fullName}</h2>
        {row.source === "BCA_ONLY" ? <p className="mt-1 text-sm text-slate-600">Chỉ có trên BCA · {row.checkedOutAt ? "Đã trả phòng" : "Đang ở"}</p> : null}</div>
      <button autoFocus type="button" className={buttonClass} onClick={onClose}>Đóng</button>
    </div>
    <dl className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 break-words text-base font-medium">{value}</dd></div>)}</dl>
  </dialog>;
}

export function InHouseReconciliation({ hotelId, canManage, canConfigureKbtt = false, initialQuery = "" }: {
  hotelId: string; canManage: boolean; canConfigureKbtt?: boolean; initialQuery?: string;
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
  const [issue, setIssue] = useState<string | null>(null);
  const sending = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
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
  const ready = query.isSuccess && !query.isError && !refresh.isError && !pending
    && query.data.sources.VIETNAMESE.state === "COMPLETE" && query.data.sources.FOREIGN.state === "COMPLETE";

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
  function openDetail(row: KbttReconciliationRow, element: HTMLElement) { trigger.current = element; setSelected(row); }
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Khách đang lưu trú" aria-busy={pending}>
    <InHouseBcaControls hotelId={hotelId} canManage={canConfigureKbtt} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Nhóm khách">
        {([ ["VIETNAMESE", "Khách Việt Nam"], ["FOREIGN", "Khách nước ngoài"], ...(counts.UNCLASSIFIED ? [["UNCLASSIFIED", "Cần phân loại"]] : []) ] as Array<[typeof kind, string]>).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={kind === value}
          onClick={() => { setKind(value); setPage(1); }} className={kind === value ? buttonClass + " border-emerald-800 bg-emerald-50 text-emerald-900" : buttonClass}>{label} ({data ? counts[value] : "…"})</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={pending} onClick={() => void refreshBoth()}>Kiểm tra kết nối BCA</button>
        <button type="button" className={buttonClass} disabled={pending} onClick={() => void refreshBoth()}>{pending ? "Đang kiểm tra và đối soát…" : "Làm mới"}</button>
      </div>
    </div>
    {data ? <p className="text-sm text-slate-600">{data.checkedAt ? `Đối soát gần nhất: ${date(data.checkedAt)}` : "Chưa hoàn tất đối soát cả hai nhóm khách."}</p> : null}
    {data ? <div className="space-y-2">{([ ["VIETNAMESE", "Khách Việt Nam"], ["FOREIGN", "Khách nước ngoài"] ] as const).map(([value, label]) => data.sources[value].state !== "COMPLETE" ? <p key={value} role={data.sources[value].state === "PENDING" && pending ? "status" : "alert"} className="text-pretty text-base text-amber-900">{label}: {data.sources[value].error?.message ?? (data.sources[value].state === "PENDING" ? pending ? "Đang đối soát BCA…" : "Chưa đối soát được BCA." : data.sources[value].state === "NEEDS_LOGIN" ? "Cần đăng nhập lại BCA." : data.sources[value].state === "NOT_CONNECTED" ? "Chưa kết nối BCA." : "Chưa đọc đủ dữ liệu BCA.")}</p> : null)}</div> : null}
    {query.isError ? <p role="alert" className="text-pretty text-base text-amber-900">Không tải được dữ liệu đối soát. {query.data ? "Đang hiển thị kết quả lần trước." : local.data ? "Đang hiển thị khách VietSage." : ""}</p> : null}
    {issue ? <p role="alert" className="text-pretty text-base text-amber-900">{issue}</p> : null}
    <label className="block max-w-md text-base font-medium text-slate-800">Tìm khách, giấy tờ, phòng hoặc đoàn
      <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800" />
    </label>
    {selected && !selected.occupantId ? <BcaGuestDetailModal row={selectedCurrent ?? selected} onClose={closeDetail} /> : null}
    {selected && selected.occupantId ? <LocalGuestDetail key={selected.occupantId} hotelId={hotelId} row={selectedCurrent ?? selected} canManage={canManage && Boolean(selectedCurrent)}
      sendBlockedReason={!ready ? "Cần đối soát đầy đủ BCA trước khi gửi." : !selectedCurrent || !canRetryReconciledGuest(selectedCurrent) ? "Chưa đủ điều kiện gửi: kiểm tra hồ sơ hoặc cấu hình cho phép gửi BCA." : null}
      verifyBeforeSubmit={async () => {
        const result = await queryClient.fetchQuery({ ...resource.queries.reconciliation.options(), staleTime: 0 });
        const current = result.items.find((row) => row.occupantId === selected.occupantId);
        if (result.sources.VIETNAMESE.state !== "COMPLETE" || result.sources.FOREIGN.state !== "COMPLETE" || !current || !canRetryReconciledGuest(current)) throw new Error("Chưa thể gửi: cần xác nhận hồ sơ chưa có trên BCA và luồng gửi đang được bật.");
      }}
      onClose={closeDetail} onUpdated={() => { void refreshBoth(); }} /> : null}
    {!data && (query.isPending || local.isPending) ? <p role="status" className="py-8 text-center text-base text-slate-600">Đang tải khách và đối soát cả hai nhóm BCA…</p> : !visible.length ? <p className="py-8 text-center text-base text-slate-600">{query.isError ? "Chưa có dữ liệu để hiển thị." : "Không có khách phù hợp."}</p> : <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-base">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr>{[...declarationColumnLabels, ...(kind === "FOREIGN" ? ["Quốc tịch", "Hạn tạm trú"] : []), "BCA", "Thao tác"].map((label) => <th key={label} scope="col" className="p-3 font-semibold">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{visible.map((row) => <tr key={row.id} tabIndex={0} aria-label={"Chi tiết " + row.fullName}
          onClick={(event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea, label")) openDetail(row, event.currentTarget); }}
          onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDetail(row, event.currentTarget); } }}
          className="cursor-pointer align-middle hover:bg-slate-50/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-800">
          <InHouseDeclarationCells key={row.id} hotelId={hotelId} row={row} canManage={canManage}
            onUpdated={async () => {
              const options = resource.queries.reconciliation.options();
              const result = await queryClient.ensureQueryData(options);
              if (result.sources.VIETNAMESE.state !== "COMPLETE" || result.sources.FOREIGN.state !== "COMPLETE") throw new Error("Đã lưu hồ sơ; chưa đối soát đầy đủ BCA. Hãy kiểm tra kết nối trước khi gửi.");
            }}
            renderActions={(dirty) => canManage && row.occupantId && row.status !== "MATCHED" && !["SENDING", "UNKNOWN", "SUBMITTED", "CANCELLED"].includes(row.declarationStatus ?? "") ? <button type="button" className={buttonClass}
              title={dirty ? "Đang chỉnh sửa hoặc tự lưu; hoàn tất đối soát trước khi gửi." : !ready ? "Cần đối soát đầy đủ cả hai nhóm BCA trước khi gửi." : !canRetryReconciledGuest(row) ? "Chưa đủ điều kiện gửi: kiểm tra hồ sơ hoặc cấu hình cho phép gửi BCA." : undefined}
              disabled={dirty || !ready || submit.isPending || !canRetryReconciledGuest(row)} onClick={() => void retry(row)}>{submit.isPending ? "Đang gửi…" : row.declarationStatus === "FAILED" ? "Gửi lại BCA" : "Gửi BCA"}</button> : null} />
        </tr>)}</tbody>
      </table>
    </div>}
    {totalPages > 1 ? <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4" aria-label="Phân trang khách"><button type="button" className={buttonClass} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Trang trước</button><span className="text-base text-slate-700">{currentPage}/{totalPages} · {filtered.length} khách</span><button type="button" className={buttonClass} disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Trang sau</button></nav> : null}
  </section>;
}
