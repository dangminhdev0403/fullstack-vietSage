/**
 * Safe RFC 4122 v4 UUID generator for both Secure and Insecure contexts.
 *
 * In secure contexts (HTTPS or localhost), `crypto.randomUUID()` is natively used.
 * In insecure contexts (e.g. LAN IP `http://192.168.x.x:3000` on desktop or mobile),
 * `crypto.randomUUID` is undefined in browser environments per Web Crypto specs.
 * This helper falls back to `crypto.getRandomValues()` or high-entropy pseudo-random bytes.
 */
export function safeRandomUuid(): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // Fall through if randomUUID fails for any unexpected reason
    }
  }

  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.getRandomValues === "function") {
    try {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant 10xx
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // Fall through to Math.random
    }
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
