export type CccdQrData = {
  identityNumber: string;
  displayName: string;
  dateOfBirth: string;
  gender: string;
  residencePlace: string;
  identityIssueDate: string;
};

function parseDate(value: string): string {
  if (!value) throw new Error("Ngày rỗng");
  const cleaned = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      throw new Error(`Ngày không hợp lệ: ${value}`);
    }
    return cleaned;
  }
  const slashMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, dStr, mStr, yStr] = slashMatch;
    const d = Number(dStr);
    const m = Number(mStr);
    const y = Number(yStr);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      throw new Error(`Ngày không hợp lệ: ${value}`);
    }
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 8) {
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4));
    const dt1 = new Date(Date.UTC(year, month - 1, day));
    if (dt1.getUTCFullYear() === year && dt1.getUTCMonth() === month - 1 && dt1.getUTCDate() === day) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    const y2 = Number(digits.slice(0, 4));
    const m2 = Number(digits.slice(4, 6));
    const d2 = Number(digits.slice(6, 8));
    const dt2 = new Date(Date.UTC(y2, m2 - 1, d2));
    if (dt2.getUTCFullYear() === y2 && dt2.getUTCMonth() === m2 - 1 && dt2.getUTCDate() === d2) {
      return `${String(y2).padStart(4, "0")}-${String(m2).padStart(2, "0")}-${String(d2).padStart(2, "0")}`;
    }
  }
  throw new Error(`Ngày trong QR CCCD không hợp lệ: ${value}`);
}

function parseMrz(lines: string[]): CccdQrData | null {
  if (lines.length < 3) return null;
  const l1 = lines[0].trim();
  const l2 = lines[1].trim();
  const l3 = lines[2].trim();
  if (!l1.includes("<") && !l2.includes("<")) return null;
  const optPart = l1.slice(15).replace(/<+/g, "").match(/\d{12}/);
  const docPart = l1.slice(5, 14).replace(/<+/g, "").match(/\d{9,12}/);
  const identityNumber = optPart?.[0] || docPart?.[0] || l1.match(/\d{9,12}/)?.[0] || "";
  const displayName = l3.replace(/<+/g, " ").trim();
  let dateOfBirth = "";
  let gender = "Nam";
  if (/^\d{6}/.test(l2)) {
    const yy = Number(l2.slice(0, 2));
    const mm = l2.slice(2, 4);
    const dd = l2.slice(4, 6);
    const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;
    dateOfBirth = `${fullYear}-${mm}-${dd}`;
  }
  if (l2.includes("F") || l2.includes("FEMALE")) gender = "Nữ";
  if (!identityNumber || !displayName) return null;
  return {
    identityNumber,
    displayName,
    dateOfBirth: dateOfBirth || "2000-01-01",
    gender,
    residencePlace: "Việt Nam",
    identityIssueDate: new Date().toISOString().slice(0, 10),
  };
}

export function parseCccdQr(raw: string): CccdQrData {
  if (!raw || typeof raw !== "string") throw new Error("Mã QR rỗng");
  const trimmed = raw.trim();

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 3 && (lines[0].includes("<") || lines[1].includes("<"))) {
    const mrz = parseMrz(lines);
    if (mrz) return mrz;
  }

  const tokens = trimmed.split("|").map((value) => value.trim());
  while (tokens.length > 0 && tokens[tokens.length - 1] === "") {
    tokens.pop();
  }

  if (tokens.length < 5) {
    throw new Error("QR CCCD không hợp lệ: thiếu trường");
  }

  const identityNumber = tokens[0];
  if (!/^\d{9,12}$/.test(identityNumber)) {
    throw new Error(`Số căn cước không hợp lệ: ${identityNumber}`);
  }

  let displayName = "";
  let dateOfBirthRaw = "";
  let gender = "";
  let residencePlace = "";
  let issueDateRaw = "";

  const isSecondTokenName = /[^\d\s]/.test(tokens[1]);

  if (isSecondTokenName) {
    displayName = tokens[1];
    dateOfBirthRaw = tokens[2] || "";
    gender = tokens[3] || "Nam";
    residencePlace = tokens[4] || "";
    issueDateRaw = tokens[5] || "";
  } else {
    displayName = tokens[2] || "";
    dateOfBirthRaw = tokens[3] || "";
    gender = tokens[4] || "Nam";
    residencePlace = tokens[5] || "";
    issueDateRaw = tokens[6] || "";
  }

  if (!displayName) throw new Error("QR CCCD thiếu họ tên");
  if (!gender) gender = "Nam";
  if (!residencePlace) residencePlace = "Việt Nam";

  const dateOfBirth = parseDate(dateOfBirthRaw);

  let identityIssueDate = "";
  if (issueDateRaw) {
    try {
      identityIssueDate = parseDate(issueDateRaw);
    } catch {
      identityIssueDate = new Date().toISOString().slice(0, 10);
    }
  } else {
    identityIssueDate = new Date().toISOString().slice(0, 10);
  }

  return {
    identityNumber,
    displayName,
    dateOfBirth,
    gender,
    residencePlace,
    identityIssueDate,
  };
}
