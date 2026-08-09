"use client";

import { VsBottomNav } from "../../_components/vs-bottom-nav";
import { VsTopBar } from "../../_components/vs-top-bar";
import { GuestAccessRequiredState } from "@/features/guest-os/components/shared/guest-access-required-state";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import { GuestMarketplace } from "@/features/marketplace/components/guest-marketplace";
import { VsIcon } from "../../_components/vs-icon";

export default function GuestNearbyPartnersPage() {
  const { locale } = useGuestI18n();
  const sessionToken = useGuestStore((state) => state.sessionToken);

  const room = useGuestStore((state) => state.room);
  const isHydrated = useGuestStoreHydrated();

  if (!isHydrated) return <div className="min-h-screen bg-slate-950" />;
  if (!sessionToken) {
    return <GuestAccessRequiredState icon={<VsIcon name="qr_code" className="text-2xl" />} />;
  }

  const roomLabel = room?.roomNumber ? `Phòng ${room.roomNumber}` : "Khách lưu trú";

  return (
    <div className="vs-page-shell vs-guest-readable vs-safe-bottom min-h-screen bg-[#f8f4ea] text-[#18211d]">
      <VsTopBar showLeftControl={false} rightMode="icons" rightLabel={roomLabel} languageBadge={locale} />
      <main className="relative min-h-screen px-4 pb-24 pt-24">
        <GuestMarketplace sessionToken={sessionToken} />
      </main>
      <VsBottomNav active="services" />
    </div>
  );
}
