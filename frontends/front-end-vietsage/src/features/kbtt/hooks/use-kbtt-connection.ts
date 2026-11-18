"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { kbttResource } from "../resources/kbtt-resource";
import type { KbttConnection, KbttCredentials } from "../types/kbtt-contract";

export type KbttConnectionUiState =
  | "UNKNOWN"
  | "CONNECTED"
  | "RETRY_PENDING"
  | "TEMP_DISCONNECTED"
  | "FACILITY_CONFLICT"
  | "LOGIN_REQUIRED"
  | "DISCONNECTED"
  | "UNCONFIGURED";

export function shouldPollKbttConnectionRecovery(
  connection:
    | Pick<KbttConnection, "configured" | "status" | "lastErrorCode" | "cooldownUntil">
    | null
    | undefined,
  nowMs: number = Date.now(),
): number | false {
  if (!connection?.configured) return false;
  if (connection.status !== "DISCONNECTED") return false;
  if (connection.lastErrorCode === "KBTT_RETRY_PENDING") return 10_000;
  if (connection.lastErrorCode === "KBTT_TEMP_DISCONNECTED") {
    if (connection.cooldownUntil) {
      const targetMs = Date.parse(connection.cooldownUntil);
      if (Number.isFinite(targetMs)) {
        const remainingMs = targetMs - nowMs;
        if (remainingMs > 0) {
          return Math.min(15_000, Math.max(5_000, remainingMs + 1_000));
        }
      }
    }
    return 15_000;
  }
  return false;
}

export function getKbttConnectionStatusInfo(
  connection:
    | Pick<
        KbttConnection,
        | "configured"
        | "status"
        | "lastErrorCode"
        | "lastErrorMessage"
        | "cooldownUntil"
      >
    | null
    | undefined,
): {
  state: KbttConnectionUiState;
  badgeLabel: string;
  message: string | null;
  isTemporaryDisconnect: boolean;
  isRetryPending: boolean;
  isLoginRequired: boolean;
  isFacilityConflict?: boolean;
} {
  if (!connection) {
    return {
      state: "UNKNOWN",
      badgeLabel: "Chưa xác định kết nối",
      message: "Chưa đọc được trạng thái kết nối BCA.",
      isTemporaryDisconnect: false,
      isRetryPending: false,
      isLoginRequired: false,
      isFacilityConflict: false,
    };
  }
  if (connection.status === "CONNECTED") {
    return {
      state: "CONNECTED",
      badgeLabel: "Đã kết nối",
      message: null,
      isTemporaryDisconnect: false,
      isRetryPending: false,
      isLoginRequired: false,
      isFacilityConflict: false,
    };
  }
  if (
    connection.status === "DISCONNECTED" &&
    connection.lastErrorCode === "KBTT_RETRY_PENDING"
  ) {
    return {
      state: "RETRY_PENDING",
      badgeLabel: "Đang thử kết nối lại sau 10 giây",
      message:
        connection.lastErrorMessage?.trim() ||
        "Đang thử kết nối lại sau 10 giây. Tài khoản và phiên đăng nhập vẫn được giữ nguyên.",
      isTemporaryDisconnect: true,
      isRetryPending: true,
      isLoginRequired: false,
      isFacilityConflict: false,
    };
  }
  if (
    connection.status === "DISCONNECTED" &&
    connection.lastErrorCode === "KBTT_TEMP_DISCONNECTED"
  ) {
    return {
      state: "TEMP_DISCONNECTED",
      badgeLabel: "Tạm ngắt kết nối BCA — đang chờ kết nối lại",
      message:
        connection.lastErrorMessage?.trim() ||
        "Tạm ngắt kết nối BCA — đang chờ kết nối lại. Tài khoản và phiên đăng nhập vẫn được giữ nguyên.",
      isTemporaryDisconnect: true,
      isRetryPending: false,
      isLoginRequired: false,
      isFacilityConflict: false,
    };
  }
  if (connection.lastErrorCode === "KBTT_FACILITY_CONFLICT") {
    return {
      state: "FACILITY_CONFLICT",
      badgeLabel: "Trùng cơ sở lưu trú BCA",
      message:
        connection.lastErrorMessage?.trim() ||
        "Tài khoản cơ sở BCA này đang được liên kết với một khách sạn khác trên hệ thống.",
      isTemporaryDisconnect: false,
      isRetryPending: false,
      isLoginRequired: false,
      isFacilityConflict: true,
    };
  }
  if (
    connection.status === "AUTH_FAILED" ||
    connection.lastErrorCode === "KBTT_AUTH_FAILED" ||
    (connection.status === "DISCONNECTED" &&
      connection.lastErrorCode === "KBTT_SESSION_ENDED")
  ) {
    return {
      state: "LOGIN_REQUIRED",
      badgeLabel: "Cần đăng nhập lại BCA",
      message:
        connection.lastErrorMessage?.trim() || "Cần đăng nhập lại BCA.",
      isTemporaryDisconnect: false,
      isRetryPending: false,
      isLoginRequired: true,
      isFacilityConflict: false,
    };
  }
  if (connection.configured) {
    return {
      state: "DISCONNECTED",
      badgeLabel: "Đã ngắt kết nối",
      message:
        connection.lastErrorMessage?.trim() || "Đã ngắt kết nối BCA.",
      isTemporaryDisconnect: false,
      isRetryPending: false,
      isLoginRequired: false,
      isFacilityConflict: false,
    };
  }
  return {
    state: "UNCONFIGURED",
    badgeLabel: "Chưa kết nối",
    message: "Chưa kết nối BCA.",
    isTemporaryDisconnect: false,
    isRetryPending: false,
    isLoginRequired: false,
    isFacilityConflict: false,
  };
}

