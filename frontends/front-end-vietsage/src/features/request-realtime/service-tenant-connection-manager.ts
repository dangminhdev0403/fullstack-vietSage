import { requestInternalApi } from "@/core/http/internal-api-client";
import { createOwnerConnectionManager } from "./owner-connection-manager";
import { createRequestRealtimeSocket } from "./request-realtime-client";
import { requestRealtimeEnabled } from "./request-realtime-config";

export const serviceTenantRequestRealtimeManager = createOwnerConnectionManager({
  enabled: requestRealtimeEnabled,
  getTicket: () =>
    requestInternalApi<{ ticket: string; expiresAt: string }>("/api/service-portal", {
      method: "POST",
      body: { action: "ticket" },
    }),
  createSocket: (auth) =>
    createRequestRealtimeSocket(
      auth.mode === "owner" ? { mode: "service_tenant", ticket: auth.ticket } : auth,
    ),
  scheduleReconnect: (callback, attempt) => {
    const delay = Math.min(15_000, Math.pow(2, attempt) * 1_000);
    const timer = window.setTimeout(callback, delay);
    return () => window.clearTimeout(timer);
  },
});
