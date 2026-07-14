"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";

import { VsIcon } from "../../_components/vs-icon";
import { guestMotionTokens } from "@/features/guest-os/components/motion/guest-motion-tokens";
import { GuestReveal } from "@/features/guest-os/components/motion/guest-reveal";
import { GuestAccessRequiredState } from "@/features/guest-os/components/shared/guest-access-required-state";
import { guestLocaleOptions } from "@/features/guest-os/i18n/config";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";

export default function GuestLanguagePage() {
  const router = useRouter();
  const { locale, setLocale, t } = useGuestI18n();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const isHydrated = useGuestStoreHydrated();
  const [selectedLanguage, setSelectedLanguage] = useState(locale);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const activeLanguageOption = guestLocaleOptions.find((option) => option.code === selectedLanguage) ?? guestLocaleOptions[0];

  function requestConfirmation() {
    if (!sessionToken) return;
    setIsConfirmOpen(true);
  }

  function selectLanguage(language: typeof selectedLanguage) {
    setSelectedLanguage(language);
    setLocale(language);
  }

  function continueToHome() {
    if (!sessionToken) return;
    setLocale(selectedLanguage);
    setIsConfirmOpen(false);
    router.replace("/g/home");
  }

  function closeConfirmation() {
    setIsConfirmOpen(false);
    requestAnimationFrame(() => continueButtonRef.current?.focus());
  }

  useEffect(() => {
    if (!isConfirmOpen) return;

    confirmButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeConfirmation();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isConfirmOpen]);

  if (!isHydrated) return <div className="min-h-screen bg-[#f8f4ea]" />;

  if (!sessionToken) {
    return <GuestAccessRequiredState icon={<VsIcon name="qr_code_scanner" className="text-3xl" />} />;
  }

  return (
    <main className="vs-guest-readable grid min-h-screen grid-rows-[minmax(320px,43svh)_1fr] bg-[#f8f4ea] text-[#18211d] lg:grid-rows-[minmax(390px,45svh)_1fr]">
      <section className="relative overflow-hidden rounded-b-[36px] bg-[linear-gradient(180deg,rgba(31,61,53,0.97),rgba(31,61,53,0.78)_48%,rgba(31,61,53,0.28)),url('https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1400&q=80')] bg-cover bg-center px-5 py-6 text-white md:px-10 lg:px-[72px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3 font-serif text-xl font-black tracking-[0.22em] md:text-2xl">
            <span className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 font-sans text-base text-[#f4d36f]">V</span>
            <span>VIETSAGE</span>
          </div>
          <div className="rounded-full border border-white/25 bg-white/10 px-4 py-3 text-sm font-bold backdrop-blur-md">GuestOS</div>
        </div>

        <div className="mx-auto mt-14 max-w-2xl text-center md:mt-20">
          <h1 className="vs-display whitespace-pre-line text-[40px] font-semibold leading-[1.05] md:text-[68px]">{t("language.welcome")}</h1>
          <div className="my-5 tracking-[0.3em] text-[#f4d36f]" aria-hidden="true">---- + ----</div>
          <p className="mx-auto max-w-md text-base leading-7 text-white/85 md:text-lg">{t("language.subtitle")}</p>
        </div>
      </section>

      <section className="relative z-10 -mt-8 px-4 pb-8 lg:-mt-11">
        <GuestReveal className="mx-auto max-w-3xl rounded-[30px] border border-[#25483f]/10 bg-[#fffdfa] p-5 shadow-[0_24px_70px_rgba(31,61,53,0.16)] md:p-8">
          <h2 className="text-center text-2xl font-bold text-[#18211d] md:text-3xl">{t("language.title")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm leading-6 text-[#5e6a62]">{t("language.description")}</p>

          <div className="mt-6 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label={t("language.title")}>
            {guestLocaleOptions.map((option) => {
              const isActive = option.code === selectedLanguage;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => selectLanguage(option.code)}
                  className={`flex min-h-16 items-center gap-3 rounded-[20px] border bg-white p-3 text-left font-bold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26] motion-safe:md:hover:-translate-y-0.5 ${isActive ? "border-[#b18b26] bg-[#fff8df] shadow-[0_14px_34px_rgba(177,139,38,0.12)]" : "border-[#25483f]/12 hover:border-[#25483f]/28"}`}
                >
                  <span className="grid h-10 w-12 place-items-center rounded-xl bg-[#e8ece7] text-xs font-black tracking-[0.08em] text-[#25483f]">{option.badge}</span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate">{option.nativeName}</span>
                    <span className="text-xs font-semibold text-[#66736b]">{option.englishName}</span>
                  </span>
                  <span className={`relative size-6 rounded-full border-2 ${isActive ? "border-[#b18b26] after:absolute after:inset-1 after:rounded-full after:bg-[#b18b26]" : "border-[#9aa49e]"}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <button ref={continueButtonRef} type="button" onClick={requestConfirmation} className="mt-6 min-h-14 w-full rounded-[19px] bg-[#25483f] px-6 text-base font-black text-white shadow-[0_18px_38px_rgba(31,61,53,0.2)] transition-colors hover:bg-[#1d3932] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]">
            {t("common.continue")}
          </button>
        </GuestReveal>
      </section>

      <AnimatePresence>
        {isConfirmOpen ? (
          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: guestMotionTokens.duration.fast }} className="fixed inset-0 z-50 grid place-items-center bg-[#18211d]/55 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="language-confirm-title">
            <m.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: guestMotionTokens.duration.standard }} className="w-full max-w-md rounded-[28px] border border-[#25483f]/10 bg-[#fffdfa] p-6 text-center shadow-[0_24px_70px_rgba(31,61,53,0.22)]">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#25483f] text-[#f4d36f]">
                <VsIcon name="translate" className="text-3xl" />
              </div>
              <h2 id="language-confirm-title" className="vs-display text-2xl font-semibold text-[#18211d]">{t("language.confirmTitle")}</h2>
              <p className="mt-3 text-sm leading-6 text-[#5e6a62]">{t("language.confirmMessage", { language: activeLanguageOption.nativeName })}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button ref={confirmButtonRef} type="button" onClick={continueToHome} className="min-h-12 flex-1 rounded-[17px] bg-[#25483f] px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(31,61,53,0.2)] transition-colors hover:bg-[#1d3932] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]">
                  {t("common.confirm")}
                </button>
                <button type="button" onClick={closeConfirmation} className="min-h-12 flex-1 rounded-[17px] border border-[#25483f]/18 bg-white px-5 text-sm font-black text-[#25483f] transition-colors hover:bg-[#f1eee4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]">
                  {t("common.chooseAgain")}
                </button>
              </div>
            </m.section>
          </m.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
