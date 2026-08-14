"use client";

import { use, Suspense } from "react";
import { useRouter } from "next/navigation";
import { VsBottomNav } from "@/app/(vietsage)/_components/vs-bottom-nav";
import { VsTopBar } from "@/app/(vietsage)/_components/vs-top-bar";
import { GuestAccessRequiredState } from "@/features/guest-os/components/shared/guest-access-required-state";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import { GuestMarketplaceOrderDetail } from "@/features/marketplace/components/guest-marketplace-order-detail";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type Context = {
  params: Promise<{ orderId: string }>;
};

function MarketplaceOrderDetailContent({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  const { locale, t } = useGuestI18n();

  const sessionToken = useGuestStore((state) => state.sessionToken);
  const room = useGuestStore((state) => state.room);
  const isHydrated = useGuestStoreHydrated();

  const roomLabel = room?.roomNumber
    ? t("common.roomNumber", { room: room.roomNumber })
    : t("home.roomFallback");

  if (!isHydrated) return <div className="min-h-screen bg-background" />;
  if (!sessionToken) {
    return (
      <GuestAccessRequiredState
        icon={<VsIcon name="qr_code" className="text-2xl" />}
      />
    );
  }

  return (
    <div className="vs-page-shell vs-guest-readable vs-safe-bottom vs-guest-comfort-surface min-h-screen overflow-x-hidden text-[#18211d]">
      <VsTopBar
        showLeftControl={true}
        rightMode="icons"
        rightLabel={roomLabel}
        languageBadge={locale}
      />
      <main className="vs-container pb-32 pt-24">
        <GuestMarketplaceOrderDetail
          orderId={orderId}
          sessionToken={sessionToken}
          isOpen={true}
          onClose={() => router.push("/g/services?tab=external")}
          onBackToMarketplace={() => router.push("/g/services?tab=external")}
        />
      </main>
      <VsBottomNav active="services" />
    </div>
  );
}

export default function MarketplaceOrderDetailPage({ params }: Context) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <MarketplaceOrderDetailContent params={params} />
    </Suspense>
  );
}
