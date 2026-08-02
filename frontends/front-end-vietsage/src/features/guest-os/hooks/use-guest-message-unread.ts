"use client";

import { useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import { useGuestRequestRealtime } from "@/features/request-realtime/use-guest-request-realtime";
import { playMessageAlertSound } from "@/features/request-realtime/audio-notifier";
import { guestMessagesResource } from "@/features/guest-os/resources/guest-messages-resource";
import {
  createEventDeduper,
  isConversationClosedEventForScope,
  isGuestMessageEventForScope,
} from "@/features/request-realtime/message-unread";

export function useGuestMessageUnread() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { locale } = useGuestI18n();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const hotelId = useGuestStore((state) => state.hotelId);
  const stayId = useGuestStore((state) => state.stayId);
  const hydrated = useGuestStoreHydrated();

  const guestMessages = guestMessagesResource.bind({
    sessionToken: sessionToken ?? "",
    locale,
  });

  const unreadSummaryOptions = guestMessages.queries.unreadSummary.options(undefined as never);
  const enabled = Boolean(hydrated && sessionToken && hotelId && stayId);

  const query = useQuery({
    ...unreadSummaryOptions,
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 60_000 : false,
  });

  const deduperRef = useRef(createEventDeduper(200));

  const realtimeHandlers = useMemo(
    () => ({
      onGuestMessageCreated: (event: unknown) => {
        if (!hotelId || !stayId || !isGuestMessageEventForScope(event, hotelId, stayId)) return;
        if (typeof event === "object" && event !== null && "eventId" in event) {
          if (!deduperRef.current.accept((event as { eventId: string }).eventId)) return;
        }

        const raw = (event && typeof event === "object" ? event : {}) as Record<string, unknown>;
        const message = (raw.message && typeof raw.message === "object" ? raw.message : raw) as Record<string, unknown>;
        const senderType = String(message.senderType ?? "");
        const msgId = String(message.id ?? Date.now());
        const bodyText = message.body ? String(message.body) : "";

        const isStaffOrSystem =
          senderType === "STAFF" ||
          senderType === "SYSTEM" ||
          senderType === "AI_AGENT";

        const isMessagesPageActive = pathname === "/g/messages";

        if (isStaffOrSystem && !isMessagesPageActive) {
          playMessageAlertSound();
          toast.success("Lễ tân đã phản hồi tin nhắn", {
            id: `guest-message-reply-${msgId}`,
            description: bodyText ? bodyText.slice(0, 60) : "Bấm để xem tin nhắn mới.",
            action: {
              label: "Xem ngay",
              onClick: () => router.push("/g/messages"),
            },
          });
        }
        void queryClient.invalidateQueries({ queryKey: unreadSummaryOptions.queryKey });
      },
      onConversationClosed: (event: unknown) => {
        if (!hotelId || !stayId || !isConversationClosedEventForScope(event, hotelId, stayId)) return;
        if (typeof event === "object" && event !== null && "eventId" in event && (event as { eventId?: string }).eventId) {
          if (!deduperRef.current.accept((event as { eventId: string }).eventId)) return;
        }
        void queryClient.invalidateQueries({ queryKey: unreadSummaryOptions.queryKey });
      },
      onReconnect: () => {
        void queryClient.invalidateQueries({ queryKey: unreadSummaryOptions.queryKey });
      },
    }),
    [hotelId, pathname, queryClient, router, stayId, unreadSummaryOptions.queryKey],
  );

  useGuestRequestRealtime(enabled ? sessionToken : null, realtimeHandlers);

  return {
    unreadCount: query.data?.unreadCount ?? 0,
  };
}
