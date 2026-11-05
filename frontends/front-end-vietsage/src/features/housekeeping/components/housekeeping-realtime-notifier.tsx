"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { StaffRequestListItem } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  useOwnerRequestRealtime,
  type HousekeepingTaskRealtimeEvent,
} from "@/features/request-realtime/use-owner-request-realtime";
import { playRequestAlertSound } from "@/features/request-realtime/audio-notifier";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { getQueryClient } from "@/app/_components/react-query-provider";

type HousekeepingRealtimeNotifierProps = {
  hotelId: string;
};

function useSafeQueryClient() {
  try {
    return useQueryClient();
  } catch {
    return null;
  }
}

export function HousekeepingRealtimeNotifier({
  hotelId,
}: HousekeepingRealtimeNotifierProps) {
  const queryClient = useSafeQueryClient();
  const targetQueryClient = queryClient ?? getQueryClient();

  const notifyTaskEvent = useCallback((event: HousekeepingTaskRealtimeEvent, title: string, description: string, tone: "info" | "success" | "warning" = "info") => {
    if (event.hotelId && event.hotelId !== hotelId) return;
    void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
    const roomLabel = event.roomNumber ? `Phòng ${event.roomNumber}` : "Phòng";
    toast[tone](`${title}: ${roomLabel}`, {
      id: `hk-task-${event.eventId ?? event.taskId ?? title}`,
      description,
      duration: tone === "warning" ? 5000 : 3000,
    });
  }, [hotelId, targetQueryClient]);

  const handlers = useMemo(
    () => ({
      onReady: () => {
        toast.dismiss(`housekeeping-realtime-${hotelId}`);
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

        // Auto-refresh queries
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);

        const statusUpper = (raw?.status ?? "").toUpperCase();
        const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Phòng";

        if (statusUpper === "PROCESSING") {
          playRequestAlertSound(false);
          toast.warning(`${roomLabel} cần dọn dẹp`, {
            id: `hk-room-dirty-${raw?.roomId ?? Date.now()}`,
            description: "Phòng vừa chuyển sang trạng thái chờ dọn dẹp đón khách mới.",
            duration: 4000,
          });
        } else if (statusUpper === "AVAILABLE") {
          toast.success(`${roomLabel} đã sạch sẽ`, {
            id: `hk-room-clean-${raw?.roomId ?? Date.now()}`,
            description: "Phòng đã sẵn sàng đón khách.",
            duration: 3000,
          });
        } else if (statusUpper === "MAINTENANCE" || statusUpper === "BLOCKED") {
          toast.info(`${roomLabel} đã khóa/bảo trì`, {
            id: `hk-room-maint-${raw?.roomId ?? Date.now()}`,
            description: "Phòng đang tạm khóa để kiểm tra kỹ thuật.",
            duration: 3000,
          });
        }
      },

      onHousekeepingTaskCreated: (event: HousekeepingTaskRealtimeEvent) => {
        playRequestAlertSound(event.priority === "URGENT");
        notifyTaskEvent(event, "Có công việc dọn phòng mới", "Phòng vừa chuyển sang hàng đợi dọn phòng.", "warning");
      },
      onHousekeepingTaskClaimed: (event: HousekeepingTaskRealtimeEvent) => {
        notifyTaskEvent(event, "Đã nhận công việc dọn phòng", event.assignedStaffName ? `${event.assignedStaffName} đang phụ trách.` : "Công việc đã được phân công.");
      },
      onHousekeepingTaskStarted: (event: HousekeepingTaskRealtimeEvent) => {
        notifyTaskEvent(event, "Đang dọn phòng", "Công việc đã bắt đầu.");
      },
      onHousekeepingTaskBlocked: (event: HousekeepingTaskRealtimeEvent) => {
        notifyTaskEvent(event, "Công việc dọn phòng bị tạm dừng", event.reason ?? "Cần xử lý trở ngại trước khi tiếp tục.", "warning");
      },
      onHousekeepingTaskCompleted: (event: HousekeepingTaskRealtimeEvent) => {
        notifyTaskEvent(event, "Đã dọn phòng xong", "Phòng đã sẵn sàng đón khách.", "success");
      },
      onHousekeepingTaskReopened: (event: HousekeepingTaskRealtimeEvent) => {
        notifyTaskEvent(event, "Đã mở lại công việc dọn phòng", "Phòng quay lại hàng đợi xử lý.");
      },

      onCreated: (request: StaffRequestListItem) => {
        const isUrgent = request.priority === "URGENT";
        playRequestAlertSound(isUrgent);

        const category = (request.categoryName ?? "").toLowerCase();
        const displayName = (request.displayName ?? "").toLowerCase();
        const isCleaningRelated =
          category.includes("dọn") ||
          category.includes("buồng") ||
          displayName.includes("dọn") ||
          displayName.includes("khăn") ||
          displayName.includes("ga");

        toast[isUrgent ? "error" : "info"](
          isCleaningRelated
            ? `Yêu cầu dọn buồng mới: Phòng ${request.roomNumber}`
            : `Yêu cầu mới: Phòng ${request.roomNumber}`,
          {
            id: `hk-request-${request.id}`,
            description: `${request.displayName}${request.description ? ` · ${request.description}` : ""}`,
            duration: isUrgent ? 5000 : 3500,
          },
        );

        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
      },

      onUpdated: (request: Partial<StaffRequestListItem> & { id: string }) => {
        const status = String(request.status ?? "");
        if (status === "CANCELLED") {
          toast.dismiss(`hk-request-${request.id}`);
          toast.warning(
            `Phòng ${request.roomNumber ?? ""} đã hủy yêu cầu`,
            {
              id: `hk-request-cancel-${request.id}`,
              duration: 2500,
            },
          );
        }
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
      },

      onAnswered: () => {
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
      },

      onReconnect: () => {
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
      },
    }),
    [hotelId, notifyTaskEvent, targetQueryClient],
  );

  useOwnerRequestRealtime(hotelId, handlers);

  return null;
}
