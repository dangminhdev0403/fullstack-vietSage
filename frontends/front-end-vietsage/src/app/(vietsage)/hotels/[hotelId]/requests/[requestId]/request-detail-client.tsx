"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { requestInternalApi, requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import type { HotelGuestRequest } from "@/features/hotel-ops/types/hotel-ops-contract";
import { validNextRequestStatuses } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  formatOpsDateTime,
  formatMoney,
  getGuestLabel,
  getRequestTitle,
  getRoomLabel,
  priorityTone,
  requestPriorityLabelMap,
  requestStatusLabelMap,
  requestTypeLabelMap,
  statusTone,
} from "@/features/hotel-ops/utils/hotel-ops-display";
import type { GuestRequestStatus } from "@/features/guest-os/types/guest-os-contract";

export type StaffOption = {
  id: string;
  name: string;
  role?: string;
};

type RequestDetailLabels = {
  statusActions: string;
  optionalTransitionNote: string;
  terminalState: string;
  timeline: string;
  noTimeline: string;
  assignment: string;
  assignedUserId: string;
  assignedUserIdPlaceholder: string;
  optionalAssignmentNote: string;
  saveAssignment: string;
  internalNote: string;
  internalNotePlaceholder: string;
  addNote: string;
  reservation: string;
  serviceItem: string;
  rawRequest: string;
  price: string;
  created: string;
  note: string;
  updateStatusError: string;
  updateAssignmentError: string;
  addNoteError: string;
  statusActionLabel: Record<GuestRequestStatus, string>;
};

type RequestDetailClientProps = {
  hotelId: string;
  initialRequest: HotelGuestRequest;
  labels?: RequestDetailLabels;
  apiBasePath?: string;
  readOnly?: boolean;
  staffOptions?: StaffOption[];
};

const defaultLabels: RequestDetailLabels = {
  statusActions: "Thao tác trạng thái",
  optionalTransitionNote: "Ghi chú cập nhật trạng thái (không bắt buộc)",
  terminalState: "Yêu cầu này đã ở trạng thái kết thúc.",
  timeline: "Lịch sử xử lý",
  noTimeline: "Chưa có sự kiện xử lý nào.",
  assignment: "Phân công nhân sự",
  assignedUserId: "Nhân sự phụ trách",
  assignedUserIdPlaceholder: "Chọn nhân sự xử lý",
  optionalAssignmentNote: "Ghi chú phân công (không bắt buộc)",
  saveAssignment: "Lưu phân công",
  internalNote: "Ghi chú nội bộ",
  internalNotePlaceholder: "Thêm ghi chú nội bộ cho ca trực...",
  addNote: "Thêm ghi chú",
  reservation: "Lượt đặt phòng",
  serviceItem: "Dịch vụ yêu cầu",
  rawRequest: "Yêu cầu tùy biến",
  price: "Giá dịch vụ",
  created: "Tạo lúc",
  note: "Ghi chú",
  updateStatusError: "Không thể cập nhật trạng thái yêu cầu.",
  updateAssignmentError: "Không thể cập nhật phân công nhân sự.",
  addNoteError: "Không thể thêm ghi chú.",
  statusActionLabel: {
    PENDING: "Chờ tiếp nhận",
    ACKNOWLEDGED: "Tiếp nhận",
    COMPLETED: "Hoàn thành",
    CANCELLED: "Hủy",
    REJECTED: "Từ chối",
  },
};

function hasDisplayableTimelineEvent(event: NonNullable<HotelGuestRequest["events"]>[number]): boolean {
  return Boolean(event.status || event.type || event.note?.trim());
}

