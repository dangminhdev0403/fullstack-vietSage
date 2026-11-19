"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCoreRowModel, getFilteredRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { kbttResource } from "../resources/kbtt-resource";
import { KbttAutoSubmitSection } from "./kbtt-auto-submit-section";
import { KbttScheduleInfo } from "./kbtt-schedule-info";
import { InHouseBcaControls } from "./in-house-bca-status";
import { InHouseDeclarationCells } from "./in-house-declaration-cells";
import { DeclarationModal } from "./kbtt-declarations-page";
import {
  canRetryReconciledGuest, getKbttSubmissionIssue, sanitizeErrorMessage,
  type KbttDeclarationListItem, type KbttReconciliationRow,
} from "../types/kbtt-contract";

const buttonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 focus:outline-none disabled:opacity-50 whitespace-nowrap";
const states = {
  MATCHED: { label: "Đã có BCA", className: "text-emerald-800" },
  NOT_FOUND: { label: "Chưa có BCA", className: "text-slate-700" },
} as const;
const guestColumns: ColumnDef<KbttReconciliationRow>[] = [{ accessorKey: "id" }];
const emptyRows: KbttReconciliationRow[] = [];

type SortField = "fullName" | "birthDate" | "identityNumber" | "checkedInAt" | "plannedCheckOutAt" | "bcaStatus" | "nationality";
type SortDirection = "asc" | "desc";

function SortHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortField;
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  align?: "left" | "center" | "right";
}) {
  const isSorted = sortField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`group/sort inline-flex items-center gap-1.5 py-1 px-1.5 -mx-1.5 rounded-lg text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700 transition-colors hover:bg-slate-200/60 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B2A]/40 ${
        isSorted ? "text-[#003B2A] font-extrabold" : ""
      } ${align === "center" ? "mx-auto justify-center" : align === "right" ? "ml-auto" : ""}`}
      title={`Sắp xếp theo ${label.toLowerCase()} ${
        !isSorted
          ? "(Nhấn để sắp xếp tăng dần)"
          : sortDirection === "asc"
            ? "(Đang tăng dần, nhấn để giảm dần)"
            : "(Đang giảm dần, nhấn để hủy sắp xếp)"
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span className="inline-flex items-center justify-center shrink-0">
        {!isSorted ? (
          <VsIcon name="unfold_more" className="h-3.5 w-3.5 text-slate-400 group-hover/sort:text-slate-700 transition-colors" />
        ) : sortDirection === "asc" ? (
          <VsIcon name="arrow_upward" className="h-3.5 w-3.5 text-[#003B2A] transition-colors" />
        ) : (
          <VsIcon name="arrow_downward" className="h-3.5 w-3.5 text-[#003B2A] transition-colors" />
        )}
      </span>
    </button>
  );
}

function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", hour12: false }).format(parsed);
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

export function getReconciliationConnectionPollInterval(
  data:
    | {
        configured?: boolean;
        status?: string;
        lastErrorCode?: string | null;
        cooldownUntil?: string | null;
      }
    | null
    | undefined,
  nowMs: number = Date.now(),
): number | false {
  if (!data?.configured || data.status !== "DISCONNECTED") return false;
  if (data.lastErrorCode === "KBTT_RETRY_PENDING") return 10_000;
  if (data.lastErrorCode === "KBTT_TEMP_DISCONNECTED") {
    if (data.cooldownUntil) {
      const targetMs = Date.parse(data.cooldownUntil);
      if (Number.isFinite(targetMs)) {
        const remainingMs = targetMs - nowMs;
        if (remainingMs > 0) {
          return Math.min(15_000, Math.max(5_000, remainingMs + 1_000));
        }
      }
    }
    return 15_000;
  }
  return false;
}

export function getReconciliationConnectionBannerText(
  data:
    | {
        configured?: boolean;
        status?: string;
        lastErrorCode?: string | null;
        lastErrorMessage?: string | null;
      }
    | null
    | undefined,
): {
  text: string;
  isTemporaryDisconnect: boolean;
  isLoginRequired: boolean;
} {
  if (
    data?.status === "DISCONNECTED" &&
    data.lastErrorCode === "KBTT_RETRY_PENDING"
  ) {
    return {
      text: "Đang thử kết nối lại sau 10 giây. Đang hiển thị danh sách khách VietSage.",
      isTemporaryDisconnect: true,
      isLoginRequired: false,
    };
  }
  if (
    data?.status === "DISCONNECTED" &&
    data.lastErrorCode === "KBTT_TEMP_DISCONNECTED"
  ) {
    return {
      text: "Tạm ngắt kết nối BCA — đang chờ kết nối lại. Đang hiển thị danh sách khách VietSage.",
      isTemporaryDisconnect: true,
      isLoginRequired: false,
    };
  }
  if (data?.lastErrorCode === "KBTT_FACILITY_CONFLICT") {
    return {
      text: `${
        data.lastErrorMessage?.trim() ||
        "Tài khoản cơ sở BCA này đang được liên kết với một khách sạn khác trên hệ thống."
      } Đang hiển thị danh sách khách VietSage.`,
      isTemporaryDisconnect: false,
      isLoginRequired: true,
    };
  }
  if (
    data?.status === "AUTH_FAILED" ||
    data?.lastErrorCode === "KBTT_AUTH_FAILED" ||
    (data?.status === "DISCONNECTED" &&
      data?.lastErrorCode === "KBTT_SESSION_ENDED")
  ) {
    return {
      text: "Cần đăng nhập lại BCA. Đang hiển thị danh sách khách VietSage.",
      isTemporaryDisconnect: false,
      isLoginRequired: true,
    };
  }
  return {
    text: "Chưa kết nối BCA. Đang hiển thị danh sách khách VietSage.",
    isTemporaryDisconnect: false,
    isLoginRequired: false,
  };
}

export function InHouseReconciliation({ hotelId, canManage, canConfigureKbtt = false, initialQuery = "" }: {
  hotelId: string; canManage: boolean; canConfigureKbtt?: boolean; initialQuery?: string;
}) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const queryClient = useQueryClient();
  const connection = useQuery({ ...resource.queries.connection.options(), enabled: Boolean(hotelId),
    refetchOnMount: "always", staleTime: 0, retry: false,
    refetchInterval: (query) => getReconciliationConnectionPollInterval(query.state.data) });
  const connected = connection.isSuccess && connection.data.status === "CONNECTED";
  const canRestoreSession = Boolean(connection.data?.configured && connection.data.status === "DISCONNECTED"
    && ["KBTT_TEMP_DISCONNECTED", "KBTT_RETRY_PENDING"].includes(connection.data.lastErrorCode ?? ""));
  const canPrepareSession = connected;
  const [syncHotel, setSyncHotel] = useState<string | null>(null);
  const [completedHotel, setCompletedHotel] = useState<string | null>(null);
  useEffect(() => {
    setSyncHotel(null);
    setCompletedHotel(null);
    if (!canPrepareSession) return;
    const timer = setTimeout(() => setSyncHotel(hotelId), 5_000);
    return () => clearTimeout(timer);
  }, [hotelId, canPrepareSession]);
  const query = useQuery({
    ...resource.queries.reconciliation.options(), enabled: canPrepareSession && Boolean(hotelId) && syncHotel === hotelId, retry: false,
    refetchInterval: (query) => canRestoreSession || (connected && query.state.status === "error") ? 60_000 : false,
    refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 0, gcTime: 0,
  });
  useEffect(() => {
    if (query.data && canRestoreSession && connection.dataUpdatedAt < query.dataUpdatedAt) void connection.refetch();
    if (query.data && connection.data?.status === "CONNECTED" && connection.dataUpdatedAt < query.dataUpdatedAt
      && Object.values(query.data.sources).some((source) => source.state === "NOT_CONNECTED")) void connection.refetch();
  }, [query.data, query.dataUpdatedAt, connection.data?.status, connection.dataUpdatedAt, connection.refetch, canRestoreSession]);
  useEffect(() => {
    if (syncHotel === hotelId && query.isFetchedAfterMount && !query.isFetching) setCompletedHotel(hotelId);
  }, [hotelId, syncHotel, query.isFetchedAfterMount, query.isFetching]);
  const localFallback = useQuery({
    ...resource.queries.reconciliationLocal.options(),
    enabled: Boolean(hotelId) && (!connected || query.isError),
    retry: false, refetchOnWindowFocus: false,
  });
  const refresh = useMutation(resource.mutations.refreshReconciliation.options());
  const submit = useMutation(resource.mutations.submit.options());
  const [kind, setKind] = useState<"VIETNAMESE" | "FOREIGN">("VIETNAMESE");
  const [search, setSearch] = useState(initialQuery);
  const [bcaStatus, setBcaStatus] = useState("ALL");
  const [room, setRoom] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<KbttReconciliationRow | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const sending = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const data = !connected ? localFallback.data : completedHotel === hotelId ? (query.isError ? localFallback.data : query.data) : undefined;
  const pending = connected
    ? syncHotel !== hotelId || query.isFetching || (query.isError && localFallback.isLoading) || refresh.isPending
    : localFallback.isLoading;
  const rows = data?.items ?? emptyRows;
  const rooms = useMemo(() => [...new Set(rows.map((row) => row.roomNumber).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })), [rows]);
  const needle = search.trim().toLocaleLowerCase("vi");
  const globalFilter = useMemo(() => ({ kind, needle, bcaStatus, room }), [kind, needle, bcaStatus, room]);
  const table = useReactTable({
    data: rows,
    columns: guestColumns,
    getRowId: (row) => row.id,
    state: { globalFilter },
    // This view owns pagination via `page`; table resets must not schedule React updates.
    autoResetPageIndex: false,
    globalFilterFn: ({ original: row }) =>
      (kind === "FOREIGN" ? row.kind === "FOREIGN" : row.kind !== "FOREIGN")
      && (!room || row.roomNumber === room)
      && (bcaStatus === "ALL" || (bcaStatus === "FAILED" ? row.declarationStatus === "FAILED" : bcaStatus === "UNCHECKED" ? row.status === null : row.status === bcaStatus))
      && (!needle || [row.fullName, row.roomNumber, row.groupCode, row.identityNumber].some((value) => value?.toLocaleLowerCase("vi").includes(needle))),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  const filtered = table.getFilteredRowModel().rows.map((row) => row.original);

  function toggleSort(field: SortField) {
    if (sortField !== field) {
      setSortField(field);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortField(null);
      setSortDirection("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "fullName":
          return factor * (a.fullName || "").localeCompare(b.fullName || "", "vi");
        case "birthDate": {
          const valA = a.draftPayload?.ngayThangNamSinhStr || "";
          const valB = b.draftPayload?.ngayThangNamSinhStr || "";
          return factor * String(valA).localeCompare(String(valB));
        }
        case "identityNumber":
          return factor * (a.identityNumber || "").localeCompare(b.identityNumber || "", "vi", { numeric: true });
        case "checkedInAt": {
          const timeA = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
          const timeB = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
          return factor * (timeA - timeB);
        }
        case "plannedCheckOutAt": {
          const timeA = a.plannedCheckOutAt ? new Date(a.plannedCheckOutAt).getTime() : 0;
          const timeB = b.plannedCheckOutAt ? new Date(b.plannedCheckOutAt).getTime() : 0;
          return factor * (timeA - timeB);
        }
        case "nationality":
          return factor * (a.nationality || "").localeCompare(b.nationality || "", "vi");
        case "bcaStatus": {
          const rank = (row: KbttReconciliationRow) =>
            row.declarationStatus === "FAILED" ? 3 : row.status === "MATCHED" ? 2 : row.status === "NOT_FOUND" ? 1 : 0;
          return factor * (rank(a) - rank(b));
        }
        default:
          return 0;
      }
    });
  }, [filtered, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / 20));
  const currentPage = Math.min(page, totalPages);
  const visible = sorted.slice((currentPage - 1) * 20, currentPage * 20);
  const selectedCurrent = selected ? rows.find((row) => row.id === selected.id) : null;
  const ready = connected && query.isSuccess && !query.isError && !refresh.isError && !pending
    && query.data.sources.VIETNAMESE.state === "COMPLETE" && query.data.sources.FOREIGN.state === "COMPLETE";

  async function refreshBoth() {
    if (pending) return;
    setIssue(null);
    if (!connected) {
      await Promise.all([connection.refetch(), localFallback.refetch()]);
      return;
    }
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
    !connected || localFallback.isError ||
    (data && ([ ["VIETNAMESE", "Khách Việt Nam"], ["FOREIGN", "Khách nước ngoài"] ] as const).some(([val]) => data.sources[val].state !== "COMPLETE")) ||
    query.isError ||
    issue
  );

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-5 shadow-xs" aria-label="Khách đang lưu trú" aria-busy={pending}>
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 whitespace-nowrap">
            Danh sách khách đang lưu trú
          </h2>
          {data?.checkedAt ? (
            <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">
              <VsIcon name="schedule" className="h-4 w-4 text-emerald-700" />
              <span className="font-medium">Đối soát gần nhất:</span>
              <span className="font-bold tabular-nums whitespace-nowrap">{dateTime(data.checkedAt)}</span>
            </p>
          ) : (
            <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900">
              <VsIcon name="schedule" className="h-4 w-4 text-amber-700" />
              <span>Chưa hoàn tất đối soát cả hai nhóm khách BCA</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InHouseBcaControls hotelId={hotelId} canManage={canConfigureKbtt} />
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-800/20 bg-emerald-50/90 px-4 text-sm font-bold text-emerald-900 shadow-2xs transition-all hover:bg-emerald-100 hover:border-emerald-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B2A]/30 disabled:opacity-50 whitespace-nowrap"
            disabled={pending}
            onClick={() => void refreshBoth()}
          >
            <VsIcon name="refresh" className={`h-4.5 w-4.5 text-emerald-800 ${pending ? "animate-spin" : ""}`} />
            <span>{pending ? connected ? "Đang đối soát…" : "Đang tải…" : "Làm mới"}</span>
          </button>
        </div>
      </div>

      <KbttScheduleInfo nextCatchUpAt={connection.data?.nextCatchUpAt ?? null} />

      {canConfigureKbtt ? <KbttAutoSubmitSection hotelId={hotelId} canManage={canConfigureKbtt} isConnected={connected} toolsOnly /> : null}

      {/* Sub-bar: Category Tabs & Search Bar with Active Filter Status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex p-1.5 rounded-xl bg-slate-100/90 border border-slate-200/80" role="tablist" aria-label="Nhóm khách">
          {([ ["VIETNAMESE", "Khách Việt Nam"], ["FOREIGN", "Khách nước ngoài"] ] as const).map(([value, label]) => {
            const isActive = kind === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => { setKind(value); setPage(1); }}
                className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm sm:text-base font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003B2A]/30 ${
                  isActive
                    ? "bg-[#003B2A] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {search || room || bcaStatus !== "ALL" || sortField ? (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3 text-xs font-semibold text-rose-700 shadow-2xs hover:bg-rose-100 transition-colors"
              onClick={() => { setSearch(""); setRoom(""); setBcaStatus("ALL"); setSortField(null); setSortDirection("asc"); setPage(1); }}
              title="Đặt lại toàn bộ bộ lọc tìm kiếm và sắp xếp"
            >
              <VsIcon name="filter_alt_off" className="h-3.5 w-3.5" />
              <span>Xóa bộ lọc</span>
            </button>
          ) : null}
          {data ? (
            <span role="status" className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 whitespace-nowrap">
              {filtered.length} khách
            </span>
          ) : null}
          <div className="relative min-w-[220px] sm:w-72">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <VsIcon name="search" className="h-4 w-4" />
            </div>
            <input
              type="text"
              aria-label="Tìm khách, giấy tờ, phòng hoặc đoàn"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Tìm khách, giấy tờ, phòng…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:bg-white focus:border-[#003B2A] focus:outline-none focus:ring-1 focus:ring-[#003B2A]"
            />
            {search ? (
              <button
                type="button"
                onClick={() => { setSearch(""); setPage(1); }}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                aria-label="Xóa tìm kiếm"
              >
                <VsIcon name="close" className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Structured Status / Alert Banner */}
      {hasIssues ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs text-amber-900 shadow-2xs">
          <VsIcon name="info" className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            {!connected ? (
              <p className="text-pretty">
                {connection.isError
                  ? "Không xác định được trạng thái kết nối BCA."
                  : connection.isPending || connection.isFetching
                    ? "Đang kiểm tra trạng thái kết nối BCA…"
                    : getReconciliationConnectionBannerText(connection.data).text}
              </p>
            ) : null}
            {data && connected ? (
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
            {query.isError && connected ? (
              <p className="font-medium text-amber-900 text-pretty">
                Chưa đối soát được BCA. {sanitizeErrorMessage(query.error instanceof Error ? query.error.message : null)}
                {data ? " Đang hiển thị dữ liệu VietSage; trạng thái BCA chưa được cập nhật." : ""}
              </p>
            ) : null}
            {connection.isSuccess && (!connection.data.configured || getReconciliationConnectionBannerText(connection.data).isLoginRequired) ? (
              <a className="inline-flex min-h-11 items-center font-semibold underline focus-visible:outline focus-visible:outline-2" href={`/owner/hotels/${encodeURIComponent(hotelId)}/settings?tab=integrations`}>Kết nối tài khoản BCA</a>
            ) : null}
            {localFallback.isError && (!connected || query.isError) ? <p className="text-pretty">Không tải được danh sách khách VietSage. Vui lòng thử lại.</p> : null}
            {issue ? <p className="font-semibold text-rose-800 text-pretty">{issue}</p> : null}
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
            if (!connected) throw new Error("Cần kết nối BCA trước khi gửi.");
            const result = await queryClient.fetchQuery({ ...resource.queries.reconciliation.options(), staleTime: 0 });
            const current = result.items.find((row) => row.occupantId === selected.occupantId);
            if (result.sources.VIETNAMESE.state !== "COMPLETE" || result.sources.FOREIGN.state !== "COMPLETE" || !current || !canRetryReconciledGuest(current)) throw new Error("Chưa thể gửi: cần xác nhận hồ sơ chưa có trên BCA và luồng gửi đang được bật.");
          }}
          onClose={closeDetail}
          onUpdated={() => { void refreshBoth(); }}
        />
      ) : null}

      {/* Data Table */}
      {!data && pending ? (
        <div role="status" className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200/80 bg-slate-50/40 py-16 text-center">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/20" />
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-200 border-t-[#003B2A]" />
          </div>
          <p className="text-base font-semibold text-slate-700 animate-pulse text-pretty">
            {connected ? "Đang tải danh sách khách và đối soát BCA…" : "Đang tải danh sách khách…"}
          </p>
        </div>
      ) : !visible.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-xs text-slate-500">
          <span>{query.isError ? "Chưa có dữ liệu để hiển thị." : "Không tìm thấy khách phù hợp với tiêu chí tìm kiếm."}</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/90 shadow-2xs">
          <table className="w-full table-fixed text-left text-sm min-w-[1020px]">
            <thead className="border-b border-[#E8E2D5] bg-[#FBF9F5] text-slate-700">
              <tr>
                <th
                  scope="col"
                  className={`px-2.5 py-3 font-bold uppercase tracking-wider text-slate-700 text-xs sm:text-sm text-left ${
                    kind === "FOREIGN" ? "w-[16%] min-w-[170px]" : "w-[18%] min-w-[180px]"
                  }`}
                >
                  <SortHeader label="Khách" field="fullName" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                </th>
                <th
                  scope="col"
                  className={`px-2 py-3 font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap text-xs sm:text-sm text-center ${
                    kind === "FOREIGN" ? "w-[6%] min-w-[75px]" : "w-[8%] min-w-[80px]"
                  }`}
                >
                  Giới tính
                </th>
                <th
                  scope="col"
                  className={`px-2 py-3 font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap text-xs sm:text-sm text-center ${
                    kind === "FOREIGN" ? "w-[10%] min-w-[120px]" : "w-[12%] min-w-[125px]"
                  }`}
                >
                  <SortHeader label="Ngày sinh" field="birthDate" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                </th>
                <th
                  scope="col"
                  className={`px-2 py-3 font-bold uppercase tracking-wider text-slate-700 text-xs sm:text-sm text-center ${
                    kind === "FOREIGN" ? "w-[14%] min-w-[140px]" : "w-[17%] min-w-[160px]"
                  }`}
                >
                  <SortHeader label={kind === "FOREIGN" ? "Hộ chiếu" : "Giấy tờ"} field="identityNumber" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                </th>
                <th
                  scope="col"
                  className={`px-2 py-3 font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap text-xs sm:text-sm text-center ${
                    kind === "FOREIGN" ? "w-[11%] min-w-[125px]" : "w-[13%] min-w-[130px]"
                  }`}
                >
                  <SortHeader label="Nhận phòng" field="checkedInAt" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                </th>
                <th
                  scope="col"
                  className={`px-2 py-3 font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap text-xs sm:text-sm text-center ${
                    kind === "FOREIGN" ? "w-[11%] min-w-[125px]" : "w-[13%] min-w-[130px]"
                  }`}
                >
                  <SortHeader label="Dự kiến trả" field="plannedCheckOutAt" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                </th>
                {kind === "FOREIGN" ? (
                  <th
                    scope="col"
                    className="px-2 py-3 font-bold uppercase tracking-wider text-slate-700 text-xs sm:text-sm w-[9%] min-w-[110px] text-center"
                  >
                    <SortHeader label="Quốc tịch" field="nationality" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                  </th>
                ) : null}
                {kind === "FOREIGN" ? (
                  <th
                    scope="col"
                    className="px-2 py-3 font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap text-xs sm:text-sm w-[10%] min-w-[125px] text-center"
                  >
                    Hạn tạm trú
                  </th>
                ) : null}
                <th
                  scope="col"
                  className={`px-2 py-3 font-bold uppercase tracking-wider text-slate-700 text-xs sm:text-sm text-center ${
                    kind === "FOREIGN" ? "w-[7%] min-w-[90px]" : "w-[9%] min-w-[100px]"
                  }`}
                >
                  <SortHeader label="BCA" field="bcaStatus" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} align="center" />
                </th>
                <th
                  scope="col"
                  className={`px-2 py-3 font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap text-xs sm:text-sm text-center ${
                    kind === "FOREIGN" ? "w-[6%] min-w-[90px]" : "w-[10%] min-w-[100px]"
                  }`}
                >
                  Thao tác
                </th>
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
