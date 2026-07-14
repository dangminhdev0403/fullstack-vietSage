"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
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
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const { t } = useGuestI18n();
  const handlers = useMemo(
    () => ({
      onReady: () => {
        toast.success("Cập nhật realtime đã kết nối", {
          id: "guest-realtime-ready",
          duration: 4_000,
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
      onReconnect: () => dispatchGuestRequestRealtime({ kind: "reconnected" }),
      onError: () => {
        toast.error("Cập nhật realtime bị gián đoạn", {
          id: "guest-realtime-error",
          description: "Danh sách vẫn có thể được tải lại thủ công.",
        });
      },
    }),
    [t],
  );

  useGuestRequestRealtime(sessionToken, handlers);
  return null;
}
