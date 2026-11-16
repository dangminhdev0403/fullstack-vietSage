import { Temporal } from "@js-temporal/polyfill";
import { VIETNAM_TIME_ZONE } from "../../../common/time/vietnam-temporal";

export type ReconciliationKind = "VIETNAMESE" | "FOREIGN";

export interface LocalReconciliationGuest {
  id: string;
  stayId: string;
  roomId: string;
  roomNumber: string;
  groupCode: string | null;
  fullName: string;
  identityNumber: string | null;
  kind: ReconciliationKind | null;
  documentType: number | null;
  nationality: string | null;
  checkedInAt: string | null;
  plannedCheckOutAt: string | null;
  declarationStatus: string | null;
  providerMessage: string | null;
  linkedBcaId: string | null;
  draftPayload?: Record<string, unknown>;
}

export interface ProviderReconciliationGuest {
  id: string;
  kind: ReconciliationKind;
  csltId: string;
  fullName: string;
  identityNumber: string | null;
  documentType: number | null;
  nationality: string | null;
  arrivalDay: string | null;
  checkedInAt: string | null;
  plannedCheckOutAt: string | null;
  departed: boolean;
  checkedOutAt?: string | null;
  roomNumber: string | null;
  isActive: boolean;
  draftPayload?: Record<string, unknown>;
}

export interface ReconciliationRow {
  id: string;
  source: "VIETSAGE" | "BCA_ONLY";
  kind: ReconciliationKind | null;
  occupantId: string | null;
  stayId: string | null;
  roomId: string | null;
  roomNumber: string | null;
  groupCode: string | null;
  fullName: string;
  identityNumber: string | null;
  documentType: number | null;
  nationality: string | null;
  checkedInAt: string | null;
  plannedCheckOutAt: string | null;
  checkedOutAt: string | null;
  status: "MATCHED" | "NOT_FOUND" | "REVIEW" | null;
  reason: string | null;
  bcaRecordId: string | null;
  declarationStatus: string | null;
  providerMessage: string | null;
  canRetry: boolean;
  draftPayload: Record<string, unknown> | null;
}

function normalized(value: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : null;
}

/** A check-in is an instant; never interpret a bare date in the host timezone. */
export function reconciliationArrivalDay(value: string | null): string | null {
  if (!value) return null;
  try {
    return Temporal.Instant.from(value).toZonedDateTimeISO(VIETNAM_TIME_ZONE).toPlainDate().toString();
  } catch {
    return null;
  }
}

function calendarDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    return Temporal.PlainDate.from(value, { overflow: "reject" }).toString();
  } catch {
    return null;
  }
}

function qualifier(guest: Pick<LocalReconciliationGuest, "kind" | "documentType" | "nationality">): string | null {
  if (guest.kind === "VIETNAMESE") {
    return typeof guest.documentType === "number" && Number.isSafeInteger(guest.documentType) && guest.documentType > 0
      ? String(guest.documentType) : null;
  }
  return guest.kind === "FOREIGN" ? normalized(guest.nationality) : null;
}

function providerDay(guest: ProviderReconciliationGuest): string | null {
  const day = calendarDay(guest.arrivalDay);
  const instantDay = guest.checkedInAt ? reconciliationArrivalDay(guest.checkedInAt) : null;
  return day && (!guest.checkedInAt || day === instantDay) ? day : null;
}

function key(kind: ReconciliationKind | null, number: string | null, document: string | null, day: string | null): string | null {
  return kind && number && document && day ? JSON.stringify([kind, number, document, day]) : null;
}

function localKey(guest: LocalReconciliationGuest): string | null {
  return key(guest.kind, normalized(guest.identityNumber), qualifier(guest), reconciliationArrivalDay(guest.checkedInAt));
}

function remoteKey(guest: ProviderReconciliationGuest): string | null {
  return normalized(guest.id)
    ? key(guest.kind, normalized(guest.identityNumber), qualifier(guest), providerDay(guest)) : null;
}

function identityKey(guest: Pick<LocalReconciliationGuest, "kind" | "identityNumber">): string | null {
  const number = normalized(guest.identityNumber);
  return guest.kind && number ? JSON.stringify([guest.kind, number]) : null;
}

function row(guest: LocalReconciliationGuest): ReconciliationRow {
  return {
    id: `vietsage:${guest.id}`, source: "VIETSAGE", kind: guest.kind, occupantId: guest.id,
    stayId: guest.stayId, roomId: guest.roomId, roomNumber: guest.roomNumber, groupCode: guest.groupCode,
    fullName: guest.fullName, identityNumber: guest.identityNumber, documentType: guest.documentType,
    nationality: guest.nationality, checkedInAt: guest.checkedInAt, plannedCheckOutAt: guest.plannedCheckOutAt,
    checkedOutAt: null, status: null, reason: null, bcaRecordId: null,
    declarationStatus: guest.declarationStatus, providerMessage: guest.providerMessage, canRetry: false, draftPayload: guest.draftPayload ?? null,
  };
}

