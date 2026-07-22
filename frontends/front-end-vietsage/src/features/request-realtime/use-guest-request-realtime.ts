import { useEffect, useRef, useState } from "react";
import type { GuestRequest } from "@/features/guest-os/types/guest-os-contract";
import { createGuestConnectionManager } from "./guest-connection-manager";
import { createRequestRealtimeSocket } from "./request-realtime-client";
import { requestRealtimeEnabled } from "./request-realtime-config";

type Handlers = { onReady?: () => void; onCreated?: (request: GuestRequest) => void; onUpdated?: (request: Partial<GuestRequest> & { id: string }) => void; onAnswered?: (request: Partial<GuestRequest> & { id: string }) => void; onGuestMessageCreated?: (event: unknown) => void; onConversationClosed?: (event: unknown) => void; onReconnect?: () => void; onError?: (error: unknown) => void };

export function useGuestRequestRealtime(sessionToken: string | null | undefined, handlers: Handlers) {
  const handlersRef = useRef(handlers);
  const [manager] = useState(() => createGuestConnectionManager({
    enabled: requestRealtimeEnabled,
    createSocket: createRequestRealtimeSocket,
    scheduleReconnect: (callback) => {
      const timer = window.setTimeout(callback, 1_000);
      return () => window.clearTimeout(timer);
    },
  }));
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);
  useEffect(() => {
    manager.update(sessionToken, {
      onReady: () => handlersRef.current.onReady?.(),
      onCreated: (value) => handlersRef.current.onCreated?.(value as GuestRequest),
      onUpdated: (value) => handlersRef.current.onUpdated?.(value as Partial<GuestRequest> & { id: string }),
      onAnswered: (value) => handlersRef.current.onAnswered?.(value as Partial<GuestRequest> & { id: string }),
      onGuestMessageCreated: (value) => handlersRef.current.onGuestMessageCreated?.(value),
      onConversationClosed: (value) => handlersRef.current.onConversationClosed?.(value),
      onReconnect: () => handlersRef.current.onReconnect?.(),
      onError: (error) => handlersRef.current.onError?.(error),
    });
    return () => manager.disconnect();
  }, [manager, sessionToken]);
}