export function useKbttConnection(hotelId: string) {
  const queryClient = useQueryClient();
  const resource = useMemo(() => kbttResource.bind({ hotelId }), [hotelId]);
  const connectionOptions = useMemo(
    () => ({
      ...resource.queries.connection.options(undefined),
      enabled: Boolean(hotelId),
      retry: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchIntervalInBackground: false,
      refetchInterval: (query: Query<KbttConnection>) =>
        shouldPollKbttConnectionRecovery(query.state.data),
    }),
    [resource, hotelId],
  );
  const connection = useQuery(connectionOptions);

  const isPollingRecovery = Boolean(
    shouldPollKbttConnectionRecovery(connection.data),
  );
  const prevRecoveryRef = useRef(false);

  useEffect(() => {
    if (prevRecoveryRef.current && !isPollingRecovery && connection.isSuccess) {
      void resource.queries.declarations.invalidateAll?.(queryClient);
      void resource.queries.inHouseDeclarations.invalidateAll?.(queryClient);
      void resource.queries.autoSubmitConfig.invalidateAll?.(queryClient);
    }
    prevRecoveryRef.current = isPollingRecovery;
  }, [isPollingRecovery, connection.isSuccess, queryClient, resource]);

  const connectMutationOptions = useMemo(() => resource.mutations.connect.options(), [resource]);
  const checkMutationOptions = useMemo(() => resource.mutations.check.options(), [resource]);
  const disconnectMutationOptions = useMemo(() => resource.mutations.disconnect.options(), [resource]);

  const connectMutation = useMutation(connectMutationOptions);
  const checkMutation = useMutation(checkMutationOptions);
  const disconnectMutation = useMutation(disconnectMutationOptions);

  const connect = useCallback(
    async (credentials: KbttCredentials) => {
      try {
        return await connectMutation.mutateAsync(credentials);
      } finally {
        connectMutation.reset();
      }
    },
    [connectMutation],
  );

  const check = useCallback(() => checkMutation.mutateAsync(), [checkMutation]);
  const disconnect = useCallback(() => disconnectMutation.mutateAsync(), [disconnectMutation]);

  return {
    connection,
    busy: connectMutation.isPending || checkMutation.isPending || disconnectMutation.isPending,
    connect,
    check,
    disconnect,
  };
}
