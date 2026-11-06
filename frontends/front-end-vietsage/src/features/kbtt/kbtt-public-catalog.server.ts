import "server-only";

import type { KbttCatalogKind } from "./types/kbtt-contract";
import { parseKbttPublicCatalog } from "./kbtt-public-catalog-contract";

const DEFAULT_KBTT_BASE_URL = "https://api-kbtt.ai-vlab.com";
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CACHE_SECONDS = 24 * 60 * 60;

const paths: Record<KbttCatalogKind, string> = {
  NATIONALITY: "/cms-backend/public/dm-qt/3th/get-all",
  PROVINCE: "/cms-backend/public/dm-tinh-tp/get-all",
  WARD: "/cms-backend/public/dm-phuong-xa",
  STAY_REASON: "/cms-backend/public/ly-do-cu-tru/get-all",
  DOCUMENT_TYPE: "/cms-backend/public/loai-giay-to/get-all",
  RESIDENCE_PLACE: "/cms-backend/public/noi-cu-tru/get-all",
};

const inFlight = new Map<
  string,
  Promise<ReturnType<typeof parseKbttPublicCatalog>>
>();

function requestKey(kind: KbttCatalogKind, parentCode?: string): string {
  return `${kind}:${parentCode ?? ""}`;
}

async function fetchCatalog(kind: KbttCatalogKind, parentCode?: string) {
  if (kind === "WARD" && !parentCode)
    throw new Error("KBTT_WARD_PARENT_REQUIRED");

  const baseUrl = process.env.KBTT_BASE_URL ?? DEFAULT_KBTT_BASE_URL;
  const url = new URL(paths[kind], baseUrl);
  if (kind === "WARD") url.searchParams.set("trucThuocTinh", parentCode!);

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    next: {
      revalidate: CACHE_SECONDS,
      tags: [`kbtt-catalog-${requestKey(kind, parentCode)}`],
    },
  });
  const length = Number(response.headers.get("content-length") ?? "0");
  if (!response.ok || length > MAX_RESPONSE_BYTES)
    throw new Error("KBTT_PROVIDER_UNAVAILABLE");

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("KBTT_PROVIDER_INVALID_RESPONSE");
  }
  return parseKbttPublicCatalog(kind, JSON.parse(text), parentCode);
}

export function getKbttPublicCatalog(
  kind: KbttCatalogKind,
  parentCode?: string,
) {
  const key = requestKey(kind, parentCode);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = fetchCatalog(kind, parentCode).finally(() =>
    inFlight.delete(key),
  );
  inFlight.set(key, request);
  return request;
}
