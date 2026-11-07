"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { useQueryClient } from "@tanstack/react-query";
import type { SupportedLocale } from "@/core/i18n/locales";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestStore } from "@/features/guest-os/store/guest-store";
import type { GuestRequest } from "@/features/guest-os/types/guest-os-contract";
import { guestMarketplaceResource } from "@/features/marketplace/resources/guest-marketplace-resource";
import { useGuestRequestRealtime } from "./use-guest-request-realtime";

const EXTERNAL_ORDER_TOAST_COPY: Record<
  SupportedLocale,
  { acknowledged: string; voucherIssued: (code: string) => string }
> = {
  vi: {
    acknowledged: "Khách sạn đã tiếp nhận đơn dịch vụ của bạn!",
    voucherIssued: (code) => `Khách sạn đã phát hành Mã phiếu dịch vụ${code ? `: ${code}` : ""}!`,
  },
  en: {
    acknowledged: "The hotel has acknowledged your service order!",
    voucherIssued: (code) => `The hotel has issued your service voucher${code ? `: ${code}` : ""}!`,
  },
  zh: {
    acknowledged: "酒店已确认接收您的服务订单！",
    voucherIssued: (code) => `酒店已签发服务凭证${code ? `：${code}` : ""}！`,
  },
  ko: {
    acknowledged: "호텔에서 서비스 주문을 접수했습니다!",
    voucherIssued: (code) => `호텔에서 서비스 바우처를 발급했습니다${code ? `: ${code}` : ""}!`,
  },
  ru: {
    acknowledged: "Отель принял ваш заказ на услугу!",
    voucherIssued: (code) => `Отель выпустил сервисный ваучер${code ? `: ${code}` : ""}!`,
  },
  hi: {
    acknowledged: "होटल ने आपका सेवा ऑर्डर स्वीकार कर लिया है!",
    voucherIssued: (code) => `होटल ने सेवा वाउचर जारी किया है${code ? `: ${code}` : ""}!`,
  },
};

export const GUEST_REQUEST_REALTIME_BROWSER_EVENT = "vietsage:guest-request-realtime";

export type GuestRequestRealtimeBrowserEvent = {
  kind: "created" | "updated" | "answered" | "message" | "reconnected";
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
  const queryClient = useQueryClient();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const { locale, t } = useGuestI18n();

  const handlers = useMemo(
    () => ({
      onReady: () => {
        toast.success(t("requests.realtimeReady"), {
          id: "guest-realtime-ready",
          duration: 2000,
        });
      },
      onCreated: (request: GuestRequest) => {
        dispatchGuestRequestRealtime({ kind: "created", request });
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
      onGuestMessageCreated: () => {
        dispatchGuestRequestRealtime({ kind: "message" });
      },
      onMarketplaceConversationMessageCreated: (event: unknown) => {
        const orderId =
          typeof event === "object" && event !== null && "orderId" in event
            ? (event as { orderId?: unknown }).orderId
            : undefined;
        if (!sessionToken || typeof orderId !== "string" || !orderId) return;

        void queryClient.invalidateQueries({
          queryKey: guestMarketplaceResource
            .bind({ sessionToken, locale })
            .queries.conversation.options({ orderId }).queryKey,
        });
      },
      onExternalOrderHotelAcknowledged: (event: unknown) => {
        playGuestRequestSound("updated");
        const hasVoucher =
          typeof event === "object" &&
          event !== null &&
          "voucherNumber" in event &&
          Boolean((event as { voucherNumber?: string }).voucherNumber);
        if (!hasVoucher) {
          const extCopy = EXTERNAL_ORDER_TOAST_COPY[locale] ?? EXTERNAL_ORDER_TOAST_COPY.vi;
          toast.success(extCopy.acknowledged, { id: "guest-ext-order-ack" });
        }
        void queryClient.invalidateQueries({
          queryKey: ["vietsage", "guest", sessionToken, "guest-marketplace"],
        });
      },
      onExternalOrderStatusChanged: () => {
        playGuestRequestSound("updated");
        void queryClient.invalidateQueries({
          queryKey: ["vietsage", "guest", sessionToken, "guest-marketplace"],
        });
        dispatchGuestRequestRealtime({ kind: "updated" });
      },
      onExternalOrderVoucherIssued: (event: unknown) => {
        playGuestRequestSound("answered");
        const code =
          typeof event === "object" && event !== null && "voucherNumber" in event
            ? String((event as { voucherNumber?: string }).voucherNumber)
            : "";
        const extCopy = EXTERNAL_ORDER_TOAST_COPY[locale] ?? EXTERNAL_ORDER_TOAST_COPY.vi;
        toast.success(extCopy.voucherIssued(code), {
          id: "guest-ext-order-ack",
        });
        void queryClient.invalidateQueries({
          queryKey: ["vietsage", "guest", sessionToken, "guest-marketplace"],
        });
      },
      onReconnect: () => {
        void queryClient.invalidateQueries({
          queryKey: ["vietsage", "guest", sessionToken, "guest-marketplace"],
        });
        dispatchGuestRequestRealtime({ kind: "reconnected" });
      },
      onError: () => {
        toast.error(t("requests.realtimeInterrupted"), {
          id: "guest-realtime-error",
          description: t("requests.realtimeInterruptedHelp"),
        });
      },
    }),
    [locale, queryClient, sessionToken, t],
  );

  useGuestRequestRealtime(sessionToken, handlers);
  return null;
}
