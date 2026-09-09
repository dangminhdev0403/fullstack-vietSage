import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { IntakePayloadV2 } from "../intake/intake-contract";

export const PAIR_MS = 120_000;
export const SHIFT_MS = 4 * 60 * 60 * 1_000;
export const SCAN_MS = 120_000;
const DESK_MS = 15_000;
type Owner = { hotelId: string; operatorId: string; parentId: string; deskId: string };
type Receipt = { requestId: string; transferId: string; status: "received" | "acknowledged"; expiresAt: number };
type Target = { requestId: string; key: string; label: string; expiresAt: number; status: "waiting" | "received" | "document" | "acknowledged"; transferId: string | null };
type PendingDocument = { requestId: string; transferId: string; contentType: string; bytes: Uint8Array; hash: string };
export type MobileShiftView = {
  sessionId: string; phase: "pairing" | "pending" | "active";
  hotelLabel: string; operatorLabel: string; comparisonCode: string | null;
  expiresAt: number; deskOnline: boolean; target: Target | null;
  receipt: Receipt | null; payload?: IntakePayloadV2 | null;
};
type Shift = Owner & Omit<MobileShiftView, "deskOnline"> & {
  exchangeHash: string | null; phoneHash: string | null; deskSeenAt: number;
  accessToken: string; payload: IntakePayloadV2 | null; payloadHash: string | null;
  document: PendingDocument | null;
  usedTransfers: Set<string>;
};
export class MobileShiftError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code = "SESSION_EXPIRED", status = 404) {
    super(code); this.code = code; this.status = status;
  }
}
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const matches = (s: Shift, o: Owner) => s.hotelId === o.hotelId && s.operatorId === o.operatorId && s.parentId === o.parentId && s.deskId === o.deskId;

// ponytail: single-replica volatile relay; replace with shared atomic TTL storage before adding frontend replicas.
export class MobileShiftStore {
  private readonly sessions = new Map<string, Shift>();
  private readonly now: () => number;
  private readonly limit: number;
  constructor(now: () => number = Date.now, limit = 200) { this.now = now; this.limit = limit; }

