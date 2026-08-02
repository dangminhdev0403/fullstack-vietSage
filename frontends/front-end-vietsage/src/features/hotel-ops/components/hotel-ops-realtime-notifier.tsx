"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { StaffRequestListItem } from "@/features/hotel-ops/types/hotel-ops-contract";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";
import { playRequestAlertSound } from "@/features/request-realtime/audio-notifier";
import { invalidateHotelRealtimeQueries } from "../utils/invalidate-hotel-realtime-queries";

export function HotelOpsRealtimeNotifier({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const handlers = useMemo(
    () => ({
      onReady: () => {
        toast.success("Realtime đã kết nối", {
          id: `hotel-ops-realtime-ready-${hotelId}`,
          description: "Yêu cầu và tin nhắn mới sẽ cập nhật tự động.",
          duration: 3000,
        });
      },
      onCreated: (request: StaffRequestListItem) => {
        const isUrgent = request.priority === "URGENT";

        // Play request sound notification
        playRequestAlertSound(isUrgent);

        toast[isUrgent ? "error" : "success"](
          isUrgent ? "Yêu cầu khẩn cấp từ khách" : "Có yêu cầu mới từ khách",
          {
            id: `hotel-ops-request-created-${request.id}`,
            description: `Phòng ${request.roomNumber} - ${request.displayName}`,
            duration: isUrgent ? Number.POSITIVE_INFINITY : 10000,
            action: {
              label: "Xem ngay",
              onClick: () => router.push(`/hotels/${hotelId}/requests`),
            },
          },
        );

        // Invalidate TanStack Query caches so UI updates without page reload
        void invalidateHotelRealtimeQueries(queryClient, hotelId);
      },
      onUpdated: (request: Partial<StaffRequestListItem> & { id: string }) => {
        if (String(request.status) === "CANCELLED") {
          toast.warning(
            `Phòng ${request.roomNumber ?? ""} đã HỦY yêu cầu`,
            {
              id: `hotel-ops-request-cancelled-${request.id}`,
              description: `Khách hàng vừa hủy yêu cầu ${request.displayName ?? ""}`,
              duration: 8000,
              action: {
                label: "Xem ngay",
                onClick: () => router.push(`/hotels/${hotelId}/requests`),
              },
            },
          );
        } else if (String(request.status) === "PENDING") {
          playRequestAlertSound(false);
        }
        void invalidateHotelRealtimeQueries(queryClient, hotelId);
      },
      onAnswered: () => {
        void invalidateHotelRealtimeQueries(queryClient, hotelId);
      },
      onReconnect: () => {
        void invalidateHotelRealtimeQueries(queryClient, hotelId);
      },
    }),
    [hotelId, queryClient, router],
  );

  useOwnerRequestRealtime(hotelId, handlers, {
    showConnectionToasts: true,
  });

  return null;
}