/** Pure view composition. This function neither changes declaration state nor creates local guests. */
export function reconcileGuests(
  local: LocalReconciliationGuest[],
  provider: ProviderReconciliationGuest[],
  completeKinds: Set<ReconciliationKind>,
  csltId: string,
): ReconciliationRow[] {
  const providerId = (guest: Pick<ProviderReconciliationGuest, "kind" | "id">) => JSON.stringify([guest.kind, guest.id]);
  const byLinkedId = new Map<string, ProviderReconciliationGuest[]>();
  for (const guest of provider) {
    const id = providerId(guest);
    byLinkedId.set(id, [...(byLinkedId.get(id) ?? []), guest]);
  }
  const scoped = csltId.trim() ? provider.filter((guest) => guest.csltId === csltId) : [];
  const byId = new Map<string, ProviderReconciliationGuest>();
  const conflictingIds = new Set<string>();
  const fingerprint = (value: ProviderReconciliationGuest) => JSON.stringify([
    identityKey(value), qualifier(value), providerDay(value) ?? [value.arrivalDay, value.checkedInAt],
    value.isActive, value.departed,
  ]);
  for (const guest of scoped) {
    const id = providerId(guest);
    const previous = byId.get(id);
    if (previous && fingerprint(previous) !== fingerprint(guest)) conflictingIds.add(id);
    if (!previous) byId.set(id, guest);
  }
  const remote = [...byId.values()];
  const byKey = new Map<string, ProviderReconciliationGuest[]>();
  const remoteByIdentity = new Map<string, ProviderReconciliationGuest[]>();
  for (const guest of scoped) {
    const identity = identityKey(guest);
    if (identity) remoteByIdentity.set(identity, [...(remoteByIdentity.get(identity) ?? []), guest]);
  }
  for (const guest of remote) {
    const matchKey = remoteKey(guest);
    if (matchKey) byKey.set(matchKey, [...(byKey.get(matchKey) ?? []), guest]);
  }
  const localCounts = new Map<string, number>();
  for (const guest of local) {
    const matchKey = localKey(guest);
    if (matchKey) localCounts.set(matchKey, (localCounts.get(matchKey) ?? 0) + 1);
  }
  const consumed = new Set<string>();
  const result = local.map((guest) => {
    const item = row(guest);
    const matchKey = localKey(guest);
    if (!matchKey) {
      item.status = "REVIEW";
      item.reason = !guest.kind ? "Chưa xác định nhóm quốc tịch."
        : !normalized(guest.identityNumber) ? "Thiếu số giấy tờ."
          : !qualifier(guest) ? "Thiếu loại giấy tờ hoặc quốc tịch."
            : "Chưa xác định ngày nhận phòng.";
      return item;
    }
    if (!csltId.trim() || !completeKinds.has(guest.kind!)) return item;
    if (localCounts.get(matchKey)! > 1) {
      item.status = "REVIEW";
      item.reason = "Có nhiều khách hoặc lượt lưu trú cùng giấy tờ và ngày đến.";
      return item;
    }
    const linked = guest.linkedBcaId
      ? byLinkedId.get(providerId({ kind: guest.kind!, id: guest.linkedBcaId })) ?? [] : [];
    if (linked.some((candidate) => candidate.csltId !== csltId || remoteKey(candidate) !== matchKey)) {
      item.status = "REVIEW";
      item.reason = "Hồ sơ BCA đã liên kết không khớp cơ sở, giấy tờ hoặc ngày đến.";
      return item;
    }
    const candidates = byKey.get(matchKey) ?? [];
    const uncertain = (remoteByIdentity.get(identityKey(guest)!) ?? []).some((candidate) =>
      !remoteKey(candidate) || conflictingIds.has(providerId(candidate)) ||
      (providerDay(candidate) === reconciliationArrivalDay(guest.checkedInAt) && qualifier(candidate) !== qualifier(guest)));
    if (uncertain || candidates.length > 1 || candidates.some((candidate) => conflictingIds.has(providerId(candidate)))) {
      item.status = "REVIEW";
      item.reason = uncertain ? "Thông tin giấy tờ hoặc ngày đến trên BCA chưa khớp hoặc chưa đầy đủ."
        : "Có nhiều kết quả hoặc dữ liệu BCA không thống nhất.";
      return item;
    }
    if (candidates.length === 1) {
      item.status = "MATCHED";
      item.bcaRecordId = candidates[0].id;
      consumed.add(providerId(candidates[0]));
    } else {
      item.status = "NOT_FOUND";
      item.canRetry = guest.declarationStatus === null || ["DRAFT", "READY", "FAILED"].includes(guest.declarationStatus);
    }
    return item;
  });

  for (const guest of remote) {
    const id = providerId(guest);
    if (consumed.has(id) || conflictingIds.has(id)) continue;
    if (!remoteKey(guest)) continue;
    result.push({
      id: `bca:${guest.kind}:${guest.id}`, source: "BCA_ONLY", kind: guest.kind, occupantId: null,
      stayId: null, roomId: null, roomNumber: guest.roomNumber, groupCode: null, fullName: guest.fullName,
      identityNumber: guest.identityNumber, documentType: guest.documentType, nationality: guest.nationality,
      checkedInAt: guest.checkedInAt, plannedCheckOutAt: guest.plannedCheckOutAt, checkedOutAt: guest.checkedOutAt ?? null, status: "MATCHED",
      reason: null, bcaRecordId: guest.id, declarationStatus: null, providerMessage: null, canRetry: false, draftPayload: guest.draftPayload ?? null,
    });
  }
  return result;
}
