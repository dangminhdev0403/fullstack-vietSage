"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { StaffRequestListItem } from "@/features/hotel-ops/types/hotel-ops-contract";
import { useOwnerHotelsQuery } from "@/features/owner/queries/use-owner-hotels-query";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function requestQueuePath(hotelId: string, options?: { urgentPanel?: boolean }) {
  const path = `/owner/hotels/${hotelId}/requests`;
  return options?.urgentPanel ? `${path}?urgentPanel=1` : path;
}

function playUrgentRequestSound() {
  if (typeof window === "undefined") return;

  const audioWindow = window as AudioWindow;
  const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  const startAt = context.currentTime;
  const pattern = [740, 1040, 740, 1040, 620, 980, 620, 980];

  pattern.forEach((frequency, index) => {
    const offset = index * 0.24;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, startAt + offset);
    gain.gain.setValueAtTime(0.0001, startAt + offset);
    gain.gain.exponentialRampToValueAtTime(0.16, startAt + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + 0.18);
  });

  window.setTimeout(() => void context.close(), 2400);
}

function OwnerHotelRequestRealtimeNotifier({ hotelId }: { hotelId: string }) {
  const router = useRouter();

  const handlers = useMemo(
    () => ({
      onCreated: (request: StaffRequestListItem) => {
        const isUrgent = request.priority === "URGENT";
        const href = requestQueuePath(hotelId, { urgentPanel: isUrgent });

        if (isUrgent) {
          playUrgentRequestSound();
        }

        toast[isUrgent ? "error" : "success"](
          isUrgent ? "Yêu cầu khẩn cấp từ khách" : "Có yêu cầu mới từ khách",
          {
            id: `owner-request-created-${request.id}`,
            description: `Phòng ${request.roomNumber} - ${request.displayName}`,
            duration: isUrgent ? 15_000 : 10_000,
            action: {
              label: isUrgent ? "Xem" : "Xử lý",
              onClick: () => router.push(href),
            },
          },
        );
        router.refresh();
      },
      onUpdated: () => router.refresh(),
      onAnswered: () => router.refresh(),
      onReconnect: () => router.refresh(),
    }),
    [hotelId, router],
  );

  useOwnerRequestRealtime(hotelId, handlers, {
    enabled: false,
    showConnectionToasts: false,
  });

  return null;
}

export function OwnerRequestRealtimeNotifier() {
  const hotelsQuery = useOwnerHotelsQuery();
  const hotels = hotelsQuery.data?.items ?? [];

  if (hotels.length === 0) return null;

  return (
    <>
      {hotels.map((hotel) => (
        <OwnerHotelRequestRealtimeNotifier key={hotel.id} hotelId={hotel.id} />
      ))}
    </>
  );
}
