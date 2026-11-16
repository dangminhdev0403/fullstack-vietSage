"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { kbttResource } from "../resources/kbtt-resource";
import { InHouseBcaControls } from "./in-house-bca-status";
import { InHouseDeclarationCells, declarationColumnLabels } from "./in-house-declaration-cells";
import { DeclarationModal } from "./kbtt-declarations-page";
import {
  canRetryReconciledGuest, getKbttSubmissionIssue, sanitizeErrorMessage,
  type KbttDeclarationListItem, type KbttReconciliationRow,
} from "../types/kbtt-contract";

const buttonClass = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B2A]/30 disabled:opacity-50 whitespace-nowrap";
const states = {
  MATCHED: { label: "Đã có BCA", className: "text-emerald-800" },
  NOT_FOUND: { label: "Chưa có BCA", className: "text-slate-700" },
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
  if (!detail.data || detail.isError) return (
    <div role={detail.isError ? "alert" : "status"} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4 text-xs font-medium">
      <span>{detail.isError ? "Không tải được hồ sơ khách." : "Đang tải hồ sơ…"}</span>
      {detail.isError ? <button type="button" className={buttonClass} onClick={() => void detail.refetch()}>Thử lại</button> : null}
      <button type="button" className={buttonClass} onClick={onClose}>Đóng</button>
    </div>
  );
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
  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div className="min-w-0">
          <h2 id={titleId} className="break-words text-xl font-bold">{row.fullName}</h2>
          {row.source === "BCA_ONLY" ? <p className="mt-1 text-xs text-slate-500">Chỉ có trên BCA · {row.checkedOutAt ? "Đã trả phòng" : "Đang ở"}</p> : null}
        </div>
        <button autoFocus type="button" className={buttonClass} onClick={onClose}>
          <VsIcon name="close" className="h-4 w-4" />
          <span>Đóng</span>
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}

