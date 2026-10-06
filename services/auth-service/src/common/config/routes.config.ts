import { PublicRouteMatcher } from "./public-route.matcher";

// Keep this list minimal. Every route not listed here requires a valid access token.
export const PUBLIC_PATTERNS = [
  "/health",
  "/health/ready",
  "/auth/login",
  "/auth/refresh",
  "/biometric-workstations/pair",
  "/biometric-workstations/authenticate",
  // Bypass global JWT because they are protected by LocalmateKnowledgeKeyGuard
  "/localmate/knowledge",
  "/localmate/tours",
  "/public/localmate/sessions",
  "/api/v1/channel-manager/channex/webhook",
  // Public transport only; StripeWebhookController still requires a valid provider signature.
  "/webhooks/stripe",
  // Public transport for Telegram webhook; TelegramWebhookController verifies X-Telegram-Bot-Api-Secret-Token
  "/integrations/telegram/webhook",
];

// Regex should be exceptional. Prefer exact paths in PUBLIC_PATTERNS.
export const PUBLIC_REGEX: RegExp[] = [
  /^\/guest\/(?:qr\/scan|session\/(?:me|close)|services|service-categories\/[^/]+\/services|requests|requests\/[^/]+\/cancel|messages|messages\/read|messages\/unread-summary|local-partners(?:\/categories|\/[^/]+)?|marketplace\/(?:categories|services(?:\/[^/]+)?|orders(?:\/[^/]+)?|cart(?:\/(?:items(?:\/[^/]+)?|checkout))?|checkout))$/,
  /^\/emergency\/guest\/calls$/,
  /^\/payments\/webhook\/[^/]+$/,
  /^\/localmate\/(?:ai\/match|guides\/[^/]+)$/,
  /^\/public\/localmate\/(?:proposals(?:\/[^/]+\/select)?|candidates\/[^/]+|orders(?:\/[^/]+(?:\/payment-session|\/simulate-payment|\/conversation(?:\/messages)?)?)?)$/,
  /^\/api\/v1\/channel-manager\/ical\/[^/]+(?:\.ics)?$/,
];

export const publicMatcher = new PublicRouteMatcher(PUBLIC_PATTERNS, PUBLIC_REGEX);
