export const LOCALMATE_SESSION_COOKIE = "public_localmate_token";

export const LOCALMATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/localmate",
  maxAge: 24 * 60 * 60,
};