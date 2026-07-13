import { HttpError } from "@/core/http/http-error";

export function isGuestSessionUnavailableError(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 401 || error.status === 403 || error.status === 410);
}

export function getGuestSessionUnavailableMessage(t: (key: string) => string): string {
  return t("session.unavailableMessage");
}

export function getGuestFriendlyErrorMessage(error: unknown, fallback: string, t: (key: string) => string): string {
  if (isGuestSessionUnavailableError(error)) {
    return getGuestSessionUnavailableMessage(t);
  }

  return error instanceof Error ? error.message : fallback;
}
