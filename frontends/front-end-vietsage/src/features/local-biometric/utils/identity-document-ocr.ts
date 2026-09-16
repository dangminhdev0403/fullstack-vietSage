export type IdentityDocumentOcrResult = {
  documentKind: "passport" | "visa";
  format?: string;
  mrzValid?: boolean;
  identityNumber: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  residencePlace?: string;
  expiryDate?: string;
  guestDisplayName: string;
  guestIdentityNumber: string;
  guestDateOfBirth?: string;
  guestGender?: string;
  guestNationality?: string;
  guestResidencePlace?: string;
};

export type IdentityDocumentOcrFailure = {
  success: false;
  index?: number;
  filename?: string;
  code: string;
  error: string;
};

export type IdentityDocumentBatchItem =
  | ({
      success: true;
      index?: number;
      filename?: string;
    } & IdentityDocumentOcrResult)
  | IdentityDocumentOcrFailure;

export const CODE_TO_TEXT_NATIONALITY: Record<string, string> = {
  VNM: "Việt Nam",
  VN: "Việt Nam",
  VIETNAM: "Việt Nam",
  KOR: "Hàn Quốc",
  USA: "Hoa Kỳ",
  CHN: "Trung Quốc",
  JPN: "Nhật Bản",
  GBR: "Vương quốc Anh",
  FRA: "Pháp",
  DEU: "Đức",
  RUS: "Nga",
  AUS: "Úc",
  CAN: "Canada",
  SGP: "Singapore",
  THA: "Thái Lan",
  MYS: "Malaysia",
  IDN: "Indonesia",
  PHL: "Philippines",
  IND: "Ấn Độ",
  TWN: "Đài Loan",
  HKG: "Hồng Kông",
  KHM: "Campuchia",
  LAO: "Lào",
  MMR: "Myanmar",
};

export function matchBcaNationalityCode(
  value: string | null | undefined,
  items: readonly {
    code: string;
    nameVi: string;
    nameEn: string | null;
  }[],
): string {
  const raw = value?.trim();
  if (!raw) return "";
  const bracketCode = /\[([A-Z]{3})\]\s*$/i.exec(raw)?.[1];
  const normalized = (bracketCode ?? raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const aliasCode = Object.entries(CODE_TO_TEXT_NATIONALITY).find(
    ([code, name]) =>
      /^[A-Z]{3}$/.test(code) &&
      name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase() === normalized,
  )?.[0];
  const matches = items.filter(
    (item) =>
      item.code === aliasCode ||
      [item.code, item.nameVi, item.nameEn]
        .filter((candidate): candidate is string => Boolean(candidate))
        .some(
          (candidate) =>
            candidate
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toUpperCase() === normalized,
        ),
  );
  return matches.length === 1 ? matches[0].code : "";
}

export function normalizeNationalityToText(value?: string | null): string {
  if (!value) return "Việt Nam";
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  return CODE_TO_TEXT_NATIONALITY[upper] || trimmed;
}

function normalizeIdentityDate(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const match =
    /^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})\/?(\d{2})\/?(\d{4}))$/.exec(raw);
  if (!match) throw new Error("Phản hồi OpenMRZ có ngày sinh không hợp lệ");
  const [, isoYear, isoMonth, isoDay, day, month, year] = match;
  const y = Number(isoYear ?? year);
  const m = Number(isoMonth ?? month);
  const d = Number(isoDay ?? day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new Error("Phản hồi OpenMRZ có ngày sinh không hợp lệ");
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseLocalMrzResult(value: unknown): IdentityDocumentOcrResult {
  if (!value || typeof value !== "object")
    throw new Error("Phản hồi OpenMRZ không hợp lệ");
  const result = value as Record<string, unknown>;
  if (
    (result.documentKind !== "passport" && result.documentKind !== "visa") ||
    typeof result.identityNumber !== "string" ||
    !/^[A-Z0-9]{1,32}$/.test(result.identityNumber) ||
    typeof result.fullName !== "string" ||
    !result.fullName.trim()
  )
    throw new Error("Phản hồi OpenMRZ không hợp lệ");
  const optional = (key: string) =>
    typeof result[key] === "string" ? (result[key] as string) : undefined;
  const rawNat = optional("nationality") || optional("guestNationality");
  const natText = rawNat ? normalizeNationalityToText(rawNat) : undefined;
  const dateOfBirth = normalizeIdentityDate(optional("dateOfBirth"));
  const resPlace =
    optional("residencePlace") || optional("guestResidencePlace");
  return {
    documentKind: result.documentKind,
    format: optional("format"),
    mrzValid:
      typeof result.mrzValid === "boolean" ? result.mrzValid : undefined,
    identityNumber: result.identityNumber,
    fullName: result.fullName.trim(),
    dateOfBirth,
    gender: optional("gender"),
    nationality: natText,
    residencePlace: resPlace,
    expiryDate: optional("expiryDate"),
    guestDisplayName: result.fullName.trim(),
    guestIdentityNumber: result.identityNumber,
    guestDateOfBirth: dateOfBirth,
    guestGender: optional("gender"),
    guestNationality: natText,
    guestResidencePlace: resPlace,
  };
}

export function parseLocalMrzBatch(
  value: unknown,
): IdentityDocumentBatchItem[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { results?: unknown }).results)
  ) {
    throw new Error("Phản hồi OpenMRZ batch không hợp lệ");
  }
  return (value as { results: unknown[] }).results.map((item) => {
    if (!item || typeof item !== "object")
      throw new Error("Phản hồi OpenMRZ batch không hợp lệ");
    const raw = item as Record<string, unknown>;
    if (raw.success === true)
      return {
        success: true as const,
        index: typeof raw.index === "number" ? raw.index : undefined,
        filename: typeof raw.filename === "string" ? raw.filename : undefined,
        ...parseLocalMrzResult(raw),
      };
    if (
      raw.success !== false ||
      typeof raw.code !== "string" ||
      typeof raw.error !== "string"
    ) {
      throw new Error("Phản hồi OpenMRZ batch không hợp lệ");
    }
    return {
      success: false as const,
      index: typeof raw.index === "number" ? raw.index : undefined,
      filename: typeof raw.filename === "string" ? raw.filename : undefined,
      code: raw.code,
      error: raw.error,
    };
  });
}

