"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { StaffRequestListItem } from "@/features/hotel-ops/types/hotel-ops-contract";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";
import { playMessageAlertSound, playRequestAlertSound } from "@/features/request-realtime/audio-notifier";
import {
  invalidateHotelHousekeepingRealtimeQueries,
  invalidateHotelMessageRealtimeQueries,
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

  const recentHousekeepingTasksRef = useRef<Map<string, { type: string; timestamp: number }>>(new Map());
  const pendingRoomStatusTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const markHousekeepingAction = useCallback((keys: Array<string | null | undefined>, type: string) => {
    const validKeys = keys.filter((k): k is string => Boolean(k && String(k).trim()));
    const now = Date.now();
    for (const key of validKeys) {
      const trimmed = String(key).trim();
      recentHousekeepingTasksRef.current.set(trimmed, { type, timestamp: now });
      const timer = pendingRoomStatusTimerRef.current.get(trimmed);
      if (timer) {
        clearTimeout(timer);
        pendingRoomStatusTimerRef.current.delete(trimmed);
      }
      toast.dismiss(`hotel-ops-room-status-${trimmed}`);
    }
  }, []);

  useEffect(() => {
    const pendingTimers = pendingRoomStatusTimerRef.current;
    return () => {
      pendingTimers.forEach((timer) => clearTimeout(timer));
      pendingTimers.clear();
    };
  }, []);

  const handlers = useMemo(
    () => ({
      onReady: () => {
        // Resync changes missed while the socket was connecting.
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        toast.dismiss(`owner-realtime-error-${hotelId}`);
        toast.success("Realtime đã kết nối", {
          id: `hotel-ops-realtime-ready-${hotelId}`,
          description: "Yêu cầu và tin nhắn mới sẽ cập nhật tự động.",
          duration: 2000,
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
            duration: isUrgent ? 8000 : 5000,
            action: {
              label: "Xem ngay",
              onClick: () => {
                toast.dismiss(`hotel-ops-request-created-${request.id}`);
                void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
                router.refresh();
                router.push(`/hotels/${hotelId}/requests?requestId=${encodeURIComponent(request.id)}`);
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("vietsage:open-request", {
                      detail: { requestId: request.id, hotelId },
                    }),
                  );
                }
              },
            },
          },
        );

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("vietsage:live-request-created", {
              detail: request,
            }),
          );
        }

        // Invalidate TanStack Query caches seamlessly without full page reload
        void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
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
              duration: 4000,
              action: {
                label: "Xem ngay",
                onClick: () => {
                  toast.dismiss(`hotel-ops-request-cancelled-${request.id}`);
                  void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
                  router.refresh();
                  router.push(`/hotels/${hotelId}/requests?requestId=${encodeURIComponent(request.id)}`);
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("vietsage:open-request", {
                        detail: { requestId: request.id, hotelId },
                      }),
                    );
                  }
                },
              },
            },
          );
        } else if (status === "PENDING") {
          playRequestAlertSound(false);
        }
        void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onAnswered: (request?: Partial<StaffRequestListItem> & { id?: string }) => {
        if (request?.id) {
          toast.dismiss(`hotel-ops-request-created-${request.id}`);
        }
        void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
      },
      onGuestMessageCreated: (event: unknown) => {
        void invalidateHotelMessageRealtimeQueries(targetQueryClient, hotelId);

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
            const threadRoom = raw.thread?.roomNumber ? `Phòng ${raw.thread.roomNumber}` : "";
            const messageKey = raw.thread?.roomNumber || raw.message.id || "guest";
            toast.info("Có tin nhắn mới từ khách", {
              id: `hotel-ops-message-${messageKey}`,
              description: threadRoom ? `${threadRoom}: ${raw.message.body ?? ""}` : (raw.message.body ?? ""),
              duration: 3000,
              action: {
                label: "Xem tin nhắn",
                onClick: () => {
                  toast.dismiss(`hotel-ops-message-${messageKey}`);
                  router.push(`/hotels/${hotelId}/messages`);
                },
              },
            });
          }
        }
      },
      onConversationClosed: () => {
        void invalidateHotelMessageRealtimeQueries(targetQueryClient, hotelId);
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
        const orderKey = raw?.orderId || "latest";

        toast.success("Có yêu cầu dịch vụ đối tác mới", {
          id: `hotel-ops-ext-order-${orderKey}`,
          description: `${roomLabel} - ${guestName}: ${serviceName}`,
          duration: 4000,
          action: {
            label: "Xem ngay",
            onClick: () => {
              toast.dismiss(`hotel-ops-ext-order-${orderKey}`);
              void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
              router.refresh();
              const targetUrl = `/hotels/${hotelId}/requests?tab=external${raw?.orderId ? `&orderId=${encodeURIComponent(raw.orderId)}` : ""}`;
              router.push(targetUrl);
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("vietsage:open-external-order", {
                    detail: { orderId: raw?.orderId, hotelId },
                  }),
                );
              }
            },
          },
        });

        void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onExternalOrderStatusChanged: (event: unknown) => {
        const raw = event as { orderId?: string } | null;
        if (raw?.orderId) {
          toast.dismiss(`hotel-ops-ext-order-${raw.orderId}`);
        }
        void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onExternalOrderHotelAcknowledged: (event: unknown) => {
        const raw = event as { orderId?: string } | null;
        if (raw?.orderId) {
          toast.dismiss(`hotel-ops-ext-order-${raw.orderId}`);
        }
        void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
        router.refresh();
      },
      onExternalOrderVoucherIssued: () => {
        void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
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
          currency?: string | null;
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
        const guest = raw?.guestName || "Khách hàng";
        const otaLower = ota.toLowerCase();
        const isDirect =
          otaLower.includes("direct") ||
          otaLower.includes("vietsage") ||
          otaLower.includes("booking engine");

        let amountText = "";
        if (raw?.amount) {
          const num = Number(raw.amount);
          if (!Number.isNaN(num) && num > 0) {
            amountText = ` • ${num.toLocaleString("vi-VN")} ${raw.currency || "VND"}`;
          }
        }

        const title = isDirect
          ? "Khách thanh toán thành công!"
          : `Đơn đặt phòng mới từ ${ota}!`;

        toast.success(title, {
          id: `hotel-ops-channel-booking-${bookingKey}`,
          description: `${roomInfo} • Khách: ${guest}${amountText}`,
          duration: 12_000,
          action: {
            label: "Xem đặt phòng",
            onClick: () => {
              router.push(`/hotels/${hotelId}/front-desk?tab=arrivals`);
            },
          },
        });

        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
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

        toast.warning("Đơn đặt phòng đã HỦY", {
          id: `hotel-ops-channel-booking-cancelled-${bookingKey}`,
          description: `Đơn từ ${raw?.otaName || "kênh đặt phòng"} ${codeDisplay}đã hủy. Đã giải phóng phòng trống trong PMS.`,
          duration: 10_000,
        });

        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
      },
      onRoomStatusUpdated: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          roomId?: string;
          roomNumber?: string | null;
          status?: string;
          previousStatus?: string | null;
        } | null;

        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);

        const keysToCheck = [raw?.roomNumber, raw?.roomId].filter((k): k is string => Boolean(k && String(k).trim()));
        const primaryKey = keysToCheck[0] ?? "default";

        // Check if there was a recent housekeeping task event for this room in the last 3.5 seconds
        const now = Date.now();
        const hasRecentHk = keysToCheck.some((key) => {
          const entry = recentHousekeepingTasksRef.current.get(String(key).trim());
          return entry && now - entry.timestamp < 3500;
        });

        const statusUpper = (raw?.status ?? "").toUpperCase();
        // If this status change is directly accompanied by a specific housekeeping lifecycle event,
        // suppress the duplicate generic status toast.
        if (
          hasRecentHk &&
          (statusUpper === "AVAILABLE" ||
            statusUpper === "PROCESSING" ||
            statusUpper === "MAINTENANCE" ||
            statusUpper === "BLOCKED")
        ) {
          return;
        }

        // Cancel any pending generic toast for these keys
        for (const key of keysToCheck) {
          const existingTimer = pendingRoomStatusTimerRef.current.get(key);
          if (existingTimer) {
            clearTimeout(existingTimer);
            pendingRoomStatusTimerRef.current.delete(key);
          }
        }

        // Debounce generic status toast by 250ms: if a housekeeping lifecycle event arrives in this window, it cancels the timer
        const timer = setTimeout(() => {
          for (const key of keysToCheck) {
            pendingRoomStatusTimerRef.current.delete(key);
          }

          const statusLabels: Record<string, string> = {
            AVAILABLE: "TRỐNG (sẵn sàng đón khách)",
            PROCESSING: "CHỜ DỌN DẸP",
            MAINTENANCE: "BẢO TRÌ",
            BLOCKED: "ĐÃ KHÓA",
            OCCUPIED: "ĐANG CÓ KHÁCH",
            RESERVED: "ĐẶT TRƯỚC",
          };

          const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Phòng";
          const targetLabel = raw?.status ? (statusLabels[raw.status] ?? raw.status) : "mới";

          toast.info(`${roomLabel} đã cập nhật trạng thái`, {
            id: `hotel-ops-room-status-${primaryKey}`,
            description: `Trạng thái: ${targetLabel}. Sơ đồ phòng đã đồng bộ tự động.`,
            duration: 4000,
          });
        }, 250);

        for (const key of keysToCheck) {
          pendingRoomStatusTimerRef.current.set(key, timer);
        }
      },
      onHousekeepingTaskCreated: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          taskId?: string;
          roomNumber?: string | null;
          taskType?: string | null;
          priority?: string | null;
          assignedStaffName?: string | null;
        } | null;

        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        markHousekeepingAction([raw?.roomNumber, raw?.taskId], "CREATED");

        const isUrgent = raw?.priority === "URGENT" || raw?.priority === "HIGH";
        playRequestAlertSound(isUrgent);

        const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Buồng phòng";
        toast.info("Nhiệm vụ buồng phòng mới", {
          id: `hotel-ops-housekeeping-created-${raw?.taskId ?? raw?.roomNumber ?? Date.now()}`,
          description: `${roomLabel} • ${raw?.taskType || "Cần dọn dẹp"}${raw?.assignedStaffName ? ` (giao cho ${raw.assignedStaffName})` : ""}`,
          duration: isUrgent ? 5000 : 3000,
        });

        void invalidateHotelHousekeepingRealtimeQueries(targetQueryClient, hotelId);
      },
      onHousekeepingTaskClaimed: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          taskId?: string;
          roomNumber?: string | null;
          assignedStaffName?: string | null;
        } | null;

        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        markHousekeepingAction([raw?.roomNumber, raw?.taskId], "CLAIMED");

        const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Phòng";
        toast.info("Đã nhận nhiệm vụ dọn phòng", {
          id: `hotel-ops-housekeeping-claimed-${raw?.taskId ?? raw?.roomNumber ?? Date.now()}`,
          description: `${roomLabel} • Nhân viên: ${raw?.assignedStaffName || "Nhân viên buồng phòng"}`,
          duration: 3000,
        });

        void invalidateHotelHousekeepingRealtimeQueries(targetQueryClient, hotelId);
      },
      onHousekeepingTaskStarted: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          taskId?: string;
          roomNumber?: string | null;
          assignedStaffName?: string | null;
        } | null;

        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        markHousekeepingAction([raw?.roomNumber, raw?.taskId], "STARTED");

        const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Phòng";
        toast.info("Bắt đầu dọn phòng", {
          id: `hotel-ops-housekeeping-started-${raw?.taskId ?? raw?.roomNumber ?? Date.now()}`,
          description: `${roomLabel} • Đang tiến hành làm phòng`,
          duration: 3000,
        });

        void invalidateHotelHousekeepingRealtimeQueries(targetQueryClient, hotelId);
      },
      onHousekeepingTaskBlocked: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          taskId?: string;
          roomNumber?: string | null;
          reason?: string | null;
          note?: string | null;
        } | null;

        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        markHousekeepingAction([raw?.roomNumber, raw?.taskId], "BLOCKED");

        playRequestAlertSound(true);

        const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Buồng phòng";
        const reasonText = raw?.reason || raw?.note || "Sự cố phát sinh";

        toast.warning("Buồng phòng gặp sự cố", {
          id: `hotel-ops-housekeeping-blocked-${raw?.taskId ?? raw?.roomNumber ?? Date.now()}`,
          description: `${roomLabel} • Tạm hoãn: ${reasonText}`,
          duration: 6000,
        });

        void invalidateHotelHousekeepingRealtimeQueries(targetQueryClient, hotelId);
      },
      onHousekeepingTaskCompleted: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          taskId?: string;
          roomNumber?: string | null;
          assignedStaffName?: string | null;
        } | null;

        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        markHousekeepingAction([raw?.roomNumber, raw?.taskId], "COMPLETED");

        const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Phòng";
        toast.success("Đã hoàn thành dọn phòng", {
          id: `hotel-ops-housekeeping-completed-${raw?.taskId ?? raw?.roomNumber ?? Date.now()}`,
          description: `${roomLabel} • Sẵn sàng kiểm tra / đón khách`,
          duration: 3000,
        });

        void invalidateHotelHousekeepingRealtimeQueries(targetQueryClient, hotelId);
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
      },
      onHousekeepingTaskReopened: (event: unknown) => {
        const raw = event as {
          hotelId?: string;
          taskId?: string;
          roomNumber?: string | null;
          reason?: string | null;
        } | null;

        if (raw?.hotelId && raw.hotelId !== hotelId) return;

        markHousekeepingAction([raw?.roomNumber, raw?.taskId], "REOPENED");

        playRequestAlertSound(false);

        const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Phòng";
        toast.warning("Mở lại nhiệm vụ buồng phòng", {
          id: `hotel-ops-housekeeping-reopened-${raw?.taskId ?? raw?.roomNumber ?? Date.now()}`,
          description: `${roomLabel} • Yêu cầu kiểm tra hoặc dọn lại`,
          duration: 4000,
        });

        void invalidateHotelHousekeepingRealtimeQueries(targetQueryClient, hotelId);
      },
      onReconnect: () => {
        void invalidateHotelRequestRealtimeQueries(targetQueryClient, hotelId);
        void invalidateHotelHousekeepingRealtimeQueries(targetQueryClient, hotelId);
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
      },
    }),
    [hotelId, router, targetQueryClient],
  );

  useOwnerRequestRealtime(hotelId, handlers, {
    showConnectionToasts: true,
  });

  return null;
}
