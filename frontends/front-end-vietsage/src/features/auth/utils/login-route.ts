export const LOGIN_PATH = "/dangnhap" as const;
export const LEGACY_LOGIN_PATH = "/login" as const;

export function loginUrl(callbackUrl: string): string {
  return `${LOGIN_PATH}?reauth=1&callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
