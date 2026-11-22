"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { kbttResource } from "../resources/kbtt-resource";
import { DeclarationModal, getDeclarationStatus } from "./kbtt-declarations-page";
import { KbttAutoSubmitSwitch } from "./kbtt-auto-submit-switch";
import {
  getKbttSubmissionIssue,
  getVietnamCalendarDate,
  isArrivalDayWithinBcaWindow,
  sanitizeErrorMessage,
  type KbttDeclarationListItem,
} from "../types/kbtt-contract";

export function useInHouseBca(hotelId: string, stayIds: string[], enabled: boolean) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const scope = [...new Set(stayIds)].sort().join(",");
  const options = useMemo(() => resource.queries.inHouseDeclarations.options({ stayIds: scope }), [resource, scope]);
  return useQuery({ ...options, enabled: enabled && Boolean(scope), refetchInterval: 10_000 });
}

export function InHouseBcaControls({ hotelId, canManage = true }: { hotelId: string; canManage?: boolean }) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const connection = useQuery(resource.queries.connection.options());
  return <KbttAutoSubmitSwitch hotelId={hotelId} canManage={canManage} isConnected={connection.isSuccess && connection.data.status === "CONNECTED"} />;
}

export type BcaSummaryInfo = {
  label: string;
  dotColor: string;
  badgeClass: string;
  key: string;
};

export function getBcaSummaryInfo(rows: KbttDeclarationListItem[]): BcaSummaryInfo {
  if (!rows.length) {
    return {
      label: "Chưa có hồ sơ khách",
      dotColor: "bg-amber-400",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-900",
      key: "EMPTY",
    };
  }

  if (rows.length === 1) {
    const status = getDeclarationStatus(rows[0]);
    return {
      label: status.label,
      dotColor: status.dotColor,
      badgeClass: status.badgeClass,
      key: status.key,
    };
  }

  const submitted = rows.filter((row) => row.declaration?.status === "SUBMITTED").length;
  const reviewCount = rows.filter((row) => {
    const status = row.declaration?.status ?? row.derivedStatus;
    if (status === "SUBMITTED") return false;
    if (status === "UNKNOWN" || row.declaration?.eligibilityState === "RECONCILIATION_REQUIRED") return true;
    if (
      row.declaration?.eligibilityState === "OUT_OF_DATE_WINDOW" ||
      row.declaration?.eligibilityState === "PRIOR_DAY_MANUAL" ||
      row.declaration?.providerCode === "OUT_OF_DATE_WINDOW" ||
      row.declaration?.providerCode === "PRIOR_DAY_MANUAL_REQUIRED"
    ) {
      return true;
    }
    const arrivalDay = getVietnamCalendarDate(row.checkedInAt ?? row.plannedCheckInAt);
    if (arrivalDay && !isArrivalDayWithinBcaWindow(arrivalDay)) {
      return true;
    }
    if (status === "FAILED") {
      return row.declaration?.eligibilityState !== "ELIGIBLE_SAME_DAY" && !row.declaration?.nextCatchUpAt;
    }
    return false;
  }).length;

  if (reviewCount > 0) {
    return {
      label: "Cần xử lý",
      dotColor: "bg-rose-500",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-800",
      key: "REVIEW",
    };
  }

  if (submitted === rows.length) {
    return {
      label: `${submitted}/${rows.length} đã gửi`,
      dotColor: "bg-emerald-500",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
      key: "SUBMITTED",
    };
  }

  if (submitted === 0) {
    return {
      label: `0/${rows.length} đã gửi`,
      dotColor: "bg-slate-400",
      badgeClass: "border-slate-200 bg-slate-50 text-slate-700",
      key: "UNSENT",
    };
  }

  return {
    label: `${submitted}/${rows.length} đã gửi`,
    dotColor: "bg-amber-500",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-900",
    key: "PARTIAL",
  };
}

