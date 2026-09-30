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
  const targetQueryClient = queryClient ?? getQueryClient();

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
            duration: isUrgent ? 5000 : 3000,
            action: {
              label: "Xem ngay",
              onClick: () => {
                toast.dismiss(`hotel-ops-request-created-${request.id}`);
                router.push(`/hotels/${hotelId}/requests`);
              },
            },
          },
        );

        // Invalidate TanStack Query caches and refresh server components
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onUpdated: (request: Partial<StaffRequestListItem> & { id: string }) => {
        const status = String(request.status ?? "");
        if (status && status !== "PENDING") {
          toast.dismiss(`hotel-ops-request-created-${request.id}`);
        }

        if (status === "CANCELLED") {
          toast.dismiss(`hotel-ops-request-created-${request.id}`);
          toast.warning(
            `Phòng ${request.roomNumber ?? ""} đã HỦY yêu cầu`,
            {
              id: `hotel-ops-request-cancelled-${request.id}`,
              description: `Khách hàng vừa hủy yêu cầu ${request.displayName ?? ""}`,
              duration: 3000,
              action: {
                label: "Xem ngay",
                onClick: () => {
                  toast.dismiss(`hotel-ops-request-cancelled-${request.id}`);
                  router.push(`/hotels/${hotelId}/requests`);
                },
              },
            },
          );
        } else if (status === "PENDING") {
          playRequestAlertSound(false);
        }
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onAnswered: (request?: Partial<StaffRequestListItem> & { id?: string }) => {
        if (request?.id) {
          toast.dismiss(`hotel-ops-request-created-${request.id}`);
        }
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onGuestMessageCreated: (event: unknown) => {
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();

        const raw = event as {
          hotelId?: string;
          thread?: { roomNumber?: string };
          message?: { id?: string; senderType?: string; body?: string };
        } | null;

        if (raw?.hotelId !== hotelId) return;

        if (raw.message?.senderType === "GUEST") {
          playMessageAlertSound();
          const isMessagesPage =
            typeof window !== "undefined" &&
            window.location.pathname.includes(`/hotels/${hotelId}/messages`);

          if (!isMessagesPage) {
            toast.info("Có tin nhắn mới từ khách", {
              id: `hotel-ops-message-${raw.message.id ?? Date.now()}`,
              description: `Phòng ${raw.thread?.roomNumber ?? ""}: ${raw.message.body ?? ""}`,
              duration: 3000,
              action: {
                label: "Xem tin nhắn",
                onClick: () => {
                  if (raw.message?.id) toast.dismiss(`hotel-ops-message-${raw.message.id}`);
                  router.push(`/hotels/${hotelId}/messages`);
                },
              },
            });
          }
        }
      },
      onConversationClosed: () => {
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onExternalOrderCreated: (event: unknown) => {
        playRequestAlertSound(false);

        const raw = event as {
          orderId?: string;
          roomNumber?: string;
          guestDisplayName?: string;
          serviceName?: string;
          items?: Array<{ serviceName: string; quantity?: number }>;
        } | null;

        const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Khách lưu trú";
        const guestName = raw?.guestDisplayName ?? "Khách hàng";
        const serviceName =
          raw?.items && raw.items.length > 1
            ? `${raw.items[0].serviceName} (+${raw.items.length - 1} mục khác)`
            : (raw?.serviceName ?? "Dịch vụ đối tác");

        toast.success("Có yêu cầu dịch vụ đối tác mới", {
          id: `hotel-ops-ext-order-created-${raw?.orderId ?? Date.now()}`,
          description: `${roomLabel} - ${guestName}: ${serviceName}`,
          duration: 3000,
          action: {
            label: "Xem ngay",
            onClick: () => {
              if (raw?.orderId) toast.dismiss(`hotel-ops-ext-order-created-${raw.orderId}`);
              router.push(`/hotels/${hotelId}/requests`);
            },
          },
        });

        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onExternalOrderStatusChanged: (event: unknown) => {
        const raw = event as { orderId?: string } | null;
        if (raw?.orderId) {
          toast.dismiss(`hotel-ops-ext-order-created-${raw.orderId}`);
        }
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onExternalOrderHotelAcknowledged: (event: unknown) => {
        const raw = event as { orderId?: string } | null;
        if (raw?.orderId) {
          toast.dismiss(`hotel-ops-ext-order-created-${raw.orderId}`);
        }
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onExternalOrderVoucherIssued: () => {
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onChannelBookingCreated: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          bookingId?: string;
          otaName?: string;
          roomNumber?: string | null;
          roomType?: string | null;
          guestName?: string;
          amount?: number | string | null;
          reservationCode?: string;
        } | null;

        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        playRequestAlertSound(true);

        const bookingKey = raw?.bookingId || raw?.reservationCode || "latest";
        const roomInfo = raw?.roomNumber
          ? `Phòng #${raw.roomNumber}`
          : raw?.roomType
            ? `Hạng ${raw.roomType}`
            : "Chờ phân phòng";
        const ota = raw?.otaName || "OTA";
        const guest = raw?.guestName || "Khách OTA";

        toast.success(`Đơn đặt phòng mới từ ${ota}!`, {
          id: `hotel-ops-channel-booking-${bookingKey}`,
          description: `${roomInfo} • Khách: ${guest}`,
          duration: 12_000,
          action: {
            label: "Xem sơ đồ phòng",
            onClick: () => {
              router.push(`/hotels/${hotelId}/rooms`);
            },
          },
        });

        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onChannelBookingCancelled: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          bookingId?: string;
          otaName?: string;
          reservationCode?: string;
        } | null;

        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        const bookingKey = raw?.bookingId || raw?.reservationCode || "latest";
        const codeDisplay = raw?.reservationCode ? `(${raw.reservationCode}) ` : "";

        toast.warning("Đơn đặt phòng OTA đã HỦY", {
          id: `hotel-ops-channel-booking-cancelled-${bookingKey}`,
          description: `Đơn từ ${raw?.otaName || "OTA"} ${codeDisplay}đã bị hủy trên sàn. Đã giải phóng ô phòng trống trong PMS.`,
          duration: 10_000,
        });

        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onReconnect: () => {
        void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
    }),
    [hotelId, router, targetQueryClient],
  );

  useOwnerRequestRealtime(hotelId, handlers, {
    showConnectionToasts: true,
  });

  return null;
}
