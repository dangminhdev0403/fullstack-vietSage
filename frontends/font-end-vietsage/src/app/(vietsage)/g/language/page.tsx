"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { VsIcon } from "../../_components/vs-icon";
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

  if (!isHydrated) {
    return <div className="min-h-screen bg-[#fffdfa]" />;
  }

  if (!sessionToken) {
    return (
      <main className="vs-guest-readable grid min-h-screen place-items-center bg-[#fffdfa] px-5 text-center text-[#121a35]">
        <section className="max-w-md rounded-[28px] border border-[#e8edf5] bg-white p-8 shadow-[0_24px_70px_rgba(7,17,42,0.16)]">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#061437] text-[#f0b447]">
            <VsIcon name="qr_code_scanner" className="text-3xl" />
          </div>
          <h1 className="vs-display text-3xl font-semibold text-[#061437]">{t("common.scanQrTitle")}</h1>
          <p className="mt-3 text-sm leading-6 text-[#667085]">{t("common.scanQrMessage")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="vs-guest-readable grid min-h-screen grid-rows-[minmax(320px,43svh)_1fr] bg-[#fffdfa] text-[#121a35] lg:grid-rows-[minmax(390px,45svh)_1fr]">
      <section className="relative overflow-hidden rounded-b-[36px] bg-[linear-gradient(180deg,rgba(5,15,45,0.98),rgba(5,15,45,0.78)_48%,rgba(5,15,45,0.22)),url('https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1400&q=80')] bg-cover bg-center px-5 py-6 text-white md:px-10 lg:px-[72px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3 font-serif text-xl font-black tracking-[0.22em] md:text-2xl">
            <span className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 font-sans text-base text-[#f0b447]">V</span>
            <span>VIETSAGE</span>
          </div>
          <div className="rounded-full border border-white/25 bg-white/10 px-4 py-3 text-sm font-bold backdrop-blur-md">GuestOS</div>
        </div>

        <div className="mx-auto mt-14 max-w-2xl text-center md:mt-20">
          <h1 className="vs-display whitespace-pre-line text-[40px] font-semibold leading-[1.05] md:text-[68px]">{t("language.welcome")}</h1>
          <div className="my-5 tracking-[0.3em] text-[#f0b447]">━━━━ ✦ ━━━━</div>
          <p className="mx-auto max-w-md text-base leading-7 text-white/85 md:text-lg">{t("language.subtitle")}</p>
        </div>
      </section>

      <section className="relative z-10 -mt-8 px-4 pb-8 lg:-mt-11">
        <div className="mx-auto max-w-3xl rounded-[30px] border border-[#e8edf5]/90 bg-[#fffdfa] p-5 shadow-[0_24px_70px_rgba(7,17,42,0.22)] md:p-8">
          <h2 className="text-center text-2xl font-bold text-[#121a35] md:text-3xl">{t("language.title")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm leading-6 text-[#667085]">{t("language.description")}</p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {guestLocaleOptions.map((option) => {
              const isActive = option.code === selectedLanguage;
              return (
                <button key={option.code} type="button" onClick={() => selectLanguage(option.code)} className={`flex min-h-16 items-center gap-3 rounded-[20px] border bg-white p-3 text-left font-bold transition duration-500 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(17,25,54,0.08)] ${isActive ? "border-[#e0a139] bg-[linear-gradient(135deg,#fff7e8,#fff)] shadow-[0_14px_34px_rgba(217,154,37,0.14)]" : "border-[#e8edf5]"}`}>
                  <span className="grid h-10 w-12 place-items-center rounded-xl bg-[#f3f5f8] text-xs font-black tracking-[0.08em] text-[#061437]">{option.badge}</span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate">{option.nativeName}</span>
                    <span className="text-xs font-semibold text-[#667085]">{option.englishName}</span>
                  </span>
                  <span className={`relative size-6 rounded-full border-2 ${isActive ? "border-[#d99a25] after:absolute after:inset-1 after:rounded-full after:bg-[#d99a25]" : "border-[#a9b1bf]"}`} />
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row">
            <button type="button" onClick={requestConfirmation} className="min-h-14 flex-1 rounded-[19px] bg-[linear-gradient(135deg,#07163d,#030a22)] px-6 text-base font-black text-[#f0b447] shadow-[0_18px_38px_rgba(6,20,55,0.24)] transition duration-500 hover:-translate-y-0.5">
              {t("common.continue")}
            </button>
          </div>
        </div>
      </section>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#061437]/55 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="language-confirm-title">
          <section className="w-full max-w-md rounded-[28px] border border-[#e8edf5] bg-[#fffdfa] p-6 text-center shadow-[0_24px_70px_rgba(7,17,42,0.24)]">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#061437] text-[#f0b447]">
              <VsIcon name="translate" className="text-3xl" />
            </div>
            <h2 id="language-confirm-title" className="vs-display text-2xl font-semibold text-[#061437]">{t("language.confirmTitle")}</h2>
            <p className="mt-3 text-sm leading-6 text-[#667085]">{t("language.confirmMessage", { language: activeLanguageOption.nativeName })}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={continueToHome} className="min-h-12 flex-1 rounded-[17px] bg-[linear-gradient(135deg,#07163d,#030a22)] px-5 text-sm font-black text-[#f0b447] shadow-[0_14px_30px_rgba(6,20,55,0.2)] transition duration-500 hover:-translate-y-0.5">
                {t("common.confirm")}
              </button>
              <button type="button" onClick={() => setIsConfirmOpen(false)} className="min-h-12 flex-1 rounded-[17px] border border-[#d8dee9] bg-white px-5 text-sm font-black text-[#061437] transition duration-500 hover:-translate-y-0.5">
                {t("common.chooseAgain")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
