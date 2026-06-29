import { useMemo } from "react";

import { defaultGuestLocale, guestIntlLocale, normalizeGuestLocale } from "./config";
import type { GuestLocale } from "./config";
import { guestDictionaries } from "./dictionary";
import { useGuestStore } from "@/features/guest-os/store/guest-store";

type Replacements = Record<string, string | number | null | undefined>;

function interpolate(template: string, replacements?: Replacements): string {
  if (!replacements) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(replacements[key] ?? ""));
}

export function useGuestI18n() {
  const storedLanguage = useGuestStore((state) => state.language);
  const setLanguage = useGuestStore((state) => state.setLanguage);
  const locale = normalizeGuestLocale(storedLanguage ?? defaultGuestLocale);
  const dictionary = guestDictionaries[locale];

  return useMemo(() => ({
    locale,
    intlLocale: guestIntlLocale(locale),
    setLocale: (value: GuestLocale | string) => setLanguage(normalizeGuestLocale(value)),
    t: (key: string, replacements?: Replacements) => interpolate(dictionary[key] ?? guestDictionaries.vi[key] ?? key, replacements),
  }), [dictionary, locale, setLanguage]);
}