export function InHouseReconciliation({ hotelId, canManage, canConfigureKbtt = false, initialQuery = "" }: {
  hotelId: string; canManage: boolean; canConfigureKbtt?: boolean; initialQuery?: string;
}) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const queryClient = useQueryClient();
  const [syncHotel, setSyncHotel] = useState<string | null>(null);
  const [completedHotel, setCompletedHotel] = useState<string | null>(null);
  useEffect(() => {
    setSyncHotel(null);
    setCompletedHotel(null);
    const timer = setTimeout(() => setSyncHotel(hotelId), 5_000);
    return () => clearTimeout(timer);
  }, [hotelId]);
  const query = useQuery({
    ...resource.queries.reconciliation.options(), enabled: Boolean(hotelId) && syncHotel === hotelId, retry: false,
    refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 0, gcTime: 0,
  });
  useEffect(() => {
    if (syncHotel === hotelId && query.isFetchedAfterMount && !query.isFetching) setCompletedHotel(hotelId);
  }, [hotelId, syncHotel, query.isFetchedAfterMount, query.isFetching]);
  const refresh = useMutation(resource.mutations.refreshReconciliation.options());
  const submit = useMutation(resource.mutations.submit.options());
  const [kind, setKind] = useState<"VIETNAMESE" | "FOREIGN" | "UNCLASSIFIED">("VIETNAMESE");
  const [search, setSearch] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<KbttReconciliationRow | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const sending = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const data = completedHotel === hotelId ? query.data : undefined;
  const pending = syncHotel !== hotelId || query.isFetching || refresh.isPending;
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

  const hasIssues = Boolean(
    (data && ([ ["VIETNAMESE", "Khách Việt Nam"], ["FOREIGN", "Khách nước ngoài"] ] as const).some(([val]) => data.sources[val].state !== "COMPLETE")) ||
    query.isError ||
    issue
  );

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-5 shadow-xs" aria-label="Khách đang lưu trú" aria-busy={pending}>
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 whitespace-nowrap">
              Danh sách khách đang lưu trú
            </h2>
            {data ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-900 whitespace-nowrap">
                {counts.VIETNAMESE + counts.FOREIGN + counts.UNCLASSIFIED} khách
              </span>
            ) : null}
          </div>
          {data?.checkedAt ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <VsIcon name="schedule" className="h-3.5 w-3.5 text-slate-400" />
              <span>Đối soát gần nhất: {date(data.checkedAt)}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Chưa hoàn tất đối soát cả hai nhóm khách BCA</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InHouseBcaControls hotelId={hotelId} canManage={canConfigureKbtt} />
          <button
            type="button"
            className={buttonClass}
            disabled={pending}
            onClick={() => void refreshBoth()}
            title="Kiểm tra trạng thái kết nối tới hệ thống BCA"
          >
            <VsIcon name="verified" className="h-4 w-4 text-emerald-700" />
            <span>Kiểm tra kết nối</span>
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-800/20 bg-emerald-50/80 px-3 text-xs font-bold text-emerald-900 shadow-2xs transition-all hover:bg-emerald-100 hover:border-emerald-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B2A]/30 disabled:opacity-50 whitespace-nowrap"
            disabled={pending}
            onClick={() => void refreshBoth()}
          >
            <VsIcon name="refresh" className={`h-4 w-4 text-emerald-800 ${pending ? "animate-spin" : ""}`} />
            <span>{pending ? "Đang đối soát…" : "Làm mới"}</span>
          </button>
        </div>
      </div>

      {/* Sub-bar: Category Tabs & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex p-1 rounded-xl bg-slate-100/90 border border-slate-200/80" role="tablist" aria-label="Nhóm khách">
          {([ ["VIETNAMESE", "Khách Việt Nam"], ["FOREIGN", "Khách nước ngoài"], ...(counts.UNCLASSIFIED ? [["UNCLASSIFIED", "Cần phân loại"]] : []) ] as Array<[typeof kind, string]>).map(([value, label]) => {
            const isActive = kind === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => { setKind(value); setPage(1); }}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B2A]/30 ${
                  isActive
                    ? "bg-[#003B2A] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <span>{label}</span>
                <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}>
                  {data ? counts[value] : "…"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[240px] sm:w-80">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <VsIcon name="search" className="h-4 w-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Tìm khách, giấy tờ, phòng hoặc đoàn…"
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:bg-white focus:border-[#003B2A] focus:outline-none focus:ring-1 focus:ring-[#003B2A]"
          />
          {search ? (
            <button
              type="button"
              onClick={() => { setSearch(""); setPage(1); }}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
              aria-label="Xóa tìm kiếm"
            >
              <VsIcon name="close" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Structured Status / Alert Banner */}
      {hasIssues ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs text-amber-900 shadow-2xs">
          <VsIcon name="info" className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            {data ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-medium">
                {([ ["VIETNAMESE", "Khách Việt Nam"], ["FOREIGN", "Khách nước ngoài"] ] as const).map(([value, label]) =>
                  data.sources[value].state !== "COMPLETE" ? (
                    <span key={value} className="inline-flex items-center gap-1.5">
                      <span className="font-semibold">{label}:</span>
                      <span>
                        {data.sources[value].error?.message ??
                          (data.sources[value].state === "PENDING"
                            ? pending ? "Đang đối soát BCA…" : "Chưa đối soát được BCA."
                            : data.sources[value].state === "NEEDS_LOGIN"
                              ? "Cần đăng nhập lại BCA."
                              : data.sources[value].state === "NOT_CONNECTED"
                                ? "Chưa kết nối BCA."
                                : "Chưa đọc đủ dữ liệu BCA.")}
                      </span>
                    </span>
                  ) : null
                )}
              </div>
            ) : null}
            {query.isError ? (
              <p className="font-medium text-amber-900">
                Không tải được dữ liệu đối soát. {data ? "Đang hiển thị kết quả lần trước." : ""}
              </p>
            ) : null}
            {issue ? <p className="font-semibold text-rose-800">{issue}</p> : null}
          </div>
        </div>
      ) : null}

      {/* Modals */}
      {selected && !selected.occupantId ? <BcaGuestDetailModal row={selectedCurrent ?? selected} onClose={closeDetail} /> : null}
      {selected && selected.occupantId ? (
        <LocalGuestDetail
          key={selected.occupantId}
          hotelId={hotelId}
          row={selectedCurrent ?? selected}
          canManage={canManage && Boolean(selectedCurrent)}
          sendBlockedReason={!ready ? "Cần đối soát đầy đủ BCA trước khi gửi." : !selectedCurrent || !canRetryReconciledGuest(selectedCurrent) ? "Chưa đủ điều kiện gửi: kiểm tra hồ sơ hoặc cấu hình cho phép gửi BCA." : null}
          verifyBeforeSubmit={async () => {
            const result = await queryClient.fetchQuery({ ...resource.queries.reconciliation.options(), staleTime: 0 });
            const current = result.items.find((row) => row.occupantId === selected.occupantId);
            if (result.sources.VIETNAMESE.state !== "COMPLETE" || result.sources.FOREIGN.state !== "COMPLETE" || !current || !canRetryReconciledGuest(current)) throw new Error("Chưa thể gửi: cần xác nhận hồ sơ chưa có trên BCA và luồng gửi đang được bật.");
          }}
          onClose={closeDetail}
          onUpdated={() => { void refreshBoth(); }}
        />
      ) : null}

      {/* Data Table */}
      {!data && (pending || query.isPending) ? (
        <div role="status" className="py-12 text-center text-xs text-slate-500">
          <VsIcon name="refresh" className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-800" />
          <span>Đang tải danh sách khách và đối soát BCA…</span>
        </div>
      ) : !visible.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-xs text-slate-500">
          <span>{query.isError ? "Chưa có dữ liệu để hiển thị." : "Không tìm thấy khách phù hợp với tiêu chí tìm kiếm."}</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/90 shadow-2xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E8E2D5] bg-[#FBF9F5] text-slate-700">
              <tr>
                {[...declarationColumnLabels, ...(kind === "FOREIGN" ? ["Quốc tịch", "Hạn tạm trú"] : []), "BCA", "Thao tác"].map((label) => (
                  <th key={label} scope="col" className="px-1.5 py-2.5 font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap text-xs">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {visible.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  aria-label={"Chi tiết " + row.fullName}
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest("button, a, input, select, textarea, label")) {
                      openDetail(row, event.currentTarget);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      openDetail(row, event.currentTarget);
                    }
                  }}
                  className="group cursor-pointer transition-colors hover:bg-[#FDFBF7] focus-visible:bg-[#FDFBF7] focus-visible:outline-none"
                >
                  <InHouseDeclarationCells
                    key={row.id}
                    hotelId={hotelId}
                    row={row}
                    canManage={canManage}
                    onUpdated={async () => {
                      const options = resource.queries.reconciliation.options();
                      const result = await queryClient.ensureQueryData(options);
                      if (result.sources.VIETNAMESE.state !== "COMPLETE" || result.sources.FOREIGN.state !== "COMPLETE") {
                        throw new Error("Đã lưu hồ sơ; chưa đối soát đầy đủ BCA. Hãy kiểm tra kết nối trước khi gửi.");
                      }
                    }}
                    renderActions={(dirty) =>
                      canManage && row.occupantId && row.status !== "MATCHED" && !["UNKNOWN", "SUBMITTED", "CANCELLED"].includes(row.declarationStatus ?? "") ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#003B2A] px-3.5 text-sm font-bold text-white shadow-2xs transition-all hover:bg-[#00281c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B2A]/40 disabled:opacity-50 whitespace-nowrap"
                          title={
                            dirty
                              ? "Đang chỉnh sửa hoặc tự lưu; hoàn tất đối soát trước khi gửi."
                              : !ready
                                ? "Cần đối soát đầy đủ cả hai nhóm BCA trước khi gửi."
                                : !canRetryReconciledGuest(row)
                                  ? "Chưa đủ điều kiện gửi: kiểm tra hồ sơ hoặc cấu hình cho phép gửi BCA."
                                  : undefined
                          }
                          disabled={dirty || !ready || submit.isPending || !canRetryReconciledGuest(row)}
                          onClick={() => void retry(row)}
                        >
                          <VsIcon name="send" className="h-3.5 w-3.5" />
                          <span>
                            {submit.isPending
                              ? "Đang gửi…"
                              : row.declarationStatus === "FAILED"
                                ? "Gửi lại"
                                : "Gửi BCA"}
                          </span>
                        </button>
                      ) : null
                    }
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 ? (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4" aria-label="Phân trang khách">
          <button
            type="button"
            className={buttonClass}
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <VsIcon name="chevron_left" className="h-4 w-4" />
            <span>Trang trước</span>
          </button>
          <span className="text-xs font-semibold text-slate-600">
            Trang {currentPage} / {totalPages} · {filtered.length} khách
          </span>
          <button
            type="button"
            className={buttonClass}
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            <span>Trang sau</span>
            <VsIcon name="chevron_right" className="h-4 w-4" />
          </button>
        </nav>
      ) : null}
    </section>
  );
}
