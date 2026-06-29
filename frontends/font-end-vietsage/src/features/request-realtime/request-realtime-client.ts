import { getBrowserBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { io, type Socket } from "socket.io-client";

const SOCKET_NAMESPACE = "/request-realtime";

export type RequestRealtimeEvent<TRequest> = {
  request: TRequest;
};

export function getRequestRealtimeUrl(): string {
  console.debug("getRequestRealtimeUrl", {
    url: getBrowserBackendApiBaseUrl(),
  });
  return getBrowserBackendApiBaseUrl();
}

export function createRequestRealtimeSocket(): Socket {
  return io(`${getRequestRealtimeUrl()}${SOCKET_NAMESPACE}`, {
    transports: ["websocket", "polling"],
    autoConnect: false,
    withCredentials: true,
  });
}
