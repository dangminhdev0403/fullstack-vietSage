"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
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
  accessToken: string;
  accessTokenExpiresAt: number | null;
  initialRequest: HotelGuestRequest;
  labels?: RequestDetailLabels;
};

const defaultLabels: RequestDetailLabels = {
  statusActions: "Status actions",
  optionalTransitionNote: "Optional transition note",
  terminalState: "This request is in a terminal state.",
  timeline: "Timeline",
  noTimeline: "No timeline events yet.",
  assignment: "Assignment",
  assignedUserId: "Assigned user ID",
  assignedUserIdPlaceholder: "Paste staff user ID",
  optionalAssignmentNote: "Optional assignment note",
  saveAssignment: "Save assignment",
  internalNote: "Internal note",
  internalNotePlaceholder: "Add an internal note",
  addNote: "Add note",
  reservation: "Reservation",
  serviceItem: "Service item",
  rawRequest: "Raw request",
  price: "Price",
  created: "Created",
  note: "Note",
  updateStatusError: "Could not update request status.",
  updateAssignmentError: "Could not update assignment.",
  addNoteError: "Could not add note.",
  statusActionLabel: {
    CREATED: "Created",
    ACKNOWLEDGED: "Acknowledge",
    IN_PROGRESS: "Start",
    COMPLETED: "Complete",
    CANCELLED: "Cancel",
    FAILED: "Fail",
  },
};

function hasDisplayableTimelineEvent(event: NonNullable<HotelGuestRequest["events"]>[number]): boolean {
  return Boolean(event.status || event.type || event.note?.trim());
}

export function RequestDetailClient({ hotelId, accessToken, accessTokenExpiresAt, initialRequest, labels = defaultLabels }: RequestDetailClientProps) {
  const router = useRouter();
  const [request, setRequest] = useState(initialRequest);
  const [assignment, setAssignment] = useState(initialRequest.assignedToUserId ?? "");
  const [assignmentNote, setAssignmentNote] = useState("");
  const [note, setNote] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const fresh = await hotelOpsService.getRequest(hotelId, request.id, accessToken, accessTokenExpiresAt);
    setRequest(fresh);
    setAssignment(fresh.assignedToUserId ?? "");
    router.refresh();
  }

  async function transition(status: GuestRequestStatus) {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await hotelOpsService.updateRequestStatus(hotelId, request.id, { status, note: statusNote.trim() || undefined }, accessToken, accessTokenExpiresAt);
      setRequest(updated);
      setStatusNote("");
      await reload();
    } catch {
      setError(labels.updateStatusError);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const updated = await hotelOpsService.updateRequestAssignment(hotelId, request.id, {
        assignedToUserId: assignment.trim() || null,
        note: assignmentNote.trim() || undefined,
      }, accessToken, accessTokenExpiresAt);
      setRequest(updated);
      setAssignmentNote("");
      await reload();
    } catch {
      setError(labels.updateAssignmentError);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await hotelOpsService.createRequestEvent(hotelId, request.id, { note: note.trim() }, accessToken, accessTokenExpiresAt);
      setNote("");
      await reload();
    } catch {
      setError(labels.addNoteError);
    } finally {
      setIsSaving(false);
    }
  }

  const nextStatuses = validNextRequestStatuses[request.status];
  const events = (request.events ?? []).filter(hasDisplayableTimelineEvent);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
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

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-[color:rgba(198,197,213,0.2)] p-4"><p className="text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{labels.reservation}</p><p className="mt-1 font-semibold">{request.stay?.reservationCode ?? "-"}</p></div>
            <div className="rounded-lg border border-[color:rgba(198,197,213,0.2)] p-4"><p className="text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{labels.serviceItem}</p><p className="mt-1 font-semibold">{request.serviceItem?.name ?? labels.rawRequest}</p></div>
            <div className="rounded-lg border border-[color:rgba(198,197,213,0.2)] p-4"><p className="text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{labels.price}</p><p className="mt-1 font-semibold">{request.serviceItem ? formatMoney(request.serviceItem) : "-"}</p></div>
          </div>
        </article>

        <article className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-[var(--primary)]">{labels.statusActions}</h3>
          <textarea value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder={labels.optionalTransitionNote} className="mb-4 min-h-20 w-full rounded-lg border px-3 py-2 text-sm" />
          {nextStatuses.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map((status) => <button key={status} type="button" disabled={isSaving} onClick={() => void transition(status)} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-60">{labels.statusActionLabel[status]}</button>)}
            </div>
          ) : <p className="text-sm text-[var(--on-surface-variant)]">{labels.terminalState}</p>}
        </article>

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

      <aside className="space-y-6">
        <form onSubmit={saveAssignment} className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-[var(--primary)]">{labels.assignment}</h3>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]" htmlFor="assignedToUserId">{labels.assignedUserId}</label>
          <input id="assignedToUserId" value={assignment} onChange={(event) => setAssignment(event.target.value)} placeholder={labels.assignedUserIdPlaceholder} className="mb-3 w-full rounded-lg border px-3 py-2 text-sm" />
          <textarea value={assignmentNote} onChange={(event) => setAssignmentNote(event.target.value)} placeholder={labels.optionalAssignmentNote} className="mb-4 min-h-20 w-full rounded-lg border px-3 py-2 text-sm" />
          <button disabled={isSaving} className="w-full rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-60">{labels.saveAssignment}</button>
        </form>

        <form onSubmit={saveNote} className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-[var(--primary)]">{labels.internalNote}</h3>
          <textarea required value={note} onChange={(event) => setNote(event.target.value)} placeholder={labels.internalNotePlaceholder} className="mb-4 min-h-28 w-full rounded-lg border px-3 py-2 text-sm" />
          <button disabled={isSaving} className="w-full rounded-lg bg-[var(--secondary-container)] px-4 py-2 text-sm font-semibold text-[var(--on-secondary-container)] disabled:opacity-60">{labels.addNote}</button>
        </form>
      </aside>
    </div>
  );
}