  cleanup() {
    for (const [id, s] of this.sessions) {
      if (this.now() >= s.expiresAt) { this.sessions.delete(id); continue; }
      if (s.target && (this.now() >= s.target.expiresAt || this.now() - s.deskSeenAt >= DESK_MS)) {
        s.target = null; s.payload = null; s.payloadHash = null; s.document = null;
      }
      if (s.receipt && this.now() >= s.receipt.expiresAt) s.receipt = null;
    }
  }
  private view(s: Shift, desktop = false): MobileShiftView {
    return {
      sessionId: s.sessionId, phase: s.phase, hotelLabel: s.hotelLabel, operatorLabel: s.operatorLabel,
      comparisonCode: s.phase === "pending" ? s.comparisonCode : null, expiresAt: s.expiresAt,
      deskOnline: this.now() - s.deskSeenAt < DESK_MS,
      target: s.target ? { ...s.target } : null, receipt: s.receipt ? { ...s.receipt } : null,
      ...(desktop ? { payload: s.payload ? structuredClone(s.payload) : null } : {}),
    };
  }
  private owned(o: Owner, id: string) {
    this.cleanup();
    const s = this.sessions.get(id);
    if (!s || !matches(s, o)) throw new MobileShiftError();
    return s;
  }
  private byPhone(token: string) {
    this.cleanup();
    const digest = hash(token);
    const s = [...this.sessions.values()].find((item) => item.phoneHash === digest);
    if (!s) throw new MobileShiftError();
    return s;
  }
  create(o: Owner, labels: Pick<MobileShiftView, "hotelLabel" | "operatorLabel">, accessToken: string) {
    this.cleanup();
    for (const [id, s] of this.sessions) if (matches(s, o)) this.sessions.delete(id);
    if (this.sessions.size >= this.limit) throw new MobileShiftError("CAPACITY", 429);
    const code = randomBytes(32).toString("hex");
    const s: Shift = {
      ...o, ...labels, sessionId: randomUUID(), phase: "pairing", comparisonCode: null,
      expiresAt: this.now() + PAIR_MS, exchangeHash: hash(code), phoneHash: null,
      accessToken, deskSeenAt: this.now(), target: null, payload: null, payloadHash: null, document: null,
      receipt: null, usedTransfers: new Set(),
    };
    this.sessions.set(s.sessionId, s);
    return { ...this.view(s, true), code };
  }
  claim(code: string) {
    this.cleanup();
    const s = [...this.sessions.values()].find((item) => item.exchangeHash === hash(code));
    if (!s || s.phase !== "pairing") throw new MobileShiftError();
    const token = randomBytes(32).toString("hex");
    s.exchangeHash = null; s.phoneHash = hash(token); s.phase = "pending";
    s.comparisonCode = String(randomInt(100_000, 1_000_000));
    return { token, view: this.view(s) };
  }
  approve(o: Owner, id: string, code: string) {
    const s = this.owned(o, id);
    if (s.phase !== "pending" || s.comparisonCode !== code) throw new MobileShiftError("PAIRING_MISMATCH", 409);
    s.phase = "active"; s.expiresAt = this.now() + SHIFT_MS; s.deskSeenAt = this.now();
    s.comparisonCode = null;
    return this.view(s, true);
  }
  desk(o: Owner, accessToken: string) {
    this.cleanup();
    const s = [...this.sessions.values()].find((item) => matches(item, o));
    if (!s) return null;
    s.accessToken = accessToken; s.deskSeenAt = this.now();
    return this.view(s, true);
  }
  phone(token: string) { return this.view(this.byPhone(token)); }
  // Server-only authorization snapshot. Never serialize this method's return value to clients.
  parent(token: string) {
    const s = this.byPhone(token);
    return { accessToken: s.accessToken, hotelId: s.hotelId, operatorId: s.operatorId, parentId: s.parentId };
  }
  target(o: Owner, id: string, key: string, label: string) {
    const s = this.owned(o, id);
    if (s.phase !== "active") throw new MobileShiftError("NOT_APPROVED", 409);
    s.deskSeenAt = this.now(); s.payload = null; s.payloadHash = null; s.document = null;
    s.target = { requestId: randomUUID(), key, label, expiresAt: Math.min(this.now() + SCAN_MS, s.expiresAt), status: "waiting", transferId: null };
    return this.view(s, true);
  }
  submit(token: string, requestId: string, payload: IntakePayloadV2) {
    const s = this.byPhone(token);
    if (s.phase !== "active") throw new MobileShiftError("NOT_APPROVED", 409);
    if (s.receipt?.requestId === requestId && s.receipt.transferId === payload.transferId && s.receipt.status === "acknowledged") return this.view(s);
    const t = s.target;
    if (!t || t.requestId !== requestId || this.now() - s.deskSeenAt >= DESK_MS) throw new MobileShiftError("STALE_TARGET", 409);
    const digest = hash(JSON.stringify({ guest: payload.guest, verification: payload.verification }));
    if (t.status !== "waiting") {
      if (t.transferId !== payload.transferId || s.payloadHash !== digest) throw new MobileShiftError("DUPLICATE_TRANSFER", 409);
      return this.view(s);
    }
    if (s.usedTransfers.has(payload.transferId)) throw new MobileShiftError("DUPLICATE_TRANSFER", 409);
    if (s.usedTransfers.size >= 2_000) throw new MobileShiftError("CAPACITY", 429);
    s.usedTransfers.add(payload.transferId);
    s.payload = structuredClone(payload); s.payloadHash = digest; t.status = "received"; t.transferId = payload.transferId;
    s.receipt = { requestId, transferId: payload.transferId, status: "received", expiresAt: t.expiresAt };
    return this.view(s);
  }
  submitDocument(token: string, requestId: string, transferId: string, contentType: string, bytes: Uint8Array) {
    const s = this.byPhone(token);
    if (s.phase !== "active") throw new MobileShiftError("NOT_APPROVED", 409);
    if (s.receipt?.requestId === requestId && s.receipt.transferId === transferId && s.receipt.status === "acknowledged") return this.view(s);
    const t = s.target;
    if (!t || t.requestId !== requestId || this.now() - s.deskSeenAt >= DESK_MS) throw new MobileShiftError("STALE_TARGET", 409);
    const digest = hash(bytes);
    if (t.status !== "waiting") {
      if (t.status !== "document" || t.transferId !== transferId || s.document?.hash !== digest) throw new MobileShiftError("DUPLICATE_TRANSFER", 409);
      return this.view(s);
    }
    if (s.usedTransfers.has(transferId)) throw new MobileShiftError("DUPLICATE_TRANSFER", 409);
    if (s.usedTransfers.size >= 2_000) throw new MobileShiftError("CAPACITY", 429);
    // ponytail: O(n) over <=200 sessions; use shared volatile blob storage when scaling horizontally.
    const retainedBytes = [...this.sessions.values()].reduce((total, item) => total + (item.document?.bytes.byteLength ?? 0), 0);
    if (retainedBytes + bytes.byteLength > 64 * 1024 * 1024) throw new MobileShiftError("CAPACITY", 429);
    s.usedTransfers.add(transferId);
    s.document = { requestId, transferId, contentType, bytes: bytes.slice(), hash: digest };
    t.status = "document"; t.transferId = transferId;
    s.receipt = { requestId, transferId, status: "received", expiresAt: t.expiresAt };
    return this.view(s);
  }
  document(o: Owner, id: string, requestId: string) {
    const s = this.owned(o, id);
    const document = s.document;
    if (!s.target || s.target.status !== "document" || s.target.requestId !== requestId || !document || document.requestId !== requestId) {
      throw new MobileShiftError("DOCUMENT_NOT_FOUND", 404);
    }
    return { ...document, bytes: document.bytes.slice() };
  }
  ack(o: Owner, id: string, requestId: string, transferId: string) {
    const s = this.owned(o, id);
    if (s.receipt?.requestId === requestId && s.receipt.transferId === transferId && s.receipt.status === "acknowledged") return this.view(s, true);
    if (!s.target || s.target.requestId !== requestId || s.target.transferId !== transferId || !["received", "document"].includes(s.target.status)) throw new MobileShiftError("STALE_TARGET", 409);
    s.target.status = "acknowledged"; s.payload = null; s.payloadHash = null; s.document = null;
    s.receipt = { requestId, transferId, status: "acknowledged", expiresAt: this.now() + SCAN_MS };
    return this.view(s, true);
  }
  discard(o: Owner, id: string, requestId: string) {
    const s = this.owned(o, id);
    if (s.target?.requestId === requestId) { s.target = null; s.payload = null; s.payloadHash = null; s.document = null; }
    return this.view(s, true);
  }
  revoke(o: Owner, id: string) { this.owned(o, id); this.sessions.delete(id); }
  disconnect(token: string) { this.sessions.delete(this.byPhone(token).sessionId); }
}