export function InHouseBcaStatus({
  hotelId,
  stayId: _stayId,
  rows,
  loading,
  failed,
  canManage,
  connectionIssue,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
  onRefresh,
}: {
  hotelId: string;
  stayId?: string;
  rows: KbttDeclarationListItem[];
  loading: boolean;
  failed: boolean;
  canManage: boolean;
  connectionIssue: string | null;
  isOpen?: boolean;
  onToggle?: () => void;
  onRefresh: () => void;
}) {
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const submit = useMutation(resource.mutations.submit.options());
  const [selected, setSelected] = useState<KbttDeclarationListItem | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const sendingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : localIsOpen;
  const toggleOpen = controlledOnToggle ?? (() => setLocalIsOpen((prev) => !prev));

  async function retry(row: KbttDeclarationListItem) {
    if (!canManage || row.declaration?.status !== "FAILED" || sendingRef.current) return;
    if (connectionIssue) {
      setIssue(connectionIssue);
      return;
    }
    sendingRef.current = true;
    setIssue(null);
    try {
      const result = await submit.mutateAsync({ occupantId: row.occupantId });
      setIssue(getKbttSubmissionIssue(result));
    } catch (error) {
      setIssue(sanitizeErrorMessage(error instanceof Error ? error.message : null));
    } finally {
      sendingRef.current = false;
      onRefresh();
    }
  }

  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Chưa tải được trạng thái
      </span>
    );
  }

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
        Đang tải…
      </span>
    );
  }

  if (!rows.length) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Chưa có hồ sơ khách
      </span>
    );
  }

  const summaryInfo = getBcaSummaryInfo(rows);

  return (
    <div
      className="relative inline-block text-left"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={toggleOpen}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-2xs transition-all hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${summaryInfo.badgeClass}`}
          aria-expanded={isOpen}
          aria-label={`Trạng thái BCA: ${summaryInfo.label}. Nhấn để ${isOpen ? "thu gọn" : "xem danh sách khách"}`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${summaryInfo.dotColor}`} />
          <span className="whitespace-nowrap">{summaryInfo.label}</span>
          <VsIcon
            name="expand_more"
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {rows.length === 1 && canManage && rows[0].declaration?.status === "FAILED" && !isOpen ? (
          <button
            type="button"
            disabled={submit.isPending}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-60 whitespace-nowrap"
            onClick={() => void retry(rows[0])}
          >
            <VsIcon name="refresh" className={`h-3.5 w-3.5 ${submit.isPending ? "animate-spin" : ""}`} />
            <span>{submit.isPending ? "Đang gửi…" : "Gửi lại BCA"}</span>
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="mt-2 min-w-64 max-w-sm rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              Khách trong phòng ({rows.length})
            </span>
            <span className="text-xs text-slate-400 whitespace-nowrap">Nhấn tên để xem chi tiết</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const rowStatus = getDeclarationStatus(row);
              const canRetry =
                canManage &&
                row.declaration?.status === "FAILED" &&
                row.declaration?.eligibilityState !== "RECONCILIATION_REQUIRED" &&
                row.declaration?.providerCode !== "RECONCILIATION_REQUIRED";
              const badgeClass = rowStatus.badgeClass;
              const dotColor = rowStatus.dotColor;

              return (
                <li key={row.occupantId} className="flex flex-col gap-1 py-2 first:pt-1 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left text-sm font-semibold text-slate-900 hover:text-blue-600 hover:underline transition-colors line-clamp-1"
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setSelected(row);
                      }}
                    >
                      {row.fullName}
                    </button>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${badgeClass}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                      {rowStatus.label}
                    </span>
                  </div>
                  {canRetry ? (
                    <div className="pt-0.5">
                      <button
                        type="button"
                        disabled={submit.isPending}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-60 whitespace-nowrap"
                        onClick={() => void retry(row)}
                      >
                        <VsIcon name="refresh" className={`h-3.5 w-3.5 ${submit.isPending ? "animate-spin" : ""}`} />
                        <span>{submit.isPending ? "Đang gửi…" : "Gửi lại BCA"}</span>
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {issue ? <p role="alert" className="mt-1 max-w-sm text-pretty text-xs text-amber-900">{issue}</p> : null}
      {selected ? (
        <DeclarationModal
          hotelId={hotelId}
          occupantId={selected.occupantId}
          occupantSummary={selected}
          canManage={canManage}
          connectionIssue={connectionIssue}
          retryFailedOnly
          onClose={() => {
            setSelected(null);
            triggerRef.current?.focus();
          }}
          onUpdated={onRefresh}
        />
      ) : null}
    </div>
  );
}
