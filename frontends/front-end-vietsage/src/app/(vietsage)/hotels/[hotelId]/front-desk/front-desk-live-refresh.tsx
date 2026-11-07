"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";

export function FrontDeskLiveRefresh({ hotelId, enabled = true }: { hotelId: string; enabled?: boolean }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  useOwnerRequestRealtime(
    hotelId,
    {
      onChannelBookingCreated: refresh,
      onChannelBookingCancelled: refresh,
      onRoomStatusUpdated: refresh,
      onReconnect: refresh,
    },
    { enabled, showConnectionToasts: false },
  );

  useEffect(() => {
    if (!enabled) return;
    const refreshOnFocus = () => refresh();
    window.addEventListener("focus", refreshOnFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15_000);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      window.clearInterval(interval);
    };
  }, [enabled, refresh]);

  return null;
}
