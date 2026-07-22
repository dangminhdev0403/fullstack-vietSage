import { useEffect, useRef } from "react";
import type { StaffRequestListItem } from "@/features/hotel-ops/types/hotel-ops-contract";
import { ownerRequestRealtimeManager } from "./owner-request-realtime-manager";
import { requestRealtimeEnabled } from "./request-realtime-config";

type Handlers = {
  onReady?: () => void;
  onCreated?: (request: StaffRequestListItem) => void;
  onUpdated?: (request: Partial<StaffRequestListItem> & { id: string }) => void;
  onAnswered?: (request: Partial<StaffRequestListItem> & { id: string }) => void;
  onGuestMessageCreated?: (event: unknown) => void;
  onConversationClosed?: (event: unknown) => void;
  onReconnect?: () => void;
};

export function useOwnerRequestRealtime(hotelId: string, handlers: Handlers, options: { enabled?: boolean; showConnectionToasts?: boolean } = {}) {
  const ref = useRef(handlers);
  useEffect(() => { ref.current = handlers; }, [handlers]);
  const enabled = (options.enabled ?? true) && requestRealtimeEnabled;
  useEffect(() => {
    if (!enabled || !hotelId) return;
    return ownerRequestRealtimeManager.subscribe(hotelId, {
      onReady: () => ref.current.onReady?.(),
      onCreated: (value) => ref.current.onCreated?.(value as StaffRequestListItem),
      onUpdated: (value) => ref.current.onUpdated?.(value as Partial<StaffRequestListItem> & { id: string }),
      onAnswered: (value) => ref.current.onAnswered?.(value as Partial<StaffRequestListItem> & { id: string }),
      onGuestMessageCreated: (value) => ref.current.onGuestMessageCreated?.(value),
      onConversationClosed: (value) => ref.current.onConversationClosed?.(value),
      onReconnect: () => ref.current.onReconnect?.(),
      onError: (error) => {
        if (options.showConnectionToasts) {
          const code = typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "CONNECTION_FAILED";
          void import("sonner").then(({ toast }) =>
            toast.error("Realtime chưa thể kết nối", { id: `owner-realtime-error-${hotelId}`, description: code }),
          );
        }
      },
    });
  }, [enabled, hotelId, options.showConnectionToasts]);
}
