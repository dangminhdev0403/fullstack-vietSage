import type { CitizenshipKind } from "@prisma/client";

const VIETNAMESE_NATIONALITIES = new Set(["VN", "VNM", "VIET NAM", "VIETNAM"]);
const UNKNOWN_NATIONALITIES = new Set(["", "UNKNOWN", "KHONG RO", "CHUA RO", "N/A", "NA"]);

function normalize(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function inferCitizenshipKind(input: {
  identityNumber?: string | null;
  nationality?: string | null;
}): CitizenshipKind | null {
  const nationality = normalize(input.nationality);
  const identityNumber = (input.identityNumber ?? "").trim();
  const looksLikeVietnameseId = /^\d{9}$|^\d{12}$/.test(identityNumber);

  if (VIETNAMESE_NATIONALITIES.has(nationality)) return "VIETNAMESE";
  if (!UNKNOWN_NATIONALITIES.has(nationality)) {
    return looksLikeVietnameseId ? null : "FOREIGN";
  }
  return looksLikeVietnameseId ? "VIETNAMESE" : null;
}
