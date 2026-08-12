import { requestInternalApi } from "@/core/http/internal-api-client";
import { createOwnerConnectionManager } from "./owner-connection-manager";
import { createRequestRealtimeSocket } from "./request-realtime-client";
import { requestRealtimeEnabled } from "./request-realtime-config";

export const serviceTenantRequestRealtimeManager = createOwnerConnectionManager({
  enabled: requestRealtimeEnabled,
  getTicket: () =>
    requestInternalApi<{ ticket: string; expiresAt: string }>("/api/service-portal", {
      method: "POST",
      body: JSON.stringify({ action: "ticket" }),
    }),
  createSocket: (auth) =>
    createRequestRealtimeSocket(
      auth.mode === "owner" ? { mode: "service_tenant", ticket: auth.ticket } : auth,
    ),
  scheduleReconnect: (callback) => {
    const timer = window.setTimeout(callback, 30_000);
    return () => window.clearTimeout(timer);
  },
});