/**
 * Try to decode a QR code from an image file using the browser's native
 * BarcodeDetector API (Chromium ≥ 88). Returns the raw QR text or null.
 * Silently returns null on unsupported browsers or if no QR is found.
 */
async function tryBrowserQrDecode(file: File): Promise<string | null> {
  try {
    const BarcodeDetectorCtor = (
      globalThis as unknown as {
        BarcodeDetector?: {
          new (opts: { formats: string[] }): {
            detect(src: ImageBitmap): Promise<{ rawValue: string }[]>;
          };
        };
      }
    ).BarcodeDetector;
    if (!BarcodeDetectorCtor) return null;
    const bitmap = await createImageBitmap(file);
    try {
      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      const barcodes = await detector.detect(bitmap);
      if (barcodes.length > 0 && barcodes[0].rawValue) {
        return barcodes[0].rawValue;
      }
    } finally {
      bitmap.close();
    }
  } catch {
    // BarcodeDetector not supported or image unreadable — fall through
  }
  return null;
}

/**
 * Try to decode a QR code from a file, parse it as CCCD QR data, and
 * convert it to an IdentityDocumentBatchItem. Returns null if no QR found
 * or if the QR content isn't a valid CCCD QR.
 */
async function tryDecodeQrFromFile(
  file: File,
  index: number,
): Promise<IdentityDocumentBatchItem | null> {
  const qrText = await tryBrowserQrDecode(file);
  if (!qrText) return null;
  try {
    // Dynamic import avoids bundling cccd-qr-parser when QR is not used
    const { parseCccdQr } = await import("./cccd-qr-parser");
    const qr = parseCccdQr(qrText);
    return {
      success: true,
      index,
      filename: file.name,
      documentKind: "passport" as const, // CCCD maps to the same guest structure
      identityNumber: qr.identityNumber,
      fullName: qr.displayName,
      dateOfBirth: qr.dateOfBirth,
      gender: qr.gender,
      nationality: "Việt Nam",
      residencePlace: qr.residencePlace,
      guestDisplayName: qr.displayName,
      guestIdentityNumber: qr.identityNumber,
      guestDateOfBirth: qr.dateOfBirth,
      guestGender: qr.gender,
      guestNationality: "Việt Nam",
      guestResidencePlace: qr.residencePlace,
    };
  } catch {
    // QR text was found but is not a valid CCCD QR → ignore
    return null;
  }
}

export async function recognizeDesktopIdentityDocuments(
  files: readonly File[],
  hotelId: string,
): Promise<IdentityDocumentBatchItem[]> {
  // Phase 1: Try QR decode for each file (browser BarcodeDetector)
  const results: (IdentityDocumentBatchItem | null)[] = new Array(
    files.length,
  ).fill(null);
  const mrzFiles: { file: File; originalIndex: number }[] = [];

  await Promise.all(
    files.map(async (file, idx) => {
      const qrResult = await tryDecodeQrFromFile(file, idx + 1);
      if (qrResult) {
        results[idx] = qrResult;
      } else {
        mrzFiles.push({ file, originalIndex: idx });
      }
    }),
  );

  // Phase 2: send one bounded image at a time to the authenticated VPS BFF.
  for (const { file, originalIndex } of mrzFiles) {
    const body = new FormData();
    body.append("files", file, file.name);
    let response: Response;
    try {
      response = await fetch(
        `/api/cccd-mobile/hotels/${encodeURIComponent(hotelId)}/ocr`,
        {
          method: "POST",
          body,
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch {
      throw new Error("Không kết nối được máy chủ OpenMRZ");
    }

    const payload = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    if (!response.ok) {
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : "Nhận diện MRZ không thành công",
      );
    }
    const item = parseLocalMrzBatch(payload)[0];
    if (item)
      results[originalIndex] = {
        ...item,
        index: originalIndex + 1,
        filename: file.name,
      };
  }

  return results.filter((r): r is IdentityDocumentBatchItem => r !== null);
}
