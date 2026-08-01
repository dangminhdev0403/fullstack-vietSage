import type { IntakePayloadV2 } from "../intake/intake-contract";

export type PreviewField = { label: string; value: string };
export type CccdPreviewModel = {
  fields: PreviewField[]; // only present fields, in order
  portraitDataUrl: string | null; // safe data URL from base64
  capturedAt: string | null; // formatted local datetime
};

const formatDate = (isoString: string) => {
  if (!isoString) return "";
  const parts = isoString.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return isoString;
};

const formatCapturedAt = (isoString: string) => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(d);
  } catch {
    return isoString;
  }
};

const calculateAge = (dobString: string, now: Date) => {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

export function buildCccdPreviewModel(payload: IntakePayloadV2, now = new Date()): CccdPreviewModel {
  const fields: PreviewField[] = [];
  const g = payload.guest;

  if (g.displayName) fields.push({ label: "Họ tên", value: g.displayName });
  if (g.identityNumber) fields.push({ label: "CCCD", value: g.identityNumber });
  
  if (g.dateOfBirth) {
    fields.push({ label: "Ngày sinh", value: formatDate(g.dateOfBirth) });
    const age = calculateAge(g.dateOfBirth, now);
    if (age !== null && age >= 0) {
      fields.push({ label: "Tuổi", value: age.toString() });
    }
  }

  if (g.gender) fields.push({ label: "Giới tính", value: g.gender });
  if (g.nationality) fields.push({ label: "Quốc tịch", value: g.nationality });
  if (g.race) fields.push({ label: "Dân tộc", value: g.race });
  if (g.residencePlace) fields.push({ label: "Địa chỉ", value: g.residencePlace });
  if (g.identityIssueDate) fields.push({ label: "Ngày cấp", value: formatDate(g.identityIssueDate) });
  if (g.identityExpiryDate) fields.push({ label: "Hết hạn", value: formatDate(g.identityExpiryDate) });
  if (payload.capturedAt) fields.push({ label: "Giờ quét", value: formatCapturedAt(payload.capturedAt) });

  if (payload.verification) {
    if (payload.verification.chipAuthenticated !== undefined) {
      fields.push({ label: "Xác thực chip", value: payload.verification.chipAuthenticated ? "Đạt" : "Không đạt" });
    }
    if (payload.verification.sodVerified !== undefined) {
      fields.push({ label: "Toàn vẹn SOD", value: payload.verification.sodVerified ? "Đạt" : "Không đạt" });
    }
  }

  let portraitDataUrl = null;
  if (payload.portrait?.base64 && payload.portrait?.mimeType) {
    portraitDataUrl = `data:${payload.portrait.mimeType};base64,${payload.portrait.base64}`;
  }

  return {
    fields,
    portraitDataUrl,
    capturedAt: payload.capturedAt ? formatCapturedAt(payload.capturedAt) : null,
  };
}
