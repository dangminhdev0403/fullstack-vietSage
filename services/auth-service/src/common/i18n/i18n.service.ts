import { DEFAULT_LOCALE, SupportedLocale, TranslationParams } from "./i18n.types";
import { I18N_CATALOG } from "./i18n.catalog";

const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  vi: "vi-VN",
  "vi-vn": "vi-VN",
  en: "en",
  "en-us": "en",
  "en-gb": "en",
  zh: "zh",
  "zh-cn": "zh",
  "zh-hans": "zh",
  "zh-tw": "zh",
  "zh-hant": "zh",
  ko: "ko",
  "ko-kr": "ko",
  ru: "ru",
  "ru-ru": "ru",
  hi: "hi",
  "hi-in": "hi",
};

interface RequestLanguageCarrier {
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

const LEGACY_MESSAGE_KEYS: Record<string, string> = {
  "Bad request": "errors.badRequest",
  "Call API thanh cong": "common.success",
  "Database authentication failed": "errors.database.authenticationFailed",
  "Database initialization failed": "errors.database.initializationFailed",
  "Database request failed": "errors.database.requestFailed",
  "Duplicate value": "errors.database.duplicateValue",
  "Foreign key constraint failed": "errors.database.foreignKeyFailed",
  "Internal server error": "errors.internal",
  "Invalid database request": "errors.database.invalidRequest",
  "Not found": "errors.notFound",
  "Request failed": "errors.requestFailed",
  "Request validation failed": "errors.validation",
  "Required record not found": "errors.recordNotFound",
  Unauthorized: "errors.unauthorized",
  "A required database field is missing": "errors.database.missingRequiredField",
};

export class I18nService {
  resolveLocale(request?: RequestLanguageCarrier): SupportedLocale {
    const explicitLocale =
      this.firstString(request?.query?.lang) ?? this.firstHeader(request, "x-lang");
    const acceptedLanguage = this.firstHeader(request, "accept-language");
    const candidates = [explicitLocale, ...(acceptedLanguage?.split(",") ?? [])];

    for (const candidate of candidates) {
      const locale = this.normalizeLocale(candidate);
      if (locale) {
        return locale;
      }
    }

    return DEFAULT_LOCALE;
  }

  t(keyOrMessage: string, locale: SupportedLocale, params?: TranslationParams): string {
    const key = I18N_CATALOG[locale][keyOrMessage]
      ? keyOrMessage
      : LEGACY_MESSAGE_KEYS[keyOrMessage];
    const template = key
      ? (I18N_CATALOG[locale][key] ?? I18N_CATALOG[DEFAULT_LOCALE][key])
      : undefined;

    return this.interpolate(template ?? keyOrMessage, params);
  }

  translateDetail(detail: string | string[], locale: SupportedLocale): string | string[] {
    if (Array.isArray(detail)) {
      return detail.map((item) => this.translateDetailItem(item, locale));
    }

    return this.translateDetailItem(detail, locale);
  }

  private translateDetailItem(detail: string, locale: SupportedLocale): string {
    const duplicateField = detail.match(/^Duplicate value for field: (.+)$/);

    if (duplicateField) {
      return this.t("errors.database.duplicateField", locale, { field: duplicateField[1] });
    }

    return this.t(detail, locale);
  }

  private firstHeader(
    request: RequestLanguageCarrier | undefined,
    name: string,
  ): string | undefined {
    const value = request?.headers?.[name] ?? request?.headers?.[name.toLowerCase()];
    return this.firstString(value);
  }

  private firstString(value: unknown): string | undefined {
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.find((item): item is string => typeof item === "string");
    }

    return undefined;
  }

  private normalizeLocale(value: string | undefined): SupportedLocale | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.trim().split(";")[0].toLowerCase();
    return LOCALE_ALIASES[normalized] ?? LOCALE_ALIASES[normalized.split("-")[0]];
  }

  private interpolate(template: string, params: TranslationParams = {}): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = params[key];
      return value === undefined || value === null ? match : String(value);
    });
  }
}
