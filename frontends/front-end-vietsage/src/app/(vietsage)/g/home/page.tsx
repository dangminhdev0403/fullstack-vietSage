"use client";

import { VsBottomNav } from "../../_components/vs-bottom-nav";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";
import { GuestHomeCta } from "@/features/guest-os/components/home/guest-home-cta";
import { GuestHomeExperiences } from "@/features/guest-os/components/home/guest-home-experiences";
import { GuestHomeHero } from "@/features/guest-os/components/home/guest-home-hero";
import { GuestHomeHighlights } from "@/features/guest-os/components/home/guest-home-highlights";
import { GuestAccessRequiredState } from "@/features/guest-os/components/shared/guest-access-required-state";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";

function normalizeVietnameseText(value: string): string {
  return value.normalize("NFC");
}

export default function GuestHomePage() {
  const { locale, t } = useGuestI18n();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const hotel = useGuestStore((state) => state.hotel);
  const room = useGuestStore((state) => state.room);
  const guest = useGuestStore((state) => state.guest);
  const isHydrated = useGuestStoreHydrated();
  const hotelName = normalizeVietnameseText(hotel?.name?.trim() || "VietSage");
  const roomLabel = normalizeVietnameseText(room?.roomNumber ? t("common.roomNumber", { room: room.roomNumber }) : t("home.roomFallback"));
  const guestName = normalizeVietnameseText(guest?.displayName?.trim() || t("home.guestFallback"));

  if (!isHydrated) return <div className="min-h-screen bg-[#f8f4ea]" />;
  if (!sessionToken) return <GuestAccessRequiredState icon={<VsIcon name="qr_code" className="text-2xl" />} />;

  const highlights = [
    { icon: "room_service", title: t("home.highlight1Title"), description: t("home.highlight1Desc") },
    { icon: "task_alt", title: t("home.highlight2Title"), description: t("home.highlight2Desc") },
    { icon: "support_agent", title: t("home.highlight3Title"), description: t("home.highlight3Desc") },
  ];

  return (
    <div className="vs-page-shell vs-guest-readable vs-safe-bottom min-h-screen overflow-x-hidden bg-[#f8f4ea] text-[#18211d]">
      <VsTopBar showLeftControl={false} rightMode="icons" rightLabel={roomLabel} languageBadge={locale} />
      <main className="relative min-h-screen pt-16">
        <GuestHomeHero greeting={t("home.hello", { name: guestName })} title={t("home.heroTitle", { room: roomLabel.toLowerCase() })} description={t("home.heroText", { hotel: hotelName })} primaryLabel={t("home.sendRequest")} secondaryLabel={t("home.myRequests")} imageAlt={t("home.heroAlt")} />
        <GuestHomeHighlights items={highlights} />
        <GuestHomeExperiences
          dining={{ eyebrow: t("home.foodTitle"), title: t("home.foodHeadline"), description: t("home.foodDesc"), alt: t("home.foodAlt") }}
          care={{ eyebrow: t("home.careTitle"), title: t("home.careHeadline"), description: t("home.careDesc"), alt: t("home.careAlt") }}
        />
        <GuestHomeCta roomLabel={roomLabel} title={t("home.readyTitle")} description={t("home.readyDesc")} actionLabel={t("home.sendRequest")} />
      </main>
      <VsBottomNav active="home" />
    </div>
  );
}
