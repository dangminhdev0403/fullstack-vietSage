"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { StaffRequestListItem } from "@/features/hotel-ops/types/hotel-ops-contract";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";
import { playMessageAlertSound, playRequestAlertSound } from "@/features/request-realtime/audio-notifier";
import {
  invalidateHotelRealtimeQueries,
  invalidateHotelRequestRealtimeQueries,
} from "../utils/invalidate-hotel-realtime-queries";
import { getQueryClient } from "@/app/_components/react-query-provider";

function useSafeQueryClient() {
  try {
    return useQueryClient();
  } catch {
    return null;
  }
}

export function HotelOpsRealtimeNotifier({ hotelId }: Readonly<{ hotelId: string }>) {
  const router = useRouter();
  const queryClient = useSafeQueryClient();

  const getTargetClient = () => queryClient ?? getQueryClient();

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
        void invalidateHotelRealtimeQueries(getTargetClient(), hotelId);
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
        void invalidateHotelRealtimeQueries(getTargetClient(), hotelId);
      },
      onAnswered: () => {
        void invalidateHotelRealtimeQueries(getTargetClient(), hotelId);
      },
      onGuestMessageCreated: (event: unknown) => {
        void invalidateHotelRealtimeQueries(getTargetClient(), hotelId);

        const raw = event as {
          hotelId?: string;
          thread?: { roomNumber?: string };
          message?: { id?: string; senderType?: string; body?: string };
        } | null;

        if (!raw || raw.hotelId !== hotelId) return;

        if (raw.message?.senderType === "GUEST") {
          playMessageAlertSound();
          const isMessagesPage =
            typeof window !== "undefined" &&
            window.location.pathname.includes(`/hotels/${hotelId}/messages`);

          if (!isMessagesPage) {
            toast.info("Có tin nhắn mới từ khách", {
              id: `hotel-ops-message-${raw.message.id ?? Date.now()}`,
              description: `Phòng ${raw.thread?.roomNumber ?? ""}: ${raw.message.body ?? ""}`,
              duration: 8000,
              action: {
                label: "Xem tin nhắn",
                onClick: () => router.push(`/hotels/${hotelId}/messages`),
              },
            });
          }
        }
      },
      onConversationClosed: () => {
        void invalidateHotelRealtimeQueries(getTargetClient(), hotelId);
      },
      onReconnect: () => {
        void invalidateHotelRequestRealtimeQueries(getTargetClient(), hotelId);
      },
    }),
    [hotelId, queryClient, router],
  );

  useOwnerRequestRealtime(hotelId, handlers, {
    showConnectionToasts: true,
  });

  return null;
}

