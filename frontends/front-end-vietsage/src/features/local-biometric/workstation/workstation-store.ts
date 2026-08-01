import type { IntakePayload, IntakePayloadV2 } from "../intake/intake-contract";

type Pairing = { code: string; hotelId: string; operatorId: string; expiresAt: number };
type Workstation = { token: string; hotelId: string; pairedAt: number; lastSeenAt: number; expiresAt: number };
type Scan = {
  scanRequestId: string;
  hotelId: string;
  operatorId: string;
  expiresAt: number;
  payload: IntakePayload | IntakePayloadV2 | null;
  claimedBy: string | null;
  status: "waiting" | "claimed" | "received" | "acknowledged" | "discarded";
};
export type RecognitionInput = {
  providerEventId: string; deviceId: string; deviceUserId: string; occurredAt: string;
  sourceTable: string; verifyType: string; eventCode: string;
  deviceIndex?: string; inOutStatus?: string;
};
export type Recognition = RecognitionInput & { hotelId: string; receivedAt: number };
export type PublicRecognition = Omit<Recognition, "deviceUserId">;

const RECOGNITION_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_RECOGNITIONS = 1_000;

export class WorkstationStore {
  private readonly pairings = new Map<string, Pairing>();
  private readonly workstations = new Map<string, Workstation>();
  private readonly scans = new Map<string, Scan>();
  private readonly recognitions = new Map<string, Recognition>();
  private readonly now: () => number;
  private readonly createSecret: () => string;

  constructor(
    now: () => number = Date.now,
    createSecret: () => string = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
  ) {
    this.now = now;
    this.createSecret = createSecret;
  }

  issuePairing(hotelId: string, operatorId: string, ttlSeconds = 300) {
    const code = this.createSecret();
    const pairing = { code, hotelId, operatorId, expiresAt: this.now() + ttlSeconds * 1_000 };
    this.pairings.set(code, pairing);
    return { code, expiresAt: pairing.expiresAt };
  }

  pair(code: string, ttlSeconds = 30 * 24 * 60 * 60) {
    const pairing = this.pairings.get(code);
    if (!pairing || this.now() >= pairing.expiresAt) return null;
    this.pairings.delete(code);
    const token = this.createSecret();
    const workstation = {
      token,
      hotelId: pairing.hotelId,
      pairedAt: this.now(),
      lastSeenAt: this.now(),
      expiresAt: this.now() + ttlSeconds * 1_000,
    };
    this.workstations.set(token, workstation);
    return { token, hotelId: workstation.hotelId };
  }

  requestScan(hotelId: string, operatorId: string, ttlSeconds = 60) {
    const scanRequestId = crypto.randomUUID();
    const scan: Scan = {
      scanRequestId,
      hotelId,
      operatorId,
      expiresAt: this.now() + ttlSeconds * 1_000,
      payload: null,
      claimedBy: null,
      status: "waiting",
    };
    this.scans.set(scanRequestId, scan);
    return { scanRequestId, expiresAt: scan.expiresAt };
  }

  poll(token: string) {
    const workstation = this.workstations.get(token);
    if (!workstation || this.now() >= workstation.expiresAt) {
      this.workstations.delete(token);
      return null;
    }
    workstation.lastSeenAt = this.now();
    const scan = [...this.scans.values()].find((item) =>
      item.hotelId === workstation.hotelId
      && (item.status === "waiting" || (item.status === "claimed" && item.claimedBy === token))
      && this.now() < item.expiresAt,
    );
    if (!scan) return null;
    scan.claimedBy = token;
    if (scan.status === "waiting") scan.status = "claimed";
    return { scanRequestId: scan.scanRequestId, expiresAt: scan.expiresAt };
  }

  complete(token: string, scanRequestId: string, payload: IntakePayload | IntakePayloadV2) {
    const workstation = this.workstations.get(token);
    const scan = this.scans.get(scanRequestId);
    if (
      !workstation || this.now() >= workstation.expiresAt || !scan || workstation.hotelId !== scan.hotelId
      || scan.claimedBy !== token || this.now() >= scan.expiresAt || scan.status !== "claimed"
    ) return false;
    workstation.lastSeenAt = this.now();
    scan.payload = payload;
    scan.status = "received";
    return true;
  }

