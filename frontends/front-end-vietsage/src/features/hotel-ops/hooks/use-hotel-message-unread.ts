"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hotelMessagesResource } from "@/features/hotel-ops/resources/hotel-messages-resource";
import { ownerRequestRealtimeManager } from "@/features/request-realtime/owner-request-realtime-manager";
import {
  createEventDeduper,
  isConversationClosedEventForHotel,
  isGuestMessageEventForHotel,
} from "@/features/request-realtime/message-unread";

export type UseHotelMessageUnreadOptions = {
  enabled?: boolean;
};

export function useHotelMessageUnread(
  hotelId: string | null,
  options?: UseHotelMessageUnreadOptions,
) {
  const queryClient = useQueryClient();
  const isEnabled = Boolean(hotelId && options?.enabled !== false);

  const unreadSummaryOptions = useMemo(
    () =>
      hotelMessagesResource
        .bind({ hotelId: hotelId ?? "" })
        .queries.unreadSummary.options(undefined as never),
    [hotelId],
  );

  const query = useQuery({
    ...unreadSummaryOptions,
    enabled: isEnabled,
    staleTime: 15_000,
    refetchInterval: isEnabled ? 60_000 : false,
  });

  const deduperRef = useRef(createEventDeduper(200));

  useEffect(() => {
    if (!isEnabled || !hotelId) return;

    const reconcile = () => {
      void queryClient.invalidateQueries({ queryKey: unreadSummaryOptions.queryKey });
    };

    const unsubscribe = ownerRequestRealtimeManager.subscribe(hotelId, {
      onGuestMessageCreated: (event) => {
        if (!isGuestMessageEventForHotel(event, hotelId)) return;
        if (!deduperRef.current.accept(event.eventId)) return;
        reconcile();
      },
      onConversationClosed: (event) => {
        if (!isConversationClosedEventForHotel(event, hotelId)) return;
        if (event.eventId && !deduperRef.current.accept(event.eventId)) return;
        reconcile();
      },
      onReconnect: reconcile,
    });

    return unsubscribe;
  }, [hotelId, isEnabled, queryClient, unreadSummaryOptions]);

  return {
    unreadCount: query.data?.unreadCount ?? 0,
  };
}
