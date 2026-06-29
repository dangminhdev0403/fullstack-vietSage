"use client";

import Image from "next/image";
import Link from "next/link";

import { VsBottomNav } from "../../_components/vs-bottom-nav";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";

const heroImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBLf-YgBzrAgVSZdKcO9N6jpI4lupnOTcOHfUkeGXB57Dlu87twUYSLuWmT9IOKxvna_fxW7cAmK9NUD2Nyjvi65lpkRMiABK9ITeGQnSpNE87Y4BOdW-oupeenR4uCeaq59Vwj6WeDl2ztZjekTZ81na-b6VBz7LkAtogRJ5RJgKf9N30jQC_INQ7nvHrk1KaMJbUgeHqxL-TqqEFTHsEvo3b6QXUfcm7piR-6miQr_6U1N-wX4KCupu6muvYa6qYMTmgdZmYX9DI";
const diningImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDXM0kt_WMMmzSxfZEVpa0Z0DchZESlCNbyzVKGrHS_OccnhPY8_Y4Q2Lzh-5f2-ASXzuoKHOjFlFSbv2I8kQLMSkQY1UStUcZ-Njwzjk4xcQZnUKceheUjBig1oRC-_GYnTrtE9uc1Ab5gj4tsgYGUWitROyXQQuwwn9z2T13GbaABZxZj13uEVEymaPI_VizfMJa27urVVwtAqIoIU-jh-J735qx5lV2szkYk2Pqb1TPI7vjpJt8b2S4fcFrG-qvT39bUDbAXjhQ";
const spaImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuA2jpiq4gCQ8iu2W6tjojXn8cE6RAPo9aj_U1tKEro3rZ7fNxTIm2FLg7kfYKz-2oFGuB0UhMTfoSel_aeOW5_7rphVTeiTleVdlN-xAgyR0j4m42fLlUuZVOdnK1Fzi4fQp7dgTSvqAlFjGrTGekNktfipI1g2cZ5gFzd4tTgSwykCi3gfrp7AO3DzfSFr-0SPXZZbtDe7mo57KjhHzGfYoCsYAtxaSiH_ru1WiKfUXvWe3zs5LNjsnthIwB1yeZ9ArxbY4eAW9TE";

function normalizeVietnameseText(value: string): string {
  return value.normalize("NFC");
}

const serviceHighlights = [
  {
    icon: "room_service",
    titleKey: "home.highlight1Title",
    descriptionKey: "home.highlight1Desc",
  },
  {
    icon: "task_alt",
    titleKey: "home.highlight2Title",
    descriptionKey: "home.highlight2Desc",
  },
  {
    icon: "support_agent",
    titleKey: "home.highlight3Title",
    descriptionKey: "home.highlight3Desc",
  },
];