  readScan(scanRequestId: string, hotelId: string, operatorId: string) {
    this.cleanupExpired();
    const scan = this.scans.get(scanRequestId);
    if (!scan || scan.hotelId !== hotelId || scan.operatorId !== operatorId || scan.status === "acknowledged" || scan.status === "discarded") return null;
    return { scanRequestId: scan.scanRequestId, expiresAt: scan.expiresAt, payload: scan.payload, status: scan.status };
  }

  acknowledgeScan(scanRequestId: string, hotelId: string, operatorId: string) {
    const scan = this.scans.get(scanRequestId);
    if (!scan || scan.hotelId !== hotelId || scan.operatorId !== operatorId) return false;
    scan.status = "acknowledged";
    scan.payload = null;
    return true;
  }

  discardScan(scanRequestId: string, hotelId: string, operatorId: string) {
    const scan = this.scans.get(scanRequestId);
    if (!scan || scan.hotelId !== hotelId || scan.operatorId !== operatorId) return false;
    scan.status = "discarded";
    scan.payload = null;
    return true;
  }

  cleanupExpired() {
    let count = 0;
    const nowTime = this.now();
    for (const [key, value] of this.scans.entries()) {
      if (nowTime >= value.expiresAt) {
        this.scans.delete(key);
        count++;
      }
    }
    for (const [key, value] of this.pairings.entries()) {
      if (nowTime >= value.expiresAt) {
        this.pairings.delete(key);
        count++;
      }
    }
    for (const [key, value] of this.workstations.entries()) {
      if (nowTime >= value.expiresAt) {
        this.workstations.delete(key);
        count++;
      }
    }
    return count;
  }

  hasOnlineWorkstation(hotelId: string, freshnessMs = 10_000) {
    return [...this.workstations.values()].some((item) =>
      item.hotelId === hotelId && this.now() < item.expiresAt && this.now() - item.lastSeenAt <= freshnessMs,
    );
  }

  ingestRecognition(token: string, payload: RecognitionInput) {
    const workstation = this.workstations.get(token);
    if (!workstation || this.now() >= workstation.expiresAt) return null;
    workstation.lastSeenAt = this.now();
    this.cleanupRecognitions();
    const key = `${workstation.hotelId}\u001f${payload.deviceId}\u001f${payload.providerEventId}`;
    if (this.recognitions.has(key)) return { accepted: true, duplicate: true };
    this.recognitions.set(key, { ...payload, hotelId: workstation.hotelId, receivedAt: this.now() });
    while (this.recognitions.size > MAX_RECOGNITIONS) {
      this.recognitions.delete(this.recognitions.keys().next().value as string);
    }
    return { accepted: true, duplicate: false };
  }

  listRecognitions(hotelId: string, limit = 50): PublicRecognition[] {
    this.cleanupRecognitions();
    return [...this.recognitions.values()]
      .filter((event) => event.hotelId === hotelId)
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .slice(0, Math.min(Math.max(limit, 0), MAX_RECOGNITIONS))
      .map(({ deviceUserId, ...event }) => {
        void deviceUserId;
        return event;
      });
  }

  private cleanupRecognitions() {
    const cutoff = this.now() - RECOGNITION_TTL_MS;
    for (const [key, event] of this.recognitions) {
      if (event.receivedAt < cutoff) this.recognitions.delete(key);
    }
  }

  disconnectHotel(hotelId: string) {
    let count = 0;
    for (const [code, pairing] of this.pairings) {
      if (pairing.hotelId === hotelId) { this.pairings.delete(code); count++; }
    }
    for (const [token, workstation] of this.workstations) {
      if (workstation.hotelId === hotelId) { this.workstations.delete(token); count++; }
    }
    return count;
  }
}

// ponytail: process-local state is for local/dev; replace with Redis before multi-instance deployment.
const globalStore = globalThis as typeof globalThis & { __vietsageWorkstationStore?: WorkstationStore };
const existingStore = globalStore.__vietsageWorkstationStore;
if (existingStore) Object.setPrototypeOf(existingStore, WorkstationStore.prototype);
export const workstationStore = globalStore.__vietsageWorkstationStore ??= new WorkstationStore();

