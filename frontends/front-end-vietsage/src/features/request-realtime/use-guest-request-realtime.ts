import { useEffect, useRef } from "react";
import type { GuestRequest } from "@/features/guest-os/types/guest-os-contract";
import { createGuestConnectionManager } from "./guest-connection-manager";
import { createRequestRealtimeSocket } from "./request-realtime-client";
import { requestRealtimeEnabled } from "./request-realtime-config";

type Handlers = {
  onReady?: () => void;
  onCreated?: (request: GuestRequest) => void;
  onUpdated?: (request: Partial<GuestRequest> & { id: string }) => void;
  onAnswered?: (request: Partial<GuestRequest> & { id: string }) => void;
  onGuestMessageCreated?: (event: unknown) => void;
  onConversationClosed?: (event: unknown) => void;
  onExternalOrderCreated?: (event: unknown) => void;
  onExternalOrderStatusChanged?: (event: unknown) => void;
  onReconnect?: () => void;
  onError?: (error: unknown) => void;
};

export const guestRequestRealtimeManager = createGuestConnectionManager({
  enabled: requestRealtimeEnabled,
  createSocket: createRequestRealtimeSocket,
  scheduleReconnect: (callback, attempt) => {
    const delay = Math.min(30_000, Math.pow(2, attempt) * 1_000);
    const timer = window.setTimeout(callback, delay);
    return () => window.clearTimeout(timer);
  },
});

export function useGuestRequestRealtime(sessionToken: string | null | undefined, handlers: Handlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);
  useEffect(() => {
    const token = sessionToken?.trim();
    if (!token) return;
    return guestRequestRealtimeManager.subscribe(token, {
      onReady: () => handlersRef.current.onReady?.(),
      onCreated: (value) => handlersRef.current.onCreated?.(value as GuestRequest),
      onUpdated: (value) => handlersRef.current.onUpdated?.(value as Partial<GuestRequest> & { id: string }),
      onAnswered: (value) => handlersRef.current.onAnswered?.(value as Partial<GuestRequest> & { id: string }),
      onGuestMessageCreated: (value) => handlersRef.current.onGuestMessageCreated?.(value),
      onConversationClosed: (value) => handlersRef.current.onConversationClosed?.(value),
      onExternalOrderCreated: (value) => handlersRef.current.onExternalOrderCreated?.(value),
      onExternalOrderStatusChanged: (value) => handlersRef.current.onExternalOrderStatusChanged?.(value),
      onReconnect: () => handlersRef.current.onReconnect?.(),
      onError: (error) => handlersRef.current.onError?.(error),
    });
  }, [sessionToken]);
}
