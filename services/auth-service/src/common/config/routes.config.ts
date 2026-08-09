import { PublicRouteMatcher } from "./public-route.matcher";

// Keep this list minimal. Every route not listed here requires a valid access token.
export const PUBLIC_PATTERNS = [
  "/health",
  "/auth/login",
  "/auth/refresh",
  "/biometric-workstations/pair",
  "/biometric-workstations/authenticate",
];

// Regex should be exceptional. Prefer exact paths in PUBLIC_PATTERNS.
export const PUBLIC_REGEX: RegExp[] = [
  /^\/guest\/(?:qr\/scan|session\/(?:me|close)|services|service-categories\/[^/]+\/services|requests|requests\/[^/]+\/cancel|messages|messages\/read|messages\/unread-summary|local-partners(?:\/categories|\/[^/]+)?|marketplace\/(?:categories|services(?:\/[^/]+)?))$/,
  /^\/emergency\/guest\/calls$/,
  /^\/payments\/webhook\/[^/]+$/,
];

export const publicMatcher = new PublicRouteMatcher(PUBLIC_PATTERNS, PUBLIC_REGEX);
