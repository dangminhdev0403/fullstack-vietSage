"use client";

import { VsBottomNav } from "../../_components/vs-bottom-nav";
import { VsTopBar } from "../../_components/vs-top-bar";
import { GuestAccessRequiredState } from "@/features/guest-os/components/shared/guest-access-required-state";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import { GuestLocalPartners } from "@/features/local-partners/components/guest-local-partners";
import { VsIcon } from "../../_components/vs-icon";

export default function GuestNearbyPartnersPage() {
  const { locale } = useGuestI18n();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const hotelId = useGuestStore((state) => state.hotelId);
  const stayId = useGuestStore((state) => state.stayId);
  const room = useGuestStore((state) => state.room);
  const isHydrated = useGuestStoreHydrated();

  if (!isHydrated) return <div className="min-h-screen bg-slate-950" />;
  if (!sessionToken || !hotelId) {
    return <GuestAccessRequiredState icon={<VsIcon name="qr_code" className="text-2xl" />} />;
  }

  const roomLabel = room?.roomNumber ? `Phòng ${room.roomNumber}` : "Khách lưu trú";

  return (
    <div className="vs-page-shell vs-guest-readable vs-safe-bottom min-h-screen bg-slate-950 text-slate-100">
      <VsTopBar showLeftControl={false} rightMode="icons" rightLabel={roomLabel} languageBadge={locale} />
      <main className="relative min-h-screen pt-16 px-4 pb-20">
        <GuestLocalPartners hotelId={hotelId} stayId={stayId || undefined} />
      </main>
      <VsBottomNav active="services" />
    </div>
  );
}
