import { PublicRouteMatcher } from "./public-route.matcher";

// Keep this list minimal. Every route not listed here requires a valid access token.
export const PUBLIC_PATTERNS = ["/health", "/auth/login", "/auth/refresh"];

// Regex should be exceptional. Prefer exact paths in PUBLIC_PATTERNS.
export const PUBLIC_REGEX: RegExp[] = [/^\/guest(?:\/|$)/, /^\/emergency\/guest(?:\/|$)/];

export const publicMatcher = new PublicRouteMatcher(PUBLIC_PATTERNS, PUBLIC_REGEX);
