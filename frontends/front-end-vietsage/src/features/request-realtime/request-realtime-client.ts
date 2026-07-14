import { getBrowserBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { io, type Socket } from "socket.io-client";

const SOCKET_NAMESPACE = "/request-realtime";

export type RequestRealtimeEvent<TRequest> = {
  request: TRequest;
};

export function getRequestRealtimeUrl(): string {
  return getBrowserBackendApiBaseUrl();
}

export type RequestRealtimeAuth =
  | { mode: "owner"; ticket: string }
  | { mode: "guest"; sessionToken: string };

export function createRequestRealtimeSocket(auth: RequestRealtimeAuth): Socket {
  return io(`${getRequestRealtimeUrl()}${SOCKET_NAMESPACE}`, {
    transports: ["websocket", "polling"],
    autoConnect: false,
    withCredentials: true,
    reconnection: false,
    auth,
  });
}
