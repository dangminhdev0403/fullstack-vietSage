import { isValidCalendarDate, isValidCalendarDateTime, normalizeDateStringToIso } from './schemas/kbtt.schema';
import { formatLocalDateTime, VIETNAM_TIME_ZONE } from '../../../common/time/vietnam-temporal';

export interface KbttDraftOccupant {
  fullName: string; dateOfBirth?: string | null; gender?: string | null; identityNumber?: string | null; nationality?: string | null;
  roomNumber?: string; checkedInAt?: Date | null; plannedCheckInAt?: Date; plannedCheckOutAt?: Date;
  stay?: { room?: { roomNumber: string }; checkedInAt?: Date | null; plannedCheckInAt?: Date; plannedCheckOutAt?: Date };
}

const DATE_OVERRIDES = '__kbttDeclarationDates';
const DECLARATION_DATE_FIELDS = ['ngayDenCsltStr', 'ngayDiDuKienStr'] as const;

export function hasExplicitDeclarationDate(
  draftPayloadJson: unknown,
  key: 'ngayDenCsltStr' | 'ngayDiDuKienStr',
): boolean {
  if (!draftPayloadJson || typeof draftPayloadJson !== 'object' || Array.isArray(draftPayloadJson)) {
    return false;
  }
  const dates = (draftPayloadJson as Record<string, unknown>)[DATE_OVERRIDES];
  if (!dates || typeof dates !== 'object' || Array.isArray(dates)) {
    return false;
  }
  const val = (dates as Record<string, unknown>)[key];
  return typeof val === 'string' && isValidCalendarDateTime(val);
}

/** Internal provenance distinguishes explicit edits from legacy duplicated PMS timestamps. */
export function markKbttDeclarationDates(data: Record<string, unknown>, edits: Record<string, unknown>): Record<string, unknown> {
  const raw = data[DATE_OVERRIDES];
  const dates: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  if (DECLARATION_DATE_FIELDS.some((key) => Object.hasOwn(edits, key))) {
    delete dates.baseDeparture;
    delete dates.baseArrival;
  }
  for (const key of DECLARATION_DATE_FIELDS) if (Object.hasOwn(edits, key)) dates[key] = edits[key];
  return { ...data, [DATE_OVERRIDES]: dates };
}

export function compactKbttDeclarationDraft(kind: 'VIETNAMESE' | 'FOREIGN', data: Record<string, unknown>, occupant: KbttDraftOccupant): Record<string, unknown> {
  const compact = compactKbttDraft(kind, data, occupant);
  const defaults = composeKbttDraft(kind, {}, occupant);
  const dates = Object.fromEntries(DECLARATION_DATE_FIELDS.filter((key) => typeof data[key] === 'string' && isValidCalendarDateTime(data[key] as string) && data[key] !== defaults[key]).map((key) => [key, data[key]]));
  if (Object.keys(dates).length) compact[DATE_OVERRIDES] = { ...dates, baseArrival: defaults.ngayDenCsltStr ?? null, baseDeparture: defaults.ngayDiDuKienStr ?? null };
  return compact;
}

function formatVietnamDateTime(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return Number.isNaN(value.getTime()) ? '' : formatLocalDateTime(value, VIETNAM_TIME_ZONE);
}

const COMMON_COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "VIET NAM": "VNM",
  "HAN QUOC": "KOR",
  "CH HAN QUOC": "KOR",
  "CONG HOA HAN QUOC": "KOR",
  "KOREA": "KOR",
  "SOUTH KOREA": "KOR",
  "KOREAN": "KOR",
  "HOA KY": "USA",
  "MY": "USA",
  "UNITED STATES": "USA",
  "TRUNG QUOC": "CHN",
  "CHINA": "CHN",
  "NHAT BAN": "JPN",
  "JAPAN": "JPN",
  "DAI LOAN": "TWN",
  "TAIWAN": "TWN",
  "NGA": "RUS",
  "LIEN BANG NGA": "RUS",
  "RUSSIA": "RUS",
  "RUSSIAN FEDERATION": "RUS",
  "VUONG QUOC ANH": "GBR",
  "ANH": "GBR",
  "UNITED KINGDOM": "GBR",
  "PHAP": "FRA",
  "FRANCE": "FRA",
  "DUC": "DEU",
  "CHLB DUC": "DEU",
  "GERMANY": "DEU",
  "UC": "AUS",
  "AUSTRALIA": "AUS",
  "CANADA": "CAN",
  "SINGAPORE": "SGP",
  "THAI LAN": "THA",
  "THAILAND": "THA",
  "MALAYSIA": "MYS",
  "INDONESIA": "IDN",
  "PHILIPPINES": "PHL",
  "AN DO": "IND",
  "INDIA": "IND",
  "CAMPUCHIA": "KHM",
  "CAMBODIA": "KHM",
  "LAO": "LAO",
  "LAOS": "LAO",
  "MYANMAR": "MMR",
  "HONG KONG": "HKG",
  "TRIEU TIEN": "PRK",
  "CHDCND TRIEU TIEN": "PRK",
};

export function resolveKbttNationalityCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (/^[A-Z0-9_-]{2,32}$/.test(upper)) return upper;
  const normalized = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
  if (COMMON_COUNTRY_NAME_TO_CODE[normalized]) return COMMON_COUNTRY_NAME_TO_CODE[normalized];
  const stripped = normalized.replace(/^(CH|CHLB|CHDCND|CONG HOA|LIEN BANG|VUONG QUOC)\s+/g, "").trim();
  if (COMMON_COUNTRY_NAME_TO_CODE[stripped]) return COMMON_COUNTRY_NAME_TO_CODE[stripped];
  return null;
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
    const dates = data[DATE_OVERRIDES];
    if (dates && typeof dates === 'object' && !Array.isArray(dates)) {
      const context = dates as Record<string, unknown>;
      const unchanged = (!Object.hasOwn(context, 'baseArrival') || context.baseArrival === draft.ngayDenCsltStr) &&
        (!Object.hasOwn(context, 'baseDeparture') || context.baseDeparture === draft.ngayDiDuKienStr);
      for (const key of DECLARATION_DATE_FIELDS) {
        const value = (dates as Record<string, unknown>)[key];
        if (unchanged && typeof value === 'string' && isValidCalendarDateTime(value)) draft[key] = value;
      }
    }
    delete draft[DATE_OVERRIDES];
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
      draft.lyDoCuTru = 1;
    } else {
      if (!draft.soHoChieu && identityNumber && /^[A-Za-z0-9]{1,32}$/.test(identityNumber)) {
        draft.soHoChieu = identityNumber;
      }
      if (!draft.loaiNgayThangNamSinh && draft.ngayThangNamSinhStr) {
        draft.loaiNgayThangNamSinh = "D";
      }
      if (!draft.quocTich && occupant.nationality) {
        const resolved = resolveKbttNationalityCode(occupant.nationality);
        if (resolved) {
          draft.quocTich = resolved;
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
