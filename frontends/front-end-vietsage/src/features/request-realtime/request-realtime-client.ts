import { getBrowserBackendApiBaseUrl, resolveBrowserReachableBackendUrl } from "@/core/http/backend-api-config";
import { io, type Socket } from "socket.io-client";

const SOCKET_NAMESPACE = "/request-realtime";

export type RequestRealtimeEvent<TRequest> = {
  request: TRequest;
};

export function getRequestRealtimeUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_REALTIME_URL ??
    process.env.NEXT_PUBLIC_SOCKET_URL ??
    getBrowserBackendApiBaseUrl();

  return resolveBrowserReachableBackendUrl(configured);
}

export type RequestRealtimeAuth =
  | { mode: "owner"; ticket: string }
  | { mode: "guest"; sessionToken: string };

export function createRequestRealtimeSocket(auth: RequestRealtimeAuth): Socket {
  const socketUrl = getRequestRealtimeUrl();
  return io(`${socketUrl}${SOCKET_NAMESPACE}`, {
    transports: ["polling", "websocket"],
    autoConnect: false,
    withCredentials: true,
    reconnection: false,
    auth,
  });
}