function GuestAccessRequiredState() {
  const { t } = useGuestI18n();

  return (
    <div className="vs-page-shell vs-guest-readable min-h-screen bg-[#f8f4ea] text-[#18211d]">
      <VsTopBar showRightInfo={false} showLeftControl={false} brandSize="large" rightMode="none" />
      <main className="vs-container flex min-h-screen items-center justify-center px-6 py-24">
        <section className="w-full max-w-xl rounded-lg border border-[#25483f]/12 bg-white p-8 text-center shadow-[0_18px_55px_rgba(31,61,53,0.12)]">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-[#25483f] text-white">
            <VsIcon name="qr_code" className="text-2xl" />
          </div>
          <h1 className="text-3xl font-semibold text-[#18211d]">{t("common.scanQrTitle")}</h1>
          <p className="mt-3 text-sm leading-6 text-[#5e6a62]">{t("common.scanQrMessage")}</p>
        </section>
      </main>
    </div>
  );
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

  if (!isHydrated) {
    return <div className="min-h-screen bg-[#f8f4ea]" />;
  }

  if (!sessionToken) {
    return <GuestAccessRequiredState />;
  }

  return (
    <div className="vs-page-shell vs-guest-readable vs-safe-bottom min-h-screen overflow-x-hidden bg-[#f8f4ea] text-[#18211d]">
      <VsTopBar showLeftControl={false} rightMode="icons" rightLabel={roomLabel} languageBadge={locale} />

      <main className="relative min-h-screen pt-16">
        <section className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
          <Image src={heroImage} alt={t("home.heroAlt")} fill priority sizes="100vw" className="object-cover motion-safe:animate-[fadeInScale_2.2s_cubic-bezier(0.2,0.8,0.2,1)_both]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(24,33,29,0.84)_0%,rgba(24,33,29,0.60)_42%,rgba(24,33,29,0.18)_100%)]" />
          <div className="vs-container relative z-10 flex min-h-[calc(100dvh-4rem)] items-center px-4 py-12">
            <div className="vs-rise-in max-w-2xl text-white">
              <p className="text-sm font-semibold text-[#f4d36f]">{t("home.hello", { name: guestName })}</p>
              <h1 className="mt-4 text-[42px] font-semibold leading-[1.04] md:text-[72px]">
                {t("home.heroTitle", { room: roomLabel.toLowerCase() })}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/82 md:text-lg">
                {t("home.heroText", { hotel: hotelName })}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/g/services"
                  className="vs-touch-button inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#f4d36f] px-7 text-sm font-bold text-[#18211d] shadow-[0_18px_42px_rgba(0,0,0,0.24)]"
                >
                  {t("home.sendRequest")}
                  <VsIcon name="arrow_forward" className="text-base" />
                </Link>
                <Link
                  href="/g/requests"
                  className="vs-touch-button inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/35 bg-white/12 px-7 text-sm font-bold text-white backdrop-blur hover:bg-white/18"
                >
                  {t("home.myRequests")}
                  <VsIcon name="chevron_right" className="text-lg" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="vs-container relative z-10 px-4 py-12 md:py-16">
          <div className="grid gap-4 md:grid-cols-3">
            {serviceHighlights.map((item, index) => (
              <article key={item.titleKey} className={`vs-rise-in vs-delay-${index + 1} vs-comfort-card rounded-lg p-5`}>
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-[#f4d36f] text-[#25483f]">
                  <VsIcon name={item.icon} className="text-2xl" />
                </div>
                <h2 className="text-lg font-bold text-[#18211d]">{t(item.titleKey)}</h2>
                <p className="mt-2 text-sm leading-6 text-[#5e6a62]">{t(item.descriptionKey)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="vs-container grid gap-4 px-4 pb-12 md:grid-cols-[1.2fr_0.8fr] md:pb-16">
          <Link href="/g/services" className="group vs-rise-in relative min-h-[320px] overflow-hidden rounded-lg shadow-[0_22px_52px_rgba(31,61,53,0.16)]">
            <Image src={diningImage} alt={t("home.foodAlt")} fill sizes="(min-width: 768px) 60vw, 100vw" className="object-cover transition duration-1000 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#18211d]/88 via-[#18211d]/18 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <p className="text-sm font-semibold text-[#f4d36f]">{t("home.foodTitle")}</p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight">{t("home.foodHeadline")}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/78">{t("home.foodDesc")}</p>
            </div>
          </Link>

          <Link href="/g/services" className="group vs-rise-in vs-delay-1 relative min-h-[320px] overflow-hidden rounded-lg shadow-[0_22px_52px_rgba(31,61,53,0.16)]">
            <Image src={spaImage} alt={t("home.careAlt")} fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover transition duration-1000 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#18211d]/88 via-[#18211d]/18 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <p className="text-sm font-semibold text-[#f4d36f]">{t("home.careTitle")}</p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight">{t("home.careHeadline")}</h2>
              <p className="mt-2 text-sm leading-6 text-white/78">{t("home.careDesc")}</p>
            </div>
          </Link>
        </section>

        <section className="vs-container px-4 pb-32">
          <div className="vs-rise-in rounded-lg bg-[#25483f] p-6 text-white shadow-[0_24px_58px_rgba(31,61,53,0.18)] transition-transform duration-500 hover:-translate-y-0.5 md:flex md:items-center md:justify-between md:gap-8 md:p-8">
            <div>
              <p className="text-sm font-semibold text-[#f4d36f]">{roomLabel}</p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight">{t("home.readyTitle")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/76">{t("home.readyDesc")}</p>
            </div>
            <Link
              href="/g/services"
              className="vs-touch-button mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#f4d36f] px-7 text-sm font-bold text-[#18211d] md:mt-0 md:w-auto"
            >
              {t("home.sendRequest")}
              <VsIcon name="arrow_forward" className="text-base" />
            </Link>
          </div>
        </section>
      </main>

      <VsBottomNav active="home" />
    </div>
  );
}