export function RequestDetailClient({
  hotelId,
  initialRequest,
  labels = defaultLabels,
  apiBasePath = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/requests`,
  readOnly = false,
  staffOptions,
}: RequestDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [request, setRequest] = useState(initialRequest);
  const [assignment, setAssignment] = useState(initialRequest.assignedToUserId ?? "");
  const [assignmentNote, setAssignmentNote] = useState("");
  const [note, setNote] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedStaff, setFetchedStaff] = useState<StaffOption[]>([]);

  useEffect(() => {
    let active = true;
    async function fetchStaff() {
      try {
        const res = await requestInternalApiEnvelope<{
          items?: Array<{ id: string; fullName?: string; name?: string; role?: string; roles?: Array<{ name: string }> }>;
        }>(`/api/owner/staff?hotelId=${encodeURIComponent(hotelId)}&limit=100`, {
          method: "GET",
        });
        if (active && res?.data?.items) {
          const list = res.data.items.map((u) => ({
            id: u.id,
            name: u.fullName || u.name || "Nhân viên",
            role: u.roles?.[0]?.name || u.role,
          }));
          setFetchedStaff(list);
        }
      } catch {
        // Fallback gracefully
      }
    }
    void fetchStaff();
    return () => {
      active = false;
    };
  }, [hotelId]);

  const combinedStaff = useMemo(() => {
    const map = new Map<string, StaffOption>();
    (staffOptions ?? []).forEach((s) => map.set(s.id, s));
    fetchedStaff.forEach((s) => map.set(s.id, s));
    if (request.assignedToUser?.id) {
      map.set(request.assignedToUser.id, {
        id: request.assignedToUser.id,
        name: request.assignedToUser.name || "Nhân viên phụ trách",
      });
    }
    return Array.from(map.values());
  }, [staffOptions, fetchedStaff, request.assignedToUser]);

  async function reload() {
    const fresh = await requestInternalApi<HotelGuestRequest>(
      `${apiBasePath}/${encodeURIComponent(request.id)}`,
      { method: "GET" },
    );
    setRequest(fresh);
    setAssignment(fresh.assignedToUserId ?? "");
    queryClient.invalidateQueries({ queryKey: ["hotel-ops", hotelId] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["hotel-requests", hotelId] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["owner-requests", hotelId] }).catch(() => {});

  }

  async function transition(status: GuestRequestStatus) {
    const actionLabel = labels.statusActionLabel[status] || status;
    const confirmResult = await showConfirmDialog({
      title: "Xác nhận chuyển trạng thái?",
      text: `Bạn có chắc chắn muốn chuyển yêu cầu sang trạng thái "${actionLabel}"?`,
      confirmText: actionLabel,
      cancelText: "Hủy bỏ",
    });
    if (!confirmResult.isConfirmed) return;

    setIsSaving(true);
    setError(null);
    try {
      const updated = (await requestInternalApiEnvelope<HotelGuestRequest>(
        `${apiBasePath}/${encodeURIComponent(request.id)}/status`,
        { method: "PATCH", body: { status, note: statusNote.trim() || undefined } },
      )).data;
      setRequest(updated);
      setStatusNote("");
      await reload();
      await showSuccessAlert(
        "Cập nhật thành công",
        `Đã chuyển trạng thái yêu cầu sang "${actionLabel}".`,
      );
    } catch {
      setError(labels.updateStatusError);
      await showErrorAlert("Lỗi cập nhật trạng thái", labels.updateStatusError);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const assignedStaff = combinedStaff.find((s) => s.id === assignment);
    const assignedName = assignedStaff ? assignedStaff.name : (assignment ? "nhân sự đã chọn" : "chưa phân công");
    const confirmResult = await showConfirmDialog({
      title: "Xác nhận phân công nhân sự?",
      text: assignment
        ? `Bạn có chắc chắn muốn phân công yêu cầu này cho ${assignedName}?`
        : "Bạn có chắc chắn muốn hủy phân công nhân sự cho yêu cầu này?",
      confirmText: "Lưu phân công",
      cancelText: "Hủy bỏ",
    });
    if (!confirmResult.isConfirmed) return;

    setIsSaving(true);
    setError(null);
    try {
      const updated = (await requestInternalApiEnvelope<HotelGuestRequest>(
        `${apiBasePath}/${encodeURIComponent(request.id)}/assignment`,
        {
          method: "PATCH",
          body: {
            assignedToUserId: assignment.trim() || null,
            note: assignmentNote.trim() || undefined,
          },
        },
      )).data;
      setRequest(updated);
      setAssignmentNote("");
      await reload();
      await showSuccessAlert(
        "Phân công thành công",
        assignment ? `Đã phân công yêu cầu cho ${assignedName}.` : "Đã hủy phân công nhân sự.",
      );
    } catch {
      setError(labels.updateAssignmentError);
      await showErrorAlert("Lỗi phân công", labels.updateAssignmentError);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) {
      return;
    }
    const confirmResult = await showConfirmDialog({
      title: "Xác nhận thêm ghi chú?",
      text: "Bạn có chắc chắn muốn thêm ghi chú nội bộ này vào nhật ký yêu cầu?",
      confirmText: "Thêm ghi chú",
      cancelText: "Hủy bỏ",
    });
    if (!confirmResult.isConfirmed) return;

    setIsSaving(true);
    setError(null);
    try {
      await requestInternalApiEnvelope(
        `${apiBasePath}/${encodeURIComponent(request.id)}/events`,
        { method: "POST", body: { note: note.trim() } },
      );
      setNote("");
      await reload();
      await showSuccessAlert(
        "Thêm ghi chú thành công",
        "Ghi chú nội bộ đã được lưu vào nhật ký tiến trình.",
      );
    } catch {
      setError(labels.addNoteError);
      await showErrorAlert("Lỗi thêm ghi chú", labels.addNoteError);
    } finally {
      setIsSaving(false);
    }
  }

  const nextStatuses = validNextRequestStatuses[request.status];
  const events = (request.events ?? []).filter(hasDisplayableTimelineEvent);

  return (
    <div className={`grid gap-6 ${readOnly ? "" : "xl:grid-cols-[1fr_380px]"}`}>
      <section className="space-y-6">
        {error ? <div className="rounded-lg border border-[var(--error)] bg-[var(--error-container)] p-3 text-sm font-semibold text-[var(--on-error-container)]">{error}</div> : null}

        <article className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone(request.status)}`}>{requestStatusLabelMap[request.status]}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${priorityTone(request.priority)}`}>{requestPriorityLabelMap[request.priority]}</span>
              </div>
              <h2 className="vs-display text-3xl font-semibold text-[var(--primary)]">{getRequestTitle(request)}</h2>
              <p className="mt-2 text-sm text-[var(--on-surface-variant)]">{requestTypeLabelMap[request.type]} - {labels.created} {formatOpsDateTime(request.createdAt)}</p>
            </div>
            <div className="rounded-lg bg-[var(--surface-container-low)] px-4 py-3 text-sm">
              <p className="font-semibold text-[var(--primary)]">{getRoomLabel(request)}</p>
              <p className="text-[var(--on-surface-variant)]">{getGuestLabel(request)}</p>
            </div>
          </div>

          {request.details ? <p className="mt-6 rounded-lg bg-[var(--surface-container-low)] p-4 text-sm leading-6 text-[var(--on-surface-variant)]">{request.details}</p> : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-[color:rgba(198,197,213,0.2)] p-4"><p className="text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{labels.reservation}</p><p className="mt-1 font-semibold">{request.stay?.reservationCode ?? "-"}</p></div>
            <div className="rounded-lg border border-[color:rgba(198,197,213,0.2)] p-4"><p className="text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{labels.serviceItem}</p><p className="mt-1 font-semibold">{request.serviceItem?.name ?? labels.rawRequest}</p></div>
            <div className="rounded-lg border border-[color:rgba(198,197,213,0.2)] p-4"><p className="text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{labels.price}</p><p className="mt-1 font-semibold">{request.serviceItem ? formatMoney(request.serviceItem) : "-"}</p></div>
          </div>
        </article>

        {!readOnly ? (
          <article className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-[var(--primary)]">{labels.statusActions}</h3>
            <textarea value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder={labels.optionalTransitionNote} className="mb-4 min-h-20 w-full rounded-lg border px-3 py-2 text-sm" />
            {nextStatuses.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((status) => <button key={status} type="button" disabled={isSaving} onClick={() => void transition(status)} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-60">{labels.statusActionLabel[status]}</button>)}
              </div>
            ) : <p className="text-sm text-[var(--on-surface-variant)]">{labels.terminalState}</p>}
          </article>
        ) : null}

        <article className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-[var(--primary)]">{labels.timeline}</h3>
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border border-[color:rgba(198,197,213,0.18)] p-4">
                <div className="flex items-center justify-between gap-3"><p className="font-semibold">{event.status ? requestStatusLabelMap[event.status] : event.type ?? labels.note}</p><span className="text-xs text-[var(--on-surface-variant)]">{formatOpsDateTime(event.createdAt)}</span></div>
                {event.note ? <p className="mt-2 text-sm text-[var(--on-surface-variant)]">{event.note}</p> : null}
              </div>
            ))}
            {events.length === 0 ? <p className="text-sm text-[var(--on-surface-variant)]">{labels.noTimeline}</p> : null}
          </div>
        </article>
      </section>

      {!readOnly ? (
        <aside className="space-y-6">
          <form onSubmit={saveAssignment} className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-[var(--primary)]">{labels.assignment}</h3>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]" htmlFor="assignedToUserId">{labels.assignedUserId}</label>
            <select
              id="assignedToUserId"
              value={assignment}
              onChange={(event) => setAssignment(event.target.value)}
              className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-2xs focus:border-[#25483f] focus:outline-none focus:ring-2 focus:ring-[#25483f]/20 transition cursor-pointer"
            >
              <option value="">-- Chưa phân công nhân sự --</option>
              {combinedStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.role ? `• ${s.role}` : ""}
                </option>
              ))}
              {assignment && !combinedStaff.some((s) => s.id === assignment) ? (
                <option value={assignment}>
                  {request.assignedToUser?.name
                    ? `${request.assignedToUser.name} (${assignment.slice(0, 8)}...)`
                    : `Nhân sự (${assignment.slice(0, 8)}...)`}
                </option>
              ) : null}
            </select>
            <textarea value={assignmentNote} onChange={(event) => setAssignmentNote(event.target.value)} placeholder={labels.optionalAssignmentNote} className="mb-4 min-h-20 w-full rounded-lg border px-3 py-2 text-sm" />
            <button disabled={isSaving} className="w-full rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-60">{labels.saveAssignment}</button>
          </form>

          <form onSubmit={saveNote} className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-[var(--primary)]">{labels.internalNote}</h3>
            <textarea required value={note} onChange={(event) => setNote(event.target.value)} placeholder={labels.internalNotePlaceholder} className="mb-4 min-h-28 w-full rounded-lg border px-3 py-2 text-sm" />
            <button disabled={isSaving} className="w-full rounded-lg bg-[var(--secondary-container)] px-4 py-2 text-sm font-semibold text-[var(--on-secondary-container)] disabled:opacity-60">{labels.addNote}</button>
          </form>
        </aside>
      ) : null}
    </div>
  );
}
