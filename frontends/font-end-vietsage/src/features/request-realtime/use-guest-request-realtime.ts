import { useEffect } from "react";
import type { GuestRequest } from "@/features/guest-os/types/guest-os-contract";
import {
  createRequestRealtimeSocket,
  type RequestRealtimeEvent,
} from "@/features/request-realtime/request-realtime-client";

type GuestRequestRealtimeHandlers = {
  onCreated?: (request: GuestRequest) => void;
  onUpdated?: (request: Partial<GuestRequest> & { id: string }) => void;
  onAnswered?: (request: Partial<GuestRequest> & { id: string }) => void;
  onReconnect?: () => void;
};

export function useGuestRequestRealtime(
  sessionToken: string | null | undefined,
  handlers: GuestRequestRealtimeHandlers,
) {
  useEffect(() => {
    if (!sessionToken) return;

    const socket = createRequestRealtimeSocket();
    socket.on("connect", () => {
      socket.emit("guest:join_session_requests", { sessionToken });
    });
    socket.io.on("reconnect", () => {
      socket.emit("guest:join_session_requests", { sessionToken });
      handlers.onReconnect?.();
    });
    socket.on("guest_request.created", (event: RequestRealtimeEvent<GuestRequest>) => {
      handlers.onCreated?.(event.request);
    });
    socket.on("guest_request.updated", (event: RequestRealtimeEvent<Partial<GuestRequest> & { id: string }>) => {
      handlers.onUpdated?.(event.request);
    });
    socket.on("guest_request.answered", (event: RequestRealtimeEvent<Partial<GuestRequest> & { id: string }>) => {
      handlers.onAnswered?.(event.request);
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [sessionToken, handlers]);
}
