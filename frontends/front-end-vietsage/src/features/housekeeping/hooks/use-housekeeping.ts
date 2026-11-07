"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import {
  showConfirmDialog,
  showErrorAlert,
} from "@/libs/swal";
import {
  housekeepingResource,
  useHousekeepingMutations,
} from "../resources/housekeeping-resource";
import { useHousekeepingStore } from "../store/housekeeping-store";
import {
  buildHousekeepingTaskCards,
  buildHousekeepingRoomNotifications,
  calculateHousekeepingMetrics,
  getActiveHousekeepingRequests,
} from "../utils/housekeeping-helpers";
import type {
  HotelOpsPage,
  HotelRoomSummary,
  HousekeepingFilterState,
  HousekeepingSummaryMetrics,
  HousekeepingTask,
  HousekeepingTaskCardModel,
  StaffRequestListItem,
} from "../types/housekeeping-contract";

type UseHousekeepingProps = {
  hotelId: string;
  roomId?: string;
  initialRoomsPage?: HotelOpsPage<HotelRoomSummary>;
  currentUser?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  };
};

export function useHousekeeping({
  hotelId,
  roomId,
  initialRoomsPage,
  currentUser,
}: UseHousekeepingProps) {
  const queryClient = useQueryClient();
  const currentUserId = currentUser?.id || "housekeeping-staff";
  const currentUserName = currentUser?.name || "Nhân viên buồng phòng";

  // Zustand persistent store bindings
  const viewMode = useHousekeepingStore((state) => state.getViewMode(hotelId));
  const setViewMode = useHousekeepingStore((state) => state.setViewMode);
  const filter = useHousekeepingStore((state) => state.getFilter(hotelId));
  const setFilter = useHousekeepingStore((state) => state.setFilter);
  const resetFilter = useHousekeepingStore((state) => state.resetFilter);

  // Bound housekeeping resource
  const boundResource = useMemo(
    () => housekeepingResource.bind({ hotelId }),
    [hotelId],
  );

  const scopeQuery = useQuery({
    ...boundResource.queries.assignmentScope.options(undefined),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
  const roomQuery = useQuery({
    ...boundResource.queries.room.options(roomId ?? ""),
    enabled: Boolean(roomId),
    staleTime: 10_000,
    retry: 1,
  });

  // Query: All rooms in the hotel (for metrics & full inventory)
  const allRoomsQuery = useQuery({
    ...boundResource.queries.rooms.options({
      page: 1,
      limit: 100,
    }),
    enabled: !roomId,
    initialData: initialRoomsPage && (initialRoomsPage.totalPages ?? Math.ceil(initialRoomsPage.total / (initialRoomsPage.limit || 100))) <= 1 ? initialRoomsPage : undefined,
    staleTime: 15_000,
  });

  // Durable housekeeping tasks are the source of truth for claim/start/block/complete.
  const tasksQuery = useQuery({
    ...boundResource.queries.tasks.options({ page: 1, limit: 100, roomId }),
    staleTime: 10_000,
    retry: 1,
  });

  // Query: Hotel requests (guest cleaning requests, room services)
  const requestsQuery = useQuery({
    ...boundResource.queries.requests.options({
      page: 1,
      limit: 50,
      roomNumber: roomId ? roomQuery.data?.roomNumber ?? undefined : undefined,
    }),
    enabled: !roomId || Boolean(roomQuery.data),
    staleTime: 20_000,
    retry: 1,
  });

  const allRooms: HotelRoomSummary[] = useMemo(() => {
    // A failed or pending scope query must never fall back to hotel-wide access.
    if (!scopeQuery.data || scopeQuery.isError) return [];
    const rooms = roomId
      ? roomQuery.data ? [roomQuery.data] : []
      : allRoomsQuery.data?.items ?? initialRoomsPage?.items ?? [];
    const allowed = scopeQuery.data.allowedRoomIds;
    return allowed === null ? rooms : rooms.filter((room) => allowed.includes(room.id));
  }, [scopeQuery.data, scopeQuery.isError, roomId, roomQuery.data, allRoomsQuery.data, initialRoomsPage]);

  const rawRequests: StaffRequestListItem[] = useMemo(
    () => (requestsQuery.data?.items ?? []).filter((request) =>
      allRooms.some((room) => room.roomNumber === request.roomNumber)),
    [requestsQuery.data, allRooms],
  );

  const tasks = useMemo(
    () => tasksQuery.data?.items ?? [],
    [tasksQuery.data],
  );

  const tasksByRoom = useMemo(() => {
    const result: Record<string, HousekeepingTask> = {};
    for (const task of tasks) {
      const current = result[task.roomId];
      const currentIsActive = current && ["QUEUED", "CLAIMED", "IN_PROGRESS", "BLOCKED"].includes(current.status);
      const taskIsActive = ["QUEUED", "CLAIMED", "IN_PROGRESS", "BLOCKED"].includes(task.status);
      if (!current || (taskIsActive && !currentIsActive) || (taskIsActive === Boolean(currentIsActive) && task.createdAt > current.createdAt)) {
        result[task.roomId] = task;
      }
    }
    return result;
  }, [tasks]);

  const claimedRoomsMap = useMemo(() => {
    const result: Record<string, { staffId: string; staffName: string; claimedAt: string }> = {};
    for (const task of Object.values(tasksByRoom)) {
      if ((task.status === "CLAIMED" || task.status === "IN_PROGRESS") && task.assignedToUserId) {
        result[task.roomId] = {
          staffId: task.assignedToUserId,
          staffName: task.assignedToName ?? "Nhân viên buồng phòng",
          claimedAt: task.assignedAt ?? task.updatedAt,
        };
      }
    }
    return result;
  }, [tasksByRoom]);

  // Filter requests specifically related to room cleaning / housekeeping
  const cleaningRequests: StaffRequestListItem[] = useMemo(
    () => getActiveHousekeepingRequests(rawRequests),
    [rawRequests],
  );

  // Extract unique floors
  const availableFloors = useMemo(() => {
    const floorSet = new Set<string>();
    for (const room of allRooms) {
      if (room.floor && room.floor.trim()) {
        floorSet.add(room.floor.trim());
      }
    }
    return Array.from(floorSet).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [allRooms]);

  // Calculate compact summary metrics
  const summaryMetrics: HousekeepingSummaryMetrics = useMemo(() => {
    return calculateHousekeepingMetrics(
      allRooms,
      claimedRoomsMap,
      cleaningRequests,
      tasksByRoom,
    );
  }, [allRooms, claimedRoomsMap, cleaningRequests, tasksByRoom]);

  const roomNotifications = useMemo(
    () => buildHousekeepingRoomNotifications(
      buildHousekeepingTaskCards(
        allRooms,
        claimedRoomsMap,
        currentUserId,
        cleaningRequests,
        { status: "all", floor: "all", search: "" },
        tasksByRoom,
      ),
    ),
    [allRooms, claimedRoomsMap, currentUserId, cleaningRequests, tasksByRoom],
  );

  // Transform and filter room cards
  const taskCards: HousekeepingTaskCardModel[] = useMemo(() => {
    return buildHousekeepingTaskCards(
      allRooms,
      claimedRoomsMap,
      currentUserId,
      cleaningRequests,
      filter,
      tasksByRoom,
    );
  }, [allRooms, claimedRoomsMap, currentUserId, cleaningRequests, filter, tasksByRoom]);

  // Group task cards by floor for organized presentation
  const taskCardsByFloor = useMemo(() => {
    const map = new Map<string, HousekeepingTaskCardModel[]>();
    for (const card of taskCards) {
      const floorTitle = card.floor;
      const list = map.get(floorTitle) ?? [];
      list.push(card);
      map.set(floorTitle, list);
    }
    return Array.from(map.entries())
      .sort(([left], [right]) => left.localeCompare(right, "vi", { numeric: true }))
      .map(([floor, cards]): [string, HousekeepingTaskCardModel[]] => [
        floor,
        cards.sort((left, right) => left.roomNumber.localeCompare(right.roomNumber, "vi", { numeric: true })),
      ]);
  }, [taskCards]);

  const {
    claimTaskMutation,
    startTaskMutation,
    completeTaskMutation,
    blockTaskMutation,
    reopenTaskMutation,
    updateStatusMutation,
    legacyReadyMutation,
    updateRequestMutation,
  } = useHousekeepingMutations(hotelId);

  const confirmRoomReady = useCallback(
    async (room: HotelRoomSummary) => {
      const roomNum = (room.roomNumber ?? "").trim();
      const confirmed = await showConfirmDialog({
        icon: "question",
        title: `Phòng ${roomNum} đã sạch?`,
        text: "Phòng sẽ sẵn sàng đón khách.",
        confirmText: "Đánh dấu sạch",
        cancelText: "Hủy",
      });

      if (!confirmed.isConfirmed) {
        return null;
      }

      const task = tasksByRoom[room.id];
      try {
        const updated = task && ["QUEUED", "CLAIMED", "IN_PROGRESS"].includes(task.status)
          ? await completeTaskMutation.mutateAsync({ taskId: task.id, expectedVersion: task.version })
          : await legacyReadyMutation.mutateAsync({
              roomId: room.id,
              expectedUpdatedAt: room.updatedAt || new Date().toISOString(),
            });

        // Invalidate queries so UI refreshes automatically
        await invalidateHotelRealtimeQueries(queryClient, hotelId);
        await Promise.all([roomId ? roomQuery.refetch() : allRoomsQuery.refetch(), tasksQuery.refetch()]);

        toast.success(`Phòng ${roomNum} đã sạch sẽ`, {
          description: "Đã chuyển trạng thái sang Sẵn sàng đón khách.",
          duration: 3000,
        });

        return updated;
      } catch (error) {
        // A stale task version or changed assignment must not leave the next attempt stale.
        void Promise.allSettled([
          roomId ? roomQuery.refetch() : allRoomsQuery.refetch(),
          tasksQuery.refetch(),
          scopeQuery.refetch(),
        ]);
        const message =
          error instanceof Error ? error.message : "Không thể xác nhận phòng";
        void showErrorAlert("Thao tác thất bại", message);
        return null;
      }
    },
    [allRoomsQuery, roomId, roomQuery, scopeQuery, completeTaskMutation, hotelId, legacyReadyMutation, queryClient, tasksByRoom, tasksQuery],
  );

  // Mutation: Claim room cleaning
  const claimRoom = useCallback(
    async (room: HotelRoomSummary) => {
      const roomNum = (room.roomNumber ?? "").trim();
      const task = tasksByRoom[room.id];
      if (!task || task.status !== "QUEUED") {
        void showErrorAlert("Không thể nhận việc", "Công việc đã được nhận hoặc chưa được tạo. Vui lòng đồng bộ lại danh sách.");
        return null;
      }
      try {
        const updated = await claimTaskMutation.mutateAsync({ taskId: task.id, expectedVersion: task.version });
        await tasksQuery.refetch();
        toast.info(`Bắt đầu dọn phòng ${roomNum}`, {
          description: "Công việc đã được ghi nhận cho ca trực của bạn.",
          duration: 3000,
        });
        return updated;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không thể nhận công việc dọn phòng";
        void showErrorAlert("Không thể nhận việc", message);
        return null;
      }
    },
    [claimTaskMutation, tasksByRoom, tasksQuery],
  );

  const startRoom = useCallback(
    async (room: HotelRoomSummary) => {
      const task = tasksByRoom[room.id];
      if (!task || task.status !== "CLAIMED") return null;
      try {
        const updated = await startTaskMutation.mutateAsync({ taskId: task.id, expectedVersion: task.version });
        await tasksQuery.refetch();
        toast.info(`Đã bắt đầu dọn phòng ${room.roomNumber ?? ""}`);
        return updated;
      } catch (error) {
        void showErrorAlert("Không thể bắt đầu công việc", error instanceof Error ? error.message : "Vui lòng đồng bộ lại danh sách.");
        return null;
      }
    },
    [startTaskMutation, tasksByRoom, tasksQuery],
  );

  const reopenRoom = useCallback(
    async (room: HotelRoomSummary) => {
      const task = tasksByRoom[room.id];
      if (!task || task.status !== "BLOCKED") return null;
      try {
        const updated = await reopenTaskMutation.mutateAsync({ taskId: task.id, expectedVersion: task.version, reason: "Tiếp tục xử lý sau khi đã khắc phục trở ngại" });
        await tasksQuery.refetch();
        toast.info(`Đã mở lại công việc phòng ${room.roomNumber ?? ""}`);
        return updated;
      } catch (error) {
        void showErrorAlert("Không thể mở lại công việc", error instanceof Error ? error.message : "Vui lòng liên hệ quản lý.");
        return null;
      }
    },
    [reopenTaskMutation, tasksByRoom, tasksQuery],
  );

  const reportMaintenance = useCallback(
    async (room: HotelRoomSummary) => {
      const roomNum = (room.roomNumber ?? "").trim();
      const confirmed = await showConfirmDialog({
        icon: "warning",
        title: `Báo sự cố bảo trì phòng ${roomNum}?`,
        text: "Phòng sẽ tạm khóa chuyển sang trạng thái Bảo trì kỹ thuật.",
        confirmText: "Báo bảo trì",
        cancelText: "Hủy",
      });

      if (!confirmed.isConfirmed) return null;

      try {
        const task = tasksByRoom[room.id];
        const updated = task
          ? await blockTaskMutation.mutateAsync({
              taskId: task.id,
              reason: "Phòng cần kiểm tra kỹ thuật trước khi tiếp tục dọn",
              expectedVersion: task.version,
            })
          : await updateStatusMutation.mutateAsync({ roomId: room.id, status: "MAINTENANCE" });
        await invalidateHotelRealtimeQueries(queryClient, hotelId);
        await Promise.all([roomId ? roomQuery.refetch() : allRoomsQuery.refetch(), tasksQuery.refetch()]);

        toast.warning(`Phòng ${room.roomNumber} đã chuyển sang Bảo trì`, {
          duration: 3000,
        });

        return updated;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Không thể cập nhật trạng thái";
        void showErrorAlert("Lỗi", message);
        return null;
      }
    },
    [allRoomsQuery, roomId, roomQuery, blockTaskMutation, hotelId, queryClient, tasksByRoom, tasksQuery, updateStatusMutation],
  );

  const claimRequest = useCallback(
    async (request: StaffRequestListItem) => {
      try {
        const updated = await updateRequestMutation.mutateAsync({
          requestId: request.id,
          status: "ACKNOWLEDGED",
          assignedToUserId: currentUserId,
          note: `Nhân viên ${currentUserName} đã nhận xử lý yêu cầu`,
        });

        await requestsQuery.refetch();
        toast.success(`Đã nhận xử lý yêu cầu phòng ${request.roomNumber}`, {
          duration: 3000,
        });
        return updated;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Không thể nhận yêu cầu";
        toast.error(message);
        return null;
      }
    },
    [currentUserId, currentUserName, requestsQuery, updateRequestMutation],
  );

  const completeRequest = useCallback(
    async (request: StaffRequestListItem) => {
      try {
        const updated = await updateRequestMutation.mutateAsync({
          requestId: request.id,
          status: "COMPLETED",
          note: `Nhân viên ${currentUserName} đã hoàn thành yêu cầu`,
        });

        await requestsQuery.refetch();
        toast.success(`Đã hoàn tất yêu cầu phòng ${request.roomNumber}`, {
          duration: 3000,
        });
        return updated;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Không thể hoàn thành yêu cầu";
        toast.error(message);
        return null;
      }
    },
    [currentUserName, requestsQuery, updateRequestMutation],
  );

  // Manual refresh all data
  const handleRefresh = useCallback(async () => {
    const results = await Promise.allSettled([
      roomId ? roomQuery.refetch({ throwOnError: true }) : allRoomsQuery.refetch({ throwOnError: true }),
      scopeQuery.refetch({ throwOnError: true }),
      tasksQuery.refetch({ throwOnError: true }),
      requestsQuery.refetch({ throwOnError: true }),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      void showErrorAlert(
        "Chưa đồng bộ được dữ liệu",
        "Kiểm tra kết nối rồi thử tải lại.",
      );
      return;
    }
    toast.success("Đã đồng bộ dữ liệu buồng phòng mới nhất");
  }, [allRoomsQuery, roomId, roomQuery, scopeQuery, requestsQuery, tasksQuery]);

  return {
    assignmentScope: scopeQuery.isError ? undefined : scopeQuery.data,
    allRooms,
    detailCard: roomId ? buildHousekeepingTaskCards(allRooms, claimedRoomsMap, currentUserId, cleaningRequests, { status: "all", floor: "all", search: "" }, tasksByRoom)[0] : undefined,
    viewMode,
    setViewMode: (mode: typeof viewMode) => setViewMode(hotelId, mode),
    filter,
    setFilter: (patch: Partial<HousekeepingFilterState>) =>
      setFilter(hotelId, patch),
    resetFilter: () => resetFilter(hotelId),
    summaryMetrics,
    availableFloors,
    taskCards,
    taskCardsByFloor,
    roomNotifications,
    cleaningRequests,
    isLoading: scopeQuery.isLoading || (roomId ? roomQuery.isLoading : allRoomsQuery.isLoading) || tasksQuery.isLoading,
    isNotificationsLoading: scopeQuery.isLoading || (roomId ? roomQuery.isLoading : allRoomsQuery.isLoading) || tasksQuery.isLoading || requestsQuery.isLoading,
    hasRoomsError: scopeQuery.isError || (roomId ? roomQuery.isError : allRoomsQuery.isError) || tasksQuery.isError,
    hasRequestsError: requestsQuery.isError,
    hasLoadError: allRoomsQuery.isError || tasksQuery.isError || requestsQuery.isError,
    isFetching: scopeQuery.isFetching || roomQuery.isFetching || allRoomsQuery.isFetching || tasksQuery.isFetching || requestsQuery.isFetching,
    confirmRoomReady,
    isConfirming: completeTaskMutation.isPending || legacyReadyMutation.isPending,
    claimRoom,
    startRoom,
    isStarting: startTaskMutation.isPending,
    reopenRoom,
    isReopening: reopenTaskMutation.isPending,
    reportMaintenance,
    claimRequest,
    completeRequest,
    handleRefresh,
  };
}
