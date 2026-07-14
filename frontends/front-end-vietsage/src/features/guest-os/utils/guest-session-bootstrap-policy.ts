const PROTECTED_GUEST_ROUTES = new Set(["/g/home", "/g/language", "/g/services", "/g/requests"]);

export function isProtectedGuestRoute(pathname: string): boolean {
  return PROTECTED_GUEST_ROUTES.has(pathname);
}

export function decideGuestSessionValidationError(status: number): "logout" | "retry" {
  return status === 401 || status === 403 || status === 410 ? "logout" : "retry";
}

export function isCurrentGuestSessionValidation(
  validatedToken: string,
  currentToken: string | null,
): boolean {
  return validatedToken === currentToken;
}
