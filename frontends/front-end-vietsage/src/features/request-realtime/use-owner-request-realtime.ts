import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { StaffRequestListItem } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  createRequestRealtimeSocket,
  type RequestRealtimeEvent,
} from "@/features/request-realtime/request-realtime-client";

type OwnerRequestRealtimeHandlers = {
  onCreated?: (request: StaffRequestListItem) => void;
  onUpdated?: (request: Partial<StaffRequestListItem> & { id: string }) => void;
  onAnswered?: (request: Partial<StaffRequestListItem> & { id: string }) => void;
  onReconnect?: () => void;
};

type OwnerRequestRealtimeOptions = {
  showConnectionToasts?: boolean;
  enabled?: boolean;
};

export function useOwnerRequestRealtime(
  hotelId: string,
  handlers: OwnerRequestRealtimeHandlers,
  options: OwnerRequestRealtimeOptions = {},
) {
  const showConnectionToasts = options.showConnectionToasts ?? true;
  const enabled = options.enabled ?? false;
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled || !hotelId) return;

    const socket = createRequestRealtimeSocket();
    const joinRoom = () => {
      socket.emit("owner:join_hotel_requests", { hotelId });
    };

    socket.on("connect", joinRoom);
    socket.on("request_realtime.activity", () => {
      if (showConnectionToasts) {
        toast.info("Kết nối realtime đã sẵn sàng");
      }
    });
    socket.on("request_realtime.joined", () => {
      if (showConnectionToasts) {
        toast.success("Đã theo dõi realtime yêu cầu khách");
      }
    });
    socket.on("request_realtime.error", (event: { message?: string }) => {
      if (showConnectionToasts) {
        toast.error(event.message ?? "Không thể tham gia kênh realtime");
      }
    });
    socket.on("connect_error", () => {
      if (showConnectionToasts) {
        toast.error("Không phát hiện hoạt động realtime. Kiểm tra API socket.");
      }
    });
    socket.io.on("reconnect", () => {
      joinRoom();
      handlersRef.current.onReconnect?.();
      if (showConnectionToasts) {
        toast.info("Đã kết nối lại realtime, đang đồng bộ dữ liệu");
      }
    });
    socket.on("guest_request.created", (event: RequestRealtimeEvent<StaffRequestListItem>) => {
      handlersRef.current.onCreated?.(event.request);
    });
    socket.on("guest_request.updated", (event: RequestRealtimeEvent<Partial<StaffRequestListItem> & { id: string }>) => {
      handlersRef.current.onUpdated?.(event.request);
    });
    socket.on("guest_request.answered", (event: RequestRealtimeEvent<Partial<StaffRequestListItem> & { id: string }>) => {
      handlersRef.current.onAnswered?.(event.request);
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled, hotelId, showConnectionToasts]);
}
