import { saveKbttDraftPayloadSchema, type KbttReconciliationRow, type SaveKbttDraftPayload } from "./types/kbtt-contract";

const lockedStatuses = ["UNKNOWN", "SUBMITTED", "CANCELLED"];
function validDate(value: unknown, datetime: boolean): boolean {
  if (typeof value !== "string") return false;
  const match = value.match(datetime ? /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  return date.getUTCFullYear() === +year && date.getUTCMonth() === +month - 1 && date.getUTCDate() === +day && +hour < 24 && +minute < 60 && +second < 60;
}

/** Validate a local inline draft without sending or changing PMS stay coordinates. */
export function buildInlineDraft(row: KbttReconciliationRow, edits: Record<string, unknown>): SaveKbttDraftPayload {
  if (row.source === "BCA_ONLY" || !row.occupantId || !row.kind || !row.draftPayload || row.status === "MATCHED" || lockedStatuses.includes(row.declarationStatus ?? "")) {
    throw new Error("Hồ sơ hiện không cho phép chỉnh sửa.");
  }
  if (Object.hasOwn(edits, "soPhong")) throw new Error("Phòng và ngày nhận trả phải cập nhật từ hồ sơ lưu trú.");
  if (Object.values(edits).some((entry) => entry === undefined || entry === null || (typeof entry === "string" && !entry.trim()))) {
    throw new Error("Không được để trống trường bắt buộc đã chỉnh sửa.");
  }
  if (typeof edits.hoTen === "string" && edits.hoTen.trim().length > 120) throw new Error("Họ tên tối đa 120 ký tự.");
  const data: Record<string, unknown> = { ...row.draftPayload, ...edits, ...(row.kind === "VIETNAMESE" ? { lyDoCuTru: 1 } : {}) };
  for (const field of ["ngayThangNamSinhStr", "ngayDenCsltStr", "ngayDiDuKienStr", "thoiHanTamTruStr"]) {
    if (data[field] !== undefined && !validDate(data[field], field !== "ngayThangNamSinhStr")) throw new Error("Ngày không hợp lệ.");
  }
  if (typeof data.ngayDenCsltStr === "string" && typeof data.ngayDiDuKienStr === "string" && data.ngayDiDuKienStr < data.ngayDenCsltStr) throw new Error("Dự kiến trả phải từ thời điểm nhận phòng trở đi.");
  const required = ["hoTen", "gioiTinh", "ngayThangNamSinhStr", "ngayDenCsltStr", "ngayDiDuKienStr", ...(row.kind === "VIETNAMESE" ? ["loaiGiayTo", "soGiayTo"] : ["quocTich", "soHoChieu", "loaiNgayThangNamSinh", "thoiHanTamTruStr"])];
  if (required.some((field) => data[field] === undefined || data[field] === null || data[field] === "")) throw new Error("Điền đủ các trường bắt buộc để tự lưu.");
  const parsed = saveKbttDraftPayloadSchema.safeParse({ citizenshipKind: row.kind, data });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.");
  return parsed.data;
}
