import type { IntakePayloadV2 } from "../intake/intake-contract";

export type WorkstationPairingStatus = { online: boolean };
export type ScanRequest = { scanRequestId: string; expiresAt: number };
export type ScanResult = {
  status: "waiting" | "claimed" | "received";
  scanRequestId: string;
  expiresAt: number;
  payload: IntakePayloadV2 | null;
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(`${(body as { error?: string }).error ?? "Request failed"} (HTTP ${response.status})`);
  return body;
}

export const workstationRepository = {
  async getPairingStatus(hotelId: string): Promise<WorkstationPairingStatus> {
    return apiFetch<WorkstationPairingStatus>(
      `/api/biometric-workstations/hotels/${encodeURIComponent(hotelId)}/pairing`,
      { cache: "no-store" },
    );
  },

  async createPairing(hotelId: string): Promise<{ code: string }> {
    return apiFetch<{ code: string }>(
      `/api/biometric-workstations/hotels/${encodeURIComponent(hotelId)}/pairing`,
      { method: "POST" },
    );
  },

  async disconnect(hotelId: string): Promise<void> {
    await apiFetch<{ disconnected: boolean }>(
      `/api/biometric-workstations/hotels/${encodeURIComponent(hotelId)}/pairing`,
      { method: "DELETE" },
    );
  },

  async requestScan(hotelId: string): Promise<ScanRequest> {
    return apiFetch<ScanRequest>(
      `/api/biometric-workstations/hotels/${encodeURIComponent(hotelId)}/scans`,
      { method: "POST" },
    );
  },

  async readScan(scanRequestId: string, hotelId: string): Promise<ScanResult> {
    const result = await apiFetch<ScanResult & { error?: string }>(
      `/api/biometric-workstations/scans/${encodeURIComponent(scanRequestId)}?hotelId=${encodeURIComponent(hotelId)}`,
      { cache: "no-store" },
    );
    return result;
  },

  async acknowledgeScan(scanRequestId: string, hotelId: string): Promise<void> {
    await apiFetch<{ acknowledged: boolean }>(
      `/api/biometric-workstations/scans/${encodeURIComponent(scanRequestId)}/ack?hotelId=${encodeURIComponent(hotelId)}`,
      { method: "DELETE" },
    );
  },

  async discardScan(scanRequestId: string, hotelId: string): Promise<void> {
    // Best-effort: use ack route to clear payload from volatile store
    try {
      await fetch(
        `/api/biometric-workstations/scans/${encodeURIComponent(scanRequestId)}/ack?hotelId=${encodeURIComponent(hotelId)}`,
        { method: "DELETE" },
      );
    } catch {
      // discard is best-effort; TTL is the fail-safe
    }
  },
};
