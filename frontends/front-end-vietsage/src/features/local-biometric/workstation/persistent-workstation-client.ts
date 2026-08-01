import "server-only";

import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${getBackendApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Accept: "application/json", ...init.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error("Persistent workstation request failed"), { status: response.status });
  return unwrapApiEnvelope<T>(payload).data;
}

export function pairPersistentWorkstation(code: string) {
  return request<{ token: string; hotelId: string }>("/biometric-workstations/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

export function authenticatePersistentWorkstation(token: string) {
  return request<{ id: string; hotelId: string }>("/biometric-workstations/authenticate", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function issuePersistentPairing(hotelId: string, operatorToken: string) {
  return request<{ code: string; expiresAt: number }>(`/hotels/${encodeURIComponent(hotelId)}/biometric-workstations/pairing`, {
    method: "POST",
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
}

export function persistentWorkstationStatus(hotelId: string, operatorToken: string) {
  return request<{ online: boolean }>(`/hotels/${encodeURIComponent(hotelId)}/biometric-workstations/status`, {
    method: "GET",
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
}

export function disconnectPersistentWorkstations(hotelId: string, operatorToken: string) {
  return request<{ disconnected: true; revoked: number }>(`/hotels/${encodeURIComponent(hotelId)}/biometric-workstations`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
}
