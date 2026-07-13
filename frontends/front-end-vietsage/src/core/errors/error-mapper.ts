import { HttpError } from "@/core/http/http-error";
import { translate, type Locale, type TranslationKey } from "@/core/i18n/translations";

export type UserFacingError = {
  translationKey: TranslationKey;
  message: string;
  statusCode?: number;
  errorCode?: string;
  businessCode?: string;
  requestId?: string;
  endpoint?: string;
  canRetry: boolean;
  shouldContactHotel: boolean;
};

type ErrorPayload = {
  errorCode?: string;
  code?: string;
  businessCode?: string;
  statusCode?: number;
  status?: number;
  requestId?: string;
  path?: string;
  endpoint?: string;
};

const BUSINESS_ERROR_KEYS: Partial<Record<string, TranslationKey>> = {
  NO_ACTIVE_STAY: "errors.business.NO_ACTIVE_STAY",
  QR_EXPIRED: "errors.business.QR_EXPIRED",
  QR_REVOKED: "errors.business.QR_REVOKED",
  ACCESS_CLOSED: "errors.business.ACCESS_CLOSED",
  GUEST_SESSION_LIMIT_REACHED: "errors.business.GUEST_SESSION_LIMIT_REACHED",
  VALIDATION_FAILED: "errors.business.VALIDATION_FAILED",
};

const HTTP_ERROR_KEYS: Partial<Record<number, TranslationKey>> = {
  400: "errors.http.400",
  401: "errors.http.401",
  403: "errors.http.403",
  404: "errors.http.404",
  409: "errors.http.409",
  422: "errors.http.422",
  429: "errors.http.429",
  500: "errors.http.500",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(payload: Record<string, unknown>, key: keyof ErrorPayload): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberField(payload: Record<string, unknown>, key: keyof ErrorPayload): number | undefined {
  const value = payload[key];
  return typeof value === "number" ? value : undefined;
}

function readErrorPayload(data: unknown): ErrorPayload {
  if (!isRecord(data)) {
    return {};
  }

  const nestedError = isRecord(data.error) ? data.error : undefined;
  return {
    errorCode: stringField(data, "errorCode") ?? stringField(nestedError ?? {}, "errorCode"),
    code: stringField(data, "code") ?? stringField(nestedError ?? {}, "code"),
    businessCode: stringField(data, "businessCode") ?? stringField(nestedError ?? {}, "businessCode"),
    statusCode: numberField(data, "statusCode") ?? numberField(data, "status"),
    status: numberField(data, "status"),
    requestId: stringField(data, "requestId") ?? stringField(nestedError ?? {}, "requestId"),
    path: stringField(data, "path"),
    endpoint: stringField(data, "endpoint"),
  };
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /failed to fetch|network|load failed|abort/i.test(error.message);
}

function resolveTranslationKey(error: unknown, payload: ErrorPayload, statusCode?: number): TranslationKey {
  const businessCode = payload.businessCode ?? payload.errorCode ?? payload.code;
  if (businessCode && BUSINESS_ERROR_KEYS[businessCode]) {
    return BUSINESS_ERROR_KEYS[businessCode];
  }

  if (isNetworkError(error)) {
    return "errors.network";
  }

  if (statusCode && HTTP_ERROR_KEYS[statusCode]) {
    return HTTP_ERROR_KEYS[statusCode];
  }

  if (statusCode && statusCode >= 500) {
    return "errors.http.500";
  }

  return "errors.http.default";
}

export function toUserFacingError(error: unknown, locale?: Locale): UserFacingError {
  const payload = error instanceof HttpError ? readErrorPayload(error.data) : {};
  const statusCode = error instanceof HttpError ? error.status : payload.statusCode ?? payload.status;
  const businessCode = payload.businessCode ?? payload.errorCode ?? payload.code;
  const translationKey = resolveTranslationKey(error, payload, statusCode);

  return {
    translationKey,
    message: translate(translationKey, {}, locale),
    statusCode,
    errorCode: payload.errorCode,
    businessCode,
    requestId: payload.requestId,
    endpoint: payload.endpoint ?? payload.path ?? (error instanceof HttpError ? error.requestUrl : undefined),
    canRetry: !statusCode || statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500,
    shouldContactHotel: translationKey.startsWith("errors.business.") || statusCode === 403 || statusCode === 404,
  };
}

export function logFrontendError(scope: string, error: unknown, userError: UserFacingError): void {
  console.warn(`[${scope}]`, {
    translationKey: userError.translationKey,
    statusCode: userError.statusCode,
    errorCode: userError.errorCode,
    businessCode: userError.businessCode,
    requestId: userError.requestId,
    endpoint: userError.endpoint,
    technicalMessage: error instanceof Error ? error.message : undefined,
  });
}
