"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { guestMessagesResource } from "@/features/guest-os/resources/guest-messages-resource";
import { useGuestStore } from "@/features/guest-os/store/guest-store";
import type { GuestRequest } from "@/features/guest-os/types/guest-os-contract";
import { useGuestRequestRealtime } from "./use-guest-request-realtime";

export const GUEST_REQUEST_REALTIME_BROWSER_EVENT = "vietsage:guest-request-realtime";

export type GuestRequestRealtimeBrowserEvent = {
  kind: "created" | "updated" | "answered" | "reconnected";
  request?: Partial<GuestRequest> & { id: string };
};

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function playGuestRequestSound(kind: "created" | "updated" | "answered") {
  if (typeof window === "undefined") return;

  const audioWindow = window as AudioWindow;
  const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  const patterns = {
    created: [620, 820],
    updated: [540, 680],
    answered: [660, 880, 1040],
  } as const;
  const startAt = context.currentTime;

  patterns[kind].forEach((frequency, index) => {
    const offset = index * 0.16;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt + offset);
    gain.gain.setValueAtTime(0.0001, startAt + offset);
    gain.gain.exponentialRampToValueAtTime(0.09, startAt + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + 0.14);
  });

  window.setTimeout(() => void context.close(), 800);
}

function dispatchGuestRequestRealtime(detail: GuestRequestRealtimeBrowserEvent) {
  window.dispatchEvent(
    new CustomEvent<GuestRequestRealtimeBrowserEvent>(GUEST_REQUEST_REALTIME_BROWSER_EVENT, {
      detail,
    }),
  );
}

export function GuestRequestRealtimeNotifier() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const { locale, t } = useGuestI18n();

  const handlers = useMemo(
    () => ({
      onReady: () => {
        toast.success(t("requests.realtimeReady"), {
          id: "guest-realtime-ready",
          duration: 3_000,
        });
      },
      onCreated: (request: GuestRequest) => {
        playGuestRequestSound("created");
        dispatchGuestRequestRealtime({ kind: "created", request });
        toast.success(t("requests.updatedNew"));
      },
      onUpdated: (request: Partial<GuestRequest> & { id: string }) => {
        playGuestRequestSound("updated");
        dispatchGuestRequestRealtime({ kind: "updated", request });
        toast.info(t("requests.updatedStatus"));
      },
      onAnswered: (request: Partial<GuestRequest> & { id: string }) => {
        playGuestRequestSound("answered");
        dispatchGuestRequestRealtime({ kind: "answered", request });
        toast.success(t("requests.updatedAnswer"));
      },
      onGuestMessageCreated: (event: unknown) => {
        const rawMessage =
          typeof event === "object" && event !== null && "message" in event
            ? (event as { message?: { id?: string; senderType?: string; body?: string } }).message
            : undefined;

        if (sessionToken) {
          void queryClient.invalidateQueries({
            queryKey: guestMessagesResource
              .bind({ sessionToken, locale })
              .queries.unreadSummary.options(undefined as never).queryKey,
          });
        }

        if (rawMessage?.senderType === "STAFF") {
          playGuestRequestSound("updated");
          const isMessagePage =
            typeof window !== "undefined" && window.location.pathname.endsWith("/g/messages");

          if (!isMessagePage) {
            toast.info("Lễ tân vừa gửi tin nhắn mới", {
              id: `guest-message-created-${rawMessage.id ?? Date.now()}`,
              description:
                typeof rawMessage.body === "string" ? rawMessage.body.slice(0, 80) : undefined,
              duration: 6000,
              action: {
                label: "Xem ngay",
                onClick: () => router.push("/g/messages"),
              },
            });
          }
        }
      },
      onExternalOrderHotelAcknowledged: (event: unknown) => {
        playGuestRequestSound("updated");
        const hasVoucher = typeof event === "object" && event !== null && "voucherNumber" in event && Boolean((event as { voucherNumber?: string }).voucherNumber);
        if (!hasVoucher) {
          toast.success("Khách sạn đã tiếp nhận đơn dịch vụ của bạn!", { id: "guest-ext-order-ack" });
        }
        void queryClient.invalidateQueries();
      },
      onExternalOrderVoucherIssued: (event: unknown) => {
        playGuestRequestSound("answered");
        const code = typeof event === "object" && event !== null && "voucherNumber" in event ? String((event as { voucherNumber?: string }).voucherNumber) : "";
        toast.success(`Khách sạn đã phát hành Mã phiếu dịch vụ${code ? `: ${code}` : ""}!`, { id: "guest-ext-order-ack" });
        void queryClient.invalidateQueries();
      },
      onReconnect: () => dispatchGuestRequestRealtime({ kind: "reconnected" }),
      onError: () => {
        toast.error(t("requests.realtimeInterrupted"), {
          id: "guest-realtime-error",
          description: t("requests.realtimeInterruptedHelp"),
        });
      },
    }),
    [locale, queryClient, router, sessionToken, t],
  );

  useGuestRequestRealtime(sessionToken, handlers);
  return null;
}

