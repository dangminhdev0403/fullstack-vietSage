"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { HousekeepingAssignmentScope, HotelRoomSummary } from "../types/housekeeping-contract";
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
  scope?: HousekeepingAssignmentScope;
  rooms: HotelRoomSummary[];
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
  scope,
  rooms,
}: HousekeepingRealtimeNotifierProps) {
  const queryClient = useSafeQueryClient();
  const targetQueryClient = queryClient ?? getQueryClient();

  const recentTaskEventsRef = useRef<Map<string, { type: string; timestamp: number }>>(new Map());
  const pendingStatusTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const isAssignedRoom = useCallback((roomId?: string | null, roomNumber?: string | null) => {
    if (!scope) return false;
    if (scope.allowedRoomIds === null) return true;
    if (roomId) return scope.allowedRoomIds.includes(roomId);
    return Boolean(roomNumber && rooms.some((room) => room.roomNumber === roomNumber));
  }, [scope, rooms]);

  const markTaskAction = useCallback((keys: Array<string | null | undefined>, type: string) => {
    const validKeys = keys.filter((k): k is string => Boolean(k && String(k).trim()));
    const now = Date.now();
    for (const key of validKeys) {
      const trimmed = String(key).trim();
      recentTaskEventsRef.current.set(trimmed, { type, timestamp: now });
      const timer = pendingStatusTimerRef.current.get(trimmed);
      if (timer) {
        clearTimeout(timer);
        pendingStatusTimerRef.current.delete(trimmed);
      }
      toast.dismiss(`hk-room-status-${trimmed}`);
      toast.dismiss(`hk-room-dirty-${trimmed}`);
      toast.dismiss(`hk-room-clean-${trimmed}`);
      toast.dismiss(`hk-room-maint-${trimmed}`);
    }
  }, []);

  useEffect(() => {
    const pendingTimers = pendingStatusTimerRef.current;
    return () => {
      pendingTimers.forEach((timer) => clearTimeout(timer));
      pendingTimers.clear();
    };
  }, []);

  const notifyTaskEvent = useCallback((event: HousekeepingTaskRealtimeEvent, title: string, description: string, tone: "info" | "success" | "warning" = "info") => {
    if (event.hotelId && event.hotelId !== hotelId) return;
    void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
    if (!isAssignedRoom(event.roomId, event.roomNumber)) return;
    const roomKey = event.roomNumber ? String(event.roomNumber).trim() : (event.roomId ?? event.taskId ?? "default");
    markTaskAction([event.roomNumber, event.roomId, event.taskId], title);
    const roomLabel = event.roomNumber ? `Phòng ${event.roomNumber}` : "Phòng";
    toast[tone](`${title}: ${roomLabel}`, {
      id: `hk-task-${roomKey}`,
      description,
      duration: tone === "warning" ? 5000 : 3000,
    });
  }, [hotelId, isAssignedRoom, markTaskAction, targetQueryClient]);

  const handlers = useMemo(
    () => ({
      onReady: () => {
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
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

        if (!isAssignedRoom(raw?.roomId, raw?.roomNumber)) return;

        const keysToCheck = [raw?.roomNumber, raw?.roomId].filter((k): k is string => Boolean(k && String(k).trim()));
        const primaryKey = keysToCheck[0] ?? "default";

        // Check if there was a recent housekeeping task event for this room in the last 3.5 seconds
        const now = Date.now();
        const hasRecentTask = keysToCheck.some((key) => {
          const entry = recentTaskEventsRef.current.get(String(key).trim());
          return entry && now - entry.timestamp < 3500;
        });

        const statusUpper = (raw?.status ?? "").toUpperCase();
        if (
          hasRecentTask &&
          (statusUpper === "PROCESSING" ||
            statusUpper === "AVAILABLE" ||
            statusUpper === "MAINTENANCE" ||
            statusUpper === "BLOCKED")
        ) {
          return;
        }

        // Cancel any pending fallback status toast for these keys
        for (const key of keysToCheck) {
          const existingTimer = pendingStatusTimerRef.current.get(key);
          if (existingTimer) {
            clearTimeout(existingTimer);
            pendingStatusTimerRef.current.delete(key);
          }
        }

        const timer = setTimeout(() => {
          for (const key of keysToCheck) {
            pendingStatusTimerRef.current.delete(key);
          }

          const roomLabel = raw?.roomNumber ? `Phòng ${raw.roomNumber}` : "Phòng";

          if (statusUpper === "PROCESSING") {
            playRequestAlertSound(false);
            toast.warning(`${roomLabel} cần dọn dẹp`, {
              id: `hk-room-status-${primaryKey}`,
              description: "Phòng vừa chuyển sang trạng thái chờ dọn dẹp đón khách mới.",
              duration: 4000,
            });
          } else if (statusUpper === "AVAILABLE") {
            toast.success(`${roomLabel} đã sạch sẽ`, {
              id: `hk-room-status-${primaryKey}`,
              description: "Phòng đã sẵn sàng đón khách.",
              duration: 3000,
            });
          } else if (statusUpper === "MAINTENANCE" || statusUpper === "BLOCKED") {
            toast.info(`${roomLabel} đã khóa/bảo trì`, {
              id: `hk-room-status-${primaryKey}`,
              description: "Phòng đang tạm khóa để kiểm tra kỹ thuật.",
              duration: 3000,
            });
          }
        }, 250);

        for (const key of keysToCheck) {
          pendingStatusTimerRef.current.set(key, timer);
        }
      },

      onHousekeepingTaskCreated: (event: HousekeepingTaskRealtimeEvent) => {
        if (isAssignedRoom(event.roomId, event.roomNumber)) playRequestAlertSound(event.priority === "URGENT");
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
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        if (!isAssignedRoom(undefined, request.roomNumber)) return;
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
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        if (!isAssignedRoom(undefined, request.roomNumber)) return;
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

      onError: (error: { code?: string }) => {
        if (error.code === "SCOPE_CHANGED") {
          void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
        }
      },

      onReconnect: () => {
        void invalidateHotelRealtimeQueries(targetQueryClient, hotelId);
      },
    }),
    [hotelId, isAssignedRoom, notifyTaskEvent, targetQueryClient],
  );

  useOwnerRequestRealtime(hotelId, handlers);

  return null;
}
