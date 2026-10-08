import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
  DEFAULT_LOCALE,
  LOCALE_OPTIONS,
  normalizeLocale,
  getIntlLocale,
  type LocaleOption,
} from "@/core/i18n/locales";

export const guestLocales = SUPPORTED_LOCALES;

export type GuestLocale = SupportedLocale;

export const defaultGuestLocale: GuestLocale = DEFAULT_LOCALE;

export const guestLocaleOptions: readonly LocaleOption[] = LOCALE_OPTIONS;

export const normalizeGuestLocale = normalizeLocale;

export const guestIntlLocale = getIntlLocale;
