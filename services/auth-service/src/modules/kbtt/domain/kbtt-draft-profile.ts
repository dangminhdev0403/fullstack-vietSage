import { isValidCalendarDate, normalizeDateStringToIso } from './schemas/kbtt.schema';
import { formatLocalDateTime, VIETNAM_TIME_ZONE } from '../../../common/time/vietnam-temporal';

export interface KbttDraftOccupant {
  fullName: string; dateOfBirth?: string | null; gender?: string | null; identityNumber?: string | null; nationality?: string | null;
  roomNumber?: string; checkedInAt?: Date | null; plannedCheckInAt?: Date; plannedCheckOutAt?: Date;
  stay?: { room?: { roomNumber: string }; checkedInAt?: Date | null; plannedCheckInAt?: Date; plannedCheckOutAt?: Date };
}

function formatVietnamDateTime(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return Number.isNaN(value.getTime()) ? '' : formatLocalDateTime(value, VIETNAM_TIME_ZONE);
}

export function composeKbttDraft(
  citizenshipKind: 'VIETNAMESE' | 'FOREIGN',
  data: Record<string, unknown>,
  occupant: KbttDraftOccupant,
): Record<string, unknown> {
    const draft = { ...data };
    if (!draft.hoTen && occupant.fullName) draft.hoTen = occupant.fullName;
    const stay = "stay" in occupant ? occupant.stay : null;
    const roomNumber = "roomNumber" in occupant ? occupant.roomNumber : stay?.room?.roomNumber;
    const checkedInAt = "checkedInAt" in occupant ? occupant.checkedInAt : stay?.checkedInAt;
    const plannedCheckInAt =
      "plannedCheckInAt" in occupant ? occupant.plannedCheckInAt : stay?.plannedCheckInAt;
    const plannedCheckOutAt =
      "plannedCheckOutAt" in occupant ? occupant.plannedCheckOutAt : stay?.plannedCheckOutAt;
    if (roomNumber) {
      draft.soPhong = roomNumber;
    }
    if (checkedInAt || plannedCheckInAt) {
      draft.ngayDenCsltStr = formatVietnamDateTime(checkedInAt || plannedCheckInAt!);
    }
    if (plannedCheckOutAt) {
      draft.ngayDiDuKienStr = formatVietnamDateTime(plannedCheckOutAt);
    }
    if (!draft.ngayThangNamSinhStr && occupant.dateOfBirth) {
      const birthDate = occupant.dateOfBirth.trim();
      if (/^\d{4}$/.test(birthDate)) {
        if (citizenshipKind === "FOREIGN" && (!draft.loaiNgayThangNamSinh || draft.loaiNgayThangNamSinh === "Y") &&
            isValidCalendarDate(birthDate + "-01-01")) {
          draft.ngayThangNamSinhStr = birthDate + "-01-01";
          draft.loaiNgayThangNamSinh = "Y";
        }
      } else {
        const normalizedDob = normalizeDateStringToIso(birthDate);
        if (normalizedDob && isValidCalendarDate(normalizedDob)) draft.ngayThangNamSinhStr = normalizedDob;
      }
    }
    if (!draft.gioiTinh && occupant.gender) {
      const gender = occupant.gender.trim().toUpperCase();
      if (["M", "MALE", "NAM", "MALE [M]"].includes(gender)) draft.gioiTinh = "M";
      if (["F", "FEMALE", "NỮ", "NU", "FEMALE [F]"].includes(gender)) {
        draft.gioiTinh = "F";
      }
    }

    const identityNumber = occupant.identityNumber?.trim();
    if (citizenshipKind === "VIETNAMESE") {
      if (!draft.soGiayTo && identityNumber && /^[A-Za-z0-9]{1,32}$/.test(identityNumber)) {
        draft.soGiayTo = identityNumber;
      }
      if (!draft.loaiGiayTo && typeof draft.soGiayTo === "string") {
        if (/^\d{12}$/.test(draft.soGiayTo)) draft.loaiGiayTo = 1;
        else if (/^\d{9}$/.test(draft.soGiayTo)) draft.loaiGiayTo = 2;
        else if (/^(?=.*[A-Za-z])[A-Za-z0-9]{1,10}$/.test(draft.soGiayTo)) {
          draft.loaiGiayTo = 4;
        }
      }
      if (!draft.lyDoCuTru) draft.lyDoCuTru = 1;
    } else {
      if (!draft.soHoChieu && identityNumber && /^[A-Za-z0-9]{1,32}$/.test(identityNumber)) {
        draft.soHoChieu = identityNumber;
      }
      if (!draft.loaiNgayThangNamSinh && draft.ngayThangNamSinhStr) {
        draft.loaiNgayThangNamSinh = "D";
      }
      if (!draft.quocTich && occupant.nationality) {
        const nat = occupant.nationality.trim().toUpperCase();
        if (/^[A-Z0-9_-]{2,32}$/.test(nat)) {
          draft.quocTich = nat;
        }
      }
    }
    return draft;
}

export const KBTT_SHARED_DRAFT_KEYS = [
  'hoTen', 'gioiTinh', 'ngayThangNamSinhStr', 'soGiayTo', 'soHoChieu',
  'soPhong', 'ngayDenCsltStr', 'ngayDiDuKienStr',
] as const;

/** Keep provider-specific fields and divergent legacy values; remove only exactly reconstructible copies. */
export function compactKbttDraft(
  kind: 'VIETNAMESE' | 'FOREIGN', data: Record<string, unknown>, occupant: KbttDraftOccupant,
): Record<string, unknown> {
  const compact = { ...data };
  for (const key of KBTT_SHARED_DRAFT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(compact, key)) continue;
    const candidate = { ...compact };
    delete candidate[key];
    if (JSON.stringify(composeKbttDraft(kind, candidate, occupant)[key]) === JSON.stringify(compact[key])) delete compact[key];
  }
  return compact;
}
