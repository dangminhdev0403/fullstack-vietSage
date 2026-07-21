import { requestInternalApi } from "@/core/http/internal-api-client";
import { createOwnerConnectionManager } from "./owner-connection-manager";
import { createRequestRealtimeSocket } from "./request-realtime-client";
import { requestRealtimeEnabled } from "./request-realtime-config";

export const ownerRequestRealtimeManager = createOwnerConnectionManager({
  enabled: requestRealtimeEnabled,
  getTicket: (hotelId) => requestInternalApi<{ ticket: string; expiresAt: string }>(
    `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/request-realtime-ticket`,
    { method: "POST" },
  ),
  createSocket: createRequestRealtimeSocket,
  scheduleReconnect: (callback) => {
    const timer = window.setTimeout(callback, 1_000);
    return () => window.clearTimeout(timer);
  },
});
