"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { HttpError } from "@/core/http/http-error";
import {
  formatAlertErrorMessage,
  formatBatchResultHtml,
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  SwalVietSage,
} from "@/libs/swal";

import { KbttConnectionPage } from "./kbtt-connection-page";
import { kbttResource } from "../resources/kbtt-resource";
import { useKbttConnection } from "../hooks/use-kbtt-connection";
import {
  canSelectKbttDeclaration,
  formatKbttDraftForDisplay,
  formatKbttDraftForProvider,
  kbttErrorCode,
  sanitizeErrorMessage,
  sanitizeProviderDetail,
  type CitizenshipKind,
  type KbttCatalogItem,
  type KbttDeclarationListItem,
} from "../types/kbtt-contract";

const inputClass =
  "min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition-all focus:border-[#064e3b] focus:outline-none focus:ring-2 focus:ring-[#064e3b]/15 focus-visible:outline-none disabled:bg-slate-50 disabled:text-slate-400 placeholder:text-slate-400";

const selectClass =
  "min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition-all focus:border-[#064e3b] focus:outline-none focus:ring-2 focus:ring-[#064e3b]/15 focus-visible:outline-none disabled:bg-slate-50 disabled:text-slate-400";

function normalizeCatalogText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function uniqueCatalogMatch(
  items: readonly KbttCatalogItem[],
  rawValue: string | null | undefined,
): string | undefined {
  const value = normalizeCatalogText(rawValue);
  if (!value) return undefined;
  const exact = items.filter((item) =>
    [item.code, item.nameVi, item.nameEn].some(
      (candidate) => normalizeCatalogText(candidate) === value,
    ),
  );
  if (exact.length === 1) return exact[0].code;

  const padded = ` ${value} `;
  const contained = items.filter((item) => {
    const name = normalizeCatalogText(item.nameVi);
    return name.length >= 3 && padded.includes(` ${name} `);
  });
  const longest = Math.max(
    0,
    ...contained.map((item) => normalizeCatalogText(item.nameVi).length),
  );
  const best = contained.filter(
    (item) => normalizeCatalogText(item.nameVi).length === longest,
  );
  return best.length === 1 ? best[0].code : undefined;
}

function inferDocumentTypeCode(
  items: readonly KbttCatalogItem[],
  identityNumber: string | null | undefined,
): string | undefined {
  const identity = (identityNumber ?? "").trim();
  const marker = /^\d{12}$/.test(identity)
    ? /\bCCCD\b|CAN CUOC/
    : /^\d{9}$/.test(identity)
      ? /\bCMND\b|CHUNG MINH/
      : null;
  if (!marker) return undefined;
  const matches = items.filter((item) =>
    marker.test(normalizeCatalogText(item.nameVi)),
  );
  const cccdExact = matches.filter((item) =>
    /\bCCCD\b/.test(normalizeCatalogText(item.nameVi)),
  );
  if (/^\d{12}$/.test(identity) && cccdExact.length === 1)
    return cccdExact[0].code;
  return matches.length === 1 ? matches[0].code : undefined;
}

function errorText(error: unknown): string {
  // 1. If error has .data (HttpError or duck-typed API error payload)
  if (error && typeof error === "object" && "data" in error) {
    const errorData = (error as { data?: unknown }).data;
    const providerDetail = sanitizeProviderDetail(errorData);
    if (providerDetail) return providerDetail;

    if (typeof errorData === "string" && errorData.trim()) {
      return errorData.trim();
    }

    if (errorData && typeof errorData === "object") {
      const dataObj = errorData as Record<string, unknown>;
      if (typeof dataObj.message === "string" && dataObj.message.trim()) {
        return sanitizeErrorMessage(dataObj.message);
      }
      if (Array.isArray(dataObj.message) && dataObj.message.length > 0) {
        return dataObj.message.map(String).join("; ");
      }
      if (typeof dataObj.error === "string" && dataObj.error.trim()) {
        return sanitizeErrorMessage(dataObj.error);
      }
      if (typeof dataObj.detail === "string" && dataObj.detail.trim()) {
        return dataObj.detail.trim();
      }
    }

    const code = kbttErrorCode(errorData);
    if (code) return sanitizeErrorMessage(code);
  }

  // 2. If error has .message (HttpError or standard Error)
  if (error && typeof error === "object" && "message" in error) {
    const rawMsg = (error as { message?: unknown }).message;
    if (typeof rawMsg === "string" && rawMsg.trim()) {
      return sanitizeErrorMessage(rawMsg);
    }
  }

  // 3. Status code human-readable descriptions
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 400)
      return "Dữ liệu khai báo không hợp lệ. Vui lòng kiểm tra lại các trường thông tin bắt buộc.";
    if (status === 401)
      return "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.";
    if (status === 403)
      return "Bạn không có quyền thực hiện thao tác này.";
    if (status === 404)
      return "Không tìm thấy hồ sơ khách lưu trú.";
    if (status === 408 || status === 504)
      return "Hệ thống phản hồi quá lâu. Vui lòng thử lại sau giây lát.";
    if (status === 409)
      return "Hồ sơ của khách lưu trú đã được gửi hoặc thông tin bị xung đột.";
    if (status === 422)
      return "Bộ Công an từ chối hồ sơ khai báo. Vui lòng kiểm tra lại thông tin khách lưu trú.";
    if (status === 502 || status === 503)
      return "Không thể kết nối đến hệ thống Bộ Công an hoặc máy chủ. Vui lòng thử lại sau.";
  }

  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message);
  }

  return sanitizeErrorMessage(null);
}

const COMMON_NATIONALITIES: Record<string, string> = {
  VNM: "Việt Nam",
  KOR: "Hàn Quốc",
  CHN: "Trung Quốc",
  JPN: "Nhật Bản",
  USA: "Hoa Kỳ",
  GBR: "Anh",
  FRA: "Pháp",
  DEU: "Đức",
  RUS: "Nga",
  AUS: "Úc",
  THA: "Thái Lan",
  SGP: "Singapore",
  MYS: "Malaysia",
  IDN: "Indonesia",
  IND: "Ấn Độ",
  TWN: "Đài Loan",
};

const DEFAULT_DOCUMENT_TYPES: readonly { code: string; nameVi: string }[] = [
  { code: "1", nameVi: "Thẻ CCCD" },
  { code: "2", nameVi: "Thẻ CMND" },
  { code: "8", nameVi: "Thẻ Căn Cước" },
  { code: "4", nameVi: "Hộ chiếu" },
  { code: "3", nameVi: "Giấy phép lái xe" },
  { code: "5", nameVi: "Giấy khai sinh" },
  { code: "6", nameVi: "Thẻ BHYT" },
  { code: "7", nameVi: "Thông báo số định danh cá nhân" },
];

const DEFAULT_NATIONALITIES: readonly { code: string; nameVi: string }[] = [
  { code: "VNM", nameVi: "Việt Nam" },
  { code: "KOR", nameVi: "Hàn Quốc" },
  { code: "CHN", nameVi: "Trung Quốc" },
  { code: "TWN", nameVi: "Trung Quốc (Đài Loan)" },
  { code: "JPN", nameVi: "Nhật Bản" },
  { code: "USA", nameVi: "Hoa Kỳ" },
  { code: "GBR", nameVi: "Vương quốc Anh" },
  { code: "FRA", nameVi: "Pháp" },
  { code: "DEU", nameVi: "Đức" },
  { code: "RUS", nameVi: "Nga" },
  { code: "AUS", nameVi: "Úc" },
  { code: "THA", nameVi: "Thái Lan" },
  { code: "SGP", nameVi: "Singapore" },
  { code: "MYS", nameVi: "Malaysia" },
  { code: "IDN", nameVi: "Indonesia" },
  { code: "IND", nameVi: "Ấn Độ" },
  { code: "PHL", nameVi: "Philippines" },
  { code: "KHM", nameVi: "Campuchia" },
  { code: "LAO", nameVi: "Lào" },
  { code: "MMR", nameVi: "Myanmar" },
  { code: "CAN", nameVi: "Canada" },
  { code: "ITA", nameVi: "Ý" },
  { code: "ESP", nameVi: "Tây Ban Nha" },
];

const AUTO_SUBMIT_DELAY_SECONDS =
  Number(process.env.NEXT_PUBLIC_KBTT_AUTO_SUBMIT_DELAY_SECONDS) > 0
    ? Number(process.env.NEXT_PUBLIC_KBTT_AUTO_SUBMIT_DELAY_SECONDS)
    : 1800;

const IS_AUTO_SUBMIT_ENABLED =
  process.env.NEXT_PUBLIC_KBTT_AUTO_SUBMIT_ENABLED !== "false";

function formatStayDateTimeForForm(
  dateStr: string | null | undefined,
): string | undefined {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.hour}:${values.minute}:${values.second} ${values.day}/${values.month}/${values.year}`;
}

function formatNationality(row: KbttDeclarationListItem): string {
  if (row.citizenshipKind === "VIETNAMESE" || row.nationality === "VNM") {
    return "VNM (Việt Nam)";
  }
  const nat = (row.nationality ?? "").toUpperCase().trim();
  if (COMMON_NATIONALITIES[nat]) {
    return `${nat} (${COMMON_NATIONALITIES[nat]})`;
  }
  if (nat) {
    return nat;
  }
  if (row.citizenshipKind === "FOREIGN") {
    return "Nước ngoài";
  }
  return "Chưa xác định";
}

function getDeclarationStatus(row: KbttDeclarationListItem): {
  key: "UNSENT" | "SUBMITTED" | "REJECTED";
  label: string;
  dotColor: string;
  badgeClass: string;
} {
  const dec = row.declaration;
  if (dec) {
    if (
      dec.status === "FAILED" ||
      dec.status === "REJECTED" ||
      (dec.providerMessage && dec.status !== "SUBMITTED")
    ) {
      return {
        key: "REJECTED",
        label: "Bị từ chối",
        dotColor: "bg-rose-500",
        badgeClass: "border-rose-200 bg-rose-50 text-rose-800",
      };
    }
    if (dec.status === "SUBMITTED") {
      return {
        key: "SUBMITTED",
        label: "Đã gửi BCA",
        dotColor: "bg-emerald-500",
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    }
  }
  if (row.derivedStatus === "SUBMITTED") {
    return {
      key: "SUBMITTED",
      label: "Đã gửi BCA",
      dotColor: "bg-emerald-500",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  return {
    key: "UNSENT",
    label: "Chưa gửi",
    dotColor: "bg-amber-500",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  };
}

function SearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  );
}

function RefreshIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function CloudUploadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
      />
    </svg>
  );
}

function ChevronDownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m19.5 8.25-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

function AlertCircleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

function WrenchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.05a4.5 4.5 0 0 0 4.486-6.32l-3.27 3.27-2.652-2.652 3.27-3.27a4.5 4.5 0 0 0-6.32 4.486c.138.58.114 1.193-.05 1.743"
      />
    </svg>
  );
}

function SparklesIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
      />
    </svg>
  );
}

function ClockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function RowActionMenu({
  statusInfo,
  onView,
  onSave,
  onSubmit,
  onViewError,
  dirty,
  disabled,
  isDevMode,
  onDevResetSingle,
}: {
  statusInfo: { key: string; label: string };
  onView: () => void;
  onSave: () => void;
  onSubmit: () => void;
  onViewError: () => void;
  dirty: boolean;
  disabled?: boolean;
  isDevMode?: boolean;
  onDevResetSingle?: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
      {dirty ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onSave}
          title="Lưu thay đổi"
          className="inline-flex min-h-9 items-center rounded-lg border border-emerald-600 bg-white px-2.5 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
        >
          Lưu
        </button>
      ) : null}

      {/* Sửa chi tiết hoặc Xem hồ sơ */}
      {statusInfo.key === "SUBMITTED" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onView}
          title="Xem hồ sơ đã gửi"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold text-slate-700 shadow-2xs hover:border-[#064e3b] hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 transition-colors"
        >
          <span>Xem</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onView}
          title="Mở box chỉnh chi tiết hồ sơ (Tỉnh, Phường/Xã, địa chỉ...)"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold text-slate-700 shadow-2xs hover:border-[#064e3b] hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 transition-colors"
        >
          <PencilIcon className="h-3.5 w-3.5 text-slate-500" />
          <span>Sửa</span>
        </button>
      )}

      {/* Gửi BCA ngay (chưa gửi hoặc bị từ chối) */}
      {statusInfo.key !== "SUBMITTED" && (
        <button
          type="button"
          disabled={disabled}
          onClick={onSubmit}
          title="Gửi hồ sơ khách này lên BCA ngay"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#064e3b] px-2.5 py-1 text-sm font-semibold text-white shadow-2xs hover:bg-[#043327] disabled:opacity-40 transition-colors"
        >
          <CloudUploadIcon className="h-3.5 w-3.5 text-emerald-200" />
          <span>Gửi BCA</span>
        </button>
      )}

      {/* Xem lý do từ chối (nếu bị từ chối) */}
      {statusInfo.key === "REJECTED" && (
        <button
          type="button"
          disabled={disabled}
          onClick={onViewError}
          title="Xem lý do BCA từ chối"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-sm font-semibold text-rose-700 shadow-2xs hover:bg-rose-100 disabled:opacity-40 transition-colors"
        >
          <AlertCircleIcon className="h-3.5 w-3.5 text-rose-500" />
          <span>Lý do</span>
        </button>
      )}
    </div>
  );
}

function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | string)[] {
  if (totalPages <= 1) {
    return [1];
  }
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [
      1,
      "...",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [
    1,
    "...",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "...",
    totalPages,
  ];
}

export function KbttDeclarationsPage({
  hotelId,
  canManage,
  canConfigure = false,
  initialTab = "declarations",
}: {
  hotelId: string;
  canManage: boolean;
  canConfigure?: boolean;
  initialTab?: "declarations" | "connection";
}) {
  const queryClient = useQueryClient();
  const { connection: connectionQuery } = useKbttConnection(hotelId);
  const connectionData = connectionQuery.data;
  const isConnected = connectionData?.status === "CONNECTED";

  const [activeTab, setActiveTab] = useState<"declarations" | "connection">(
    initialTab,
  );
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(20);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("vietsage_kbtt_page_size");
      if (saved) {
        const parsed = Number(saved);
        if ([10, 20, 50, 100].includes(parsed)) {
          setLimit(parsed);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handlePageSizeChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
    try {
      localStorage.setItem("vietsage_kbtt_page_size", String(newLimit));
    } catch {}
  }, []);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [nationalityFilter, setNationalityFilter] = useState<string>("ALL");
  const [checkInDateFilter, setCheckInDateFilter] = useState<string>("");

  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  // Modal edit state
  const [selectedOccupant, setSelectedOccupant] =
    useState<KbttDeclarationListItem | null>(null);

  const boundResource = useMemo(
    () => kbttResource.bind({ hotelId }),
    [hotelId],
  );

  const declarationsQuery = useQuery(
    useMemo(
      () => boundResource.queries.declarations.options({ page, limit }),
      [boundResource, page, limit],
    ),
  );

  const saveMutation = useMutation(boundResource.mutations.saveDraft.options());
  const submitMutation = useMutation(boundResource.mutations.submit.options());
  const sendBatchSummaryMutation = useMutation(
    boundResource.mutations.sendBatchSummary.options(),
  );
  const devResetMutation = useMutation(
    boundResource.mutations.devResetDeclarations.options(),
  );
  const devUpdateOccupantsMutation = useMutation(
    boundResource.mutations.devUpdateOccupants.options(),
  );

  const [isDevModalOpen, setIsDevModalOpen] = useState(false);
  const [isDevMode, setIsDevMode] = useState(() => {
    if (typeof window === "undefined") return false;
    if (process.env.NODE_ENV === "production") return false;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get("dev") === "true";
    } catch {
      return false;
    }
  });
  const [devModalEdits, setDevModalEdits] = useState<Record<string, string>>({});
  const [isDevLoading, setIsDevLoading] = useState(false);

  const nationalitiesQuery = useQuery(
    boundResource.queries.catalog.options({ kind: "NATIONALITY" }),
  );
  const documentTypesQuery = useQuery(
    boundResource.queries.catalog.options({ kind: "DOCUMENT_TYPE" }),
  );
  const nationalities = useMemo(() => {
    if (nationalitiesQuery.data && nationalitiesQuery.data.length > 0) {
      return nationalitiesQuery.data;
    }
    return DEFAULT_NATIONALITIES;
  }, [nationalitiesQuery.data]);

  const documentTypes = useMemo(() => {
    if (documentTypesQuery.data && documentTypesQuery.data.length > 0) {
      return documentTypesQuery.data;
    }
    return DEFAULT_DOCUMENT_TYPES;
  }, [documentTypesQuery.data]);
  const [inlineEdits, setInlineEdits] = useState<
    Record<
      string,
      {
        fullName?: string;
        identityNumber?: string;
        nationality?: string;
        gender?: string;
        dateOfBirth?: string;
        documentType?: string;
      }
    >
  >({});

  const allRows = useMemo(
    () => declarationsQuery.data ?? [],
    [declarationsQuery.data],
  );

  const totalPages = useMemo(() => {
    const data = declarationsQuery.data as any;
    if (data && typeof data.totalPages === "number" && data.totalPages > 0) {
      return data.totalPages;
    }
    return allRows.length < limit ? Math.max(1, page) : page + 1;
  }, [declarationsQuery.data, allRows.length, limit, page]);

  const totalOccupants = useMemo(() => {
    const data = declarationsQuery.data as any;
    if (data && typeof data.total === "number" && data.total > 0) {
      return data.total;
    }
    return allRows.length;
  }, [declarationsQuery.data, allRows.length]);

  const pageNumbers = useMemo(
    () => getPageNumbers(page, totalPages),
    [page, totalPages],
  );

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      // 1. Search query
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const haystack =
          `${row.roomNumber ?? ""} ${row.fullName} ${row.identityNumber ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // 2. Status filter
      if (statusFilter !== "ALL") {
        const status = getDeclarationStatus(row);
        if (status.key !== statusFilter) return false;
      }

      // 3. Nationality filter
      if (nationalityFilter === "VNM") {
        if (row.citizenshipKind !== "VIETNAMESE" && row.nationality !== "VNM")
          return false;
      } else if (nationalityFilter === "FOREIGN") {
        if (
          row.citizenshipKind !== "FOREIGN" &&
          (row.citizenshipKind === "VIETNAMESE" || row.nationality === "VNM")
        )
          return false;
      }

      // 4. Check-in date filter
      if (checkInDateFilter) {
        const rowDate = row.checkedInAt || row.plannedCheckInAt;
        if (!rowDate || !rowDate.startsWith(checkInDateFilter)) return false;
      }

      return true;
    });
  }, [
    allRows,
    searchQuery,
    statusFilter,
    nationalityFilter,
    checkInDateFilter,
  ]);

  const selectableRows = useMemo(
    () => filteredRows.filter(canSelectKbttDeclaration),
    [filteredRows],
  );
  const unsubmittedCount = selectableRows.length;

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: boundResource.key });
    void connectionQuery.refetch();
  }, [boundResource, connectionQuery, queryClient]);

  const handleSwitchTab = useCallback((tab: "declarations" | "connection") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "connection") {
        url.searchParams.set("tab", "connection");
      } else {
        url.searchParams.delete("tab");
      }
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const updateInlineField = useCallback(
    (
      occupantId: string,
      key:
        | "fullName"
        | "identityNumber"
        | "nationality"
        | "gender"
        | "dateOfBirth"
        | "documentType",
      value: string,
    ) => {
      setInlineEdits((current) => ({
        ...current,
        [occupantId]: { ...current[occupantId], [key]: value },
      }));
    },
    [],
  );

  const saveInlineRow = useCallback(
    async (row: KbttDeclarationListItem) => {
      const edits = inlineEdits[row.occupantId];
      if (!edits) return;
      const identityNumber = (
        edits.identityNumber ??
        row.identityNumber ??
        ""
      ).trim();
      const nationality = (
        edits.nationality ??
        row.nationality ??
        (row.citizenshipKind === "VIETNAMESE" || /^\d{9,12}$/.test(identityNumber)
          ? "VNM"
          : "")
      ).trim();
      if (!nationality) throw new Error("Quốc tịch là bắt buộc.");
      const citizenshipKind: CitizenshipKind =
        nationality === "VNM" ? "VIETNAMESE" : "FOREIGN";
      const inferredDocumentType = /^\d{12}$/.test(identityNumber)
        ? 1
        : /^\d{9}$/.test(identityNumber)
          ? 2
          : /^(?=.*[A-Za-z])[A-Za-z0-9]{1,10}$/.test(identityNumber)
            ? 4
            : 0;
      const data: Record<string, unknown> = {
        hoTen: (edits.fullName ?? row.fullName).trim(),
        gioiTinh: (edits.gender ?? row.gender ?? "").trim(),
        ngayThangNamSinhStr: (
          edits.dateOfBirth ??
          row.dateOfBirth ??
          ""
        ).trim(),
        ...(citizenshipKind === "VIETNAMESE"
          ? {
              soGiayTo: identityNumber,
              loaiGiayTo: Number(
                edits.documentType ?? row.documentType ?? inferredDocumentType,
              ),
            }
          : {
              soHoChieu: identityNumber,
              quocTich: nationality,
              loaiNgayThangNamSinh: "D",
            }),
      };
      await saveMutation.mutateAsync({
        occupantId: row.occupantId,
        body: { citizenshipKind, data, allowSubmittedEdit: true },
      });
      setInlineEdits((current) => {
        const next = { ...current };
        delete next[row.occupantId];
        return next;
      });
    },
    [inlineEdits, saveMutation],
  );

  const handleSaveInlineRow = useCallback(
    async (row: KbttDeclarationListItem) => {
      try {
        await saveInlineRow(row);
        handleRefresh();
      } catch (error) {
        await showErrorAlert("Không thể lưu hồ sơ", errorText(error));
      }
    },
    [handleRefresh, saveInlineRow],
  );

  const handleDevResetAll = useCallback(
    async (generateNewIdentityNumbers = false) => {
      const confirm = await showConfirmDialog({
        title: generateNewIdentityNumbers
          ? "Sinh mới Số giấy tờ & Reset chưa gửi"
          : "Đổi trạng thái về Chưa gửi",
        text: generateNewIdentityNumbers
          ? "Bạn có chắc muốn tự động sinh số CCCD / Hộ chiếu mới ngẫu nhiên hợp lệ cho tất cả khách và đổi trạng thái toàn bộ về Chưa gửi (DRAFT) trong DB không?"
          : "Bạn có chắc muốn chuyển toàn bộ hồ sơ đã gửi về trạng thái Chưa gửi (DRAFT) để test đẩy lại BCA không?",
        confirmText: generateNewIdentityNumbers
          ? "Sinh mới & Reset"
          : "Đổi về Chưa gửi",
        cancelText: "Hủy",
      });
      if (!confirm.isConfirmed) return;

      try {
        setIsDevLoading(true);
        const res = await devResetMutation.mutateAsync({
          generateNewIdentityNumbers,
        });
        setInlineEdits({});
        setDevModalEdits({});
        handleRefresh();
        await showSuccessAlert(
          "Thành công",
          res.message || "Đã cập nhật trạng thái trong cơ sở dữ liệu.",
        );
      } catch (err) {
        await showErrorAlert("Lỗi thao tác", errorText(err));
      } finally {
        setIsDevLoading(false);
      }
    },
    [devResetMutation, handleRefresh],
  );

  const handleDevResetSingle = useCallback(
    async (row: KbttDeclarationListItem) => {
      const confirm = await showConfirmDialog({
        title: "Đặt lại hồ sơ khách về Chưa gửi",
        text: `Đổi trạng thái hồ sơ của khách ${row.fullName} (Phòng ${row.roomNumber ?? "—"}) về Chưa gửi để gửi lại?`,
        confirmText: "Đặt lại về Chưa gửi",
        cancelText: "Hủy",
      });
      if (!confirm.isConfirmed) return;

      try {
        setIsDevLoading(true);
        await devUpdateOccupantsMutation.mutateAsync({
          occupants: [{ occupantId: row.occupantId, resetToDraft: true }],
        });
        handleRefresh();
        await showSuccessAlert(
          "Thành công",
          `Đã chuyển hồ sơ khách ${row.fullName} về Chưa gửi.`,
        );
      } catch (err) {
        await showErrorAlert("Lỗi thao tác", errorText(err));
      } finally {
        setIsDevLoading(false);
      }
    },
    [devUpdateOccupantsMutation, handleRefresh],
  );

  const handleSaveDevModalRow = useCallback(
    async (row: KbttDeclarationListItem, customIdentity?: string) => {
      const newIdentity = (
        customIdentity ??
        devModalEdits[row.occupantId] ??
        row.identityNumber ??
        ""
      ).trim();
      if (!newIdentity) {
        await showErrorAlert("Lỗi", "Số giấy tờ không được để trống.");
        return;
      }

      try {
        setIsDevLoading(true);
        await devUpdateOccupantsMutation.mutateAsync({
          occupants: [
            {
              occupantId: row.occupantId,
              identityNumber: newIdentity,
              resetToDraft: true,
            },
          ],
        });
        setDevModalEdits((prev) => {
          const next = { ...prev };
          delete next[row.occupantId];
          return next;
        });
        handleRefresh();
        await showSuccessAlert(
          "Đã lưu thông tin",
          `Đã cập nhật Số giấy tờ "${newIdentity}" cho khách ${row.fullName} và đổi trạng thái về Chưa gửi.`,
        );
      } catch (err) {
        await showErrorAlert("Lỗi thao tác", errorText(err));
      } finally {
        setIsDevLoading(false);
      }
    },
    [devModalEdits, devUpdateOccupantsMutation, handleRefresh],
  );

  const handleSaveAllDevModalRows = useCallback(async () => {
    const entries = Object.entries(devModalEdits);
    if (entries.length === 0) {
      await showSuccessAlert("Thông báo", "Chưa có thay đổi nào cần lưu.");
      return;
    }

    try {
      setIsDevLoading(true);
      const occupantsToUpdate = entries.map(([occupantId, identityNumber]) => ({
        occupantId,
        identityNumber: identityNumber.trim(),
        resetToDraft: true,
      }));
      const res = await devUpdateOccupantsMutation.mutateAsync({
        occupants: occupantsToUpdate,
      });
      setDevModalEdits({});
      handleRefresh();
      await showSuccessAlert(
        "Đã lưu thông tin",
        res.message || "Đã cập nhật Số giấy tờ cho các khách được chọn.",
      );
    } catch (err) {
      await showErrorAlert("Lỗi thao tác", errorText(err));
    } finally {
      setIsDevLoading(false);
    }
  }, [devModalEdits, devUpdateOccupantsMutation, handleRefresh]);

  const handleSubmitAll = useCallback(async () => {
    if (!isConnected) {
      await SwalVietSage.fire({
        title: "Chưa đăng nhập Cổng BCA",
        text: "Khách sạn chưa đăng nhập hoặc chưa kết nối thành công với Cổng dịch vụ công Bộ Công An. Vui lòng kết nối tài khoản trước khi gửi hồ sơ.",
        icon: "warning",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    const unsubmittedRows = selectableRows;

    if (unsubmittedRows.length === 0) {
      await showSuccessAlert("Thông báo", "Tất cả khách đều đã được gửi BCA.");
      return;
    }

    const confirmResult = await showConfirmDialog({
      title: "Upload tất cả lên BCA",
      text: `Bạn có chắc muốn gửi khai báo tạm trú cho toàn bộ ${unsubmittedRows.length} khách chưa gửi lên Cổng dịch vụ công Bộ Công an không?`,
      confirmText: "Gửi toàn bộ",
      cancelText: "Hủy",
    });
    if (!confirmResult.isConfirmed) return;

    setIsSubmittingBatch(true);
    let successCount = 0;
    const errorItems: Array<{ room?: string; name?: string; message: string }> = [];
    const errors: string[] = [];

    const settledResults = await Promise.allSettled(
      unsubmittedRows.map(async (row) => {
        await saveInlineRow(row);
        await submitMutation.mutateAsync({ occupantId: row.occupantId });
        return row;
      }),
    );

    for (let i = 0; i < settledResults.length; i++) {
      const res = settledResults[i];
      const row = unsubmittedRows[i];
      if (res.status === "fulfilled") {
        successCount++;
      } else {
        const msg = errorText(res.reason);
        errorItems.push({
          room: row.roomNumber ?? "—",
          name: row.fullName,
          message: msg,
        });
        errors.push(`Phòng ${row.roomNumber ?? "—"} (${row.fullName}): ${msg}`);
      }
    }

    const totalBatchCount = unsubmittedRows.length;
    const failedBatchCount = errorItems.length;
    if (totalBatchCount > 0) {
      try {
        await sendBatchSummaryMutation.mutateAsync({
          totalEligible: totalBatchCount,
          successCount,
          failureCount: failedBatchCount,
          unknownCount: 0,
          isDryRun: false,
        });
      } catch {
        // non-blocking
      }
    }

    setIsSubmittingBatch(false);
    handleRefresh();

    if (errors.length === 0) {
      await showSuccessAlert(
        "Gửi BCA thành công",
        `Đã gửi thành công khai báo tạm trú cho toàn bộ ${successCount} khách lên Bộ Công an.`,
      );
    } else {
      await showErrorAlert(
        "Kết quả gửi BCA",
        formatBatchResultHtml({
          total: unsubmittedRows.length,
          success: successCount,
          failed: errorItems.length,
          errors: errorItems,
          itemTypeLabel: "khách",
          guidance:
            "Vui lòng kiểm tra lại thông tin hồ sơ của các phòng bị lỗi hoặc chỉnh sửa thông tin chi tiết trước khi gửi lại.",
        }),
      );
    }
  }, [
    isConnected,
    selectableRows,
    saveInlineRow,
    submitMutation,
    sendBatchSummaryMutation,
    handleRefresh,
  ]);

  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  const executeAutoSubmitNow = useCallback(async () => {
    if (!isConnected) return;
    const unsubmittedRows = selectableRows;
    if (unsubmittedRows.length === 0) return;

    setIsSubmittingBatch(true);
    let successCount = 0;
    const errorItems: Array<{ room?: string; name?: string; message: string }> = [];

    const settledResults = await Promise.allSettled(
      unsubmittedRows.map(async (row) => {
        await saveInlineRow(row);
        await submitMutation.mutateAsync({ occupantId: row.occupantId });
        return row;
      }),
    );

    for (let i = 0; i < settledResults.length; i++) {
      const res = settledResults[i];
      const row = unsubmittedRows[i];
      if (res.status === "fulfilled") {
        successCount++;
      } else {
        const msg = errorText(res.reason);
        errorItems.push({
          room: row.roomNumber ?? "—",
          name: row.fullName,
          message: msg,
        });
      }
    }

    const totalBatchCount = unsubmittedRows.length;
    const failedBatchCount = errorItems.length;
    if (totalBatchCount > 0) {
      try {
        await sendBatchSummaryMutation.mutateAsync({
          totalEligible: totalBatchCount,
          successCount,
          failureCount: failedBatchCount,
          unknownCount: 0,
          isDryRun: false,
        });
      } catch {
        // non-blocking
      }
    }

    setIsSubmittingBatch(false);
    handleRefresh();

    if (errorItems.length === 0) {
      await showSuccessAlert(
        "Tự động gửi BCA thành công",
        `Hệ thống VietSage đã tự động đẩy thành công ${successCount} hồ sơ khách lên Cổng DVC Bộ Công An.`,
      );
    } else {
      setCountdownSeconds(AUTO_SUBMIT_DELAY_SECONDS);
      await showErrorAlert(
        "Kết quả tự động gửi BCA",
        formatBatchResultHtml({
          total: unsubmittedRows.length,
          success: successCount,
          failed: errorItems.length,
          errors: errorItems,
          itemTypeLabel: "khách",
          guidance:
            "Vui lòng kiểm tra lại thông tin của các phòng bị từ chối trước khi hệ thống thực hiện lượt quét tự động tiếp theo.",
        }),
      );
    }
  }, [selectableRows, saveInlineRow, submitMutation, sendBatchSummaryMutation, handleRefresh]);

  // Synchronize countdown with unsubmittedCount and connection status:
  // - If !isConnected: STOP countdown immediately (set to null), do not auto-push
  // - If unsubmittedCount === 0: STOP countdown immediately (set to null)
  // - If isConnected && unsubmittedCount > 0 and countdown is null (and not currently submitting): initialize countdown
  useEffect(() => {
    if (!IS_AUTO_SUBMIT_ENABLED || !isConnected) {
      setCountdownSeconds(null);
      return;
    }
    if (unsubmittedCount === 0) {
      setCountdownSeconds(null);
    } else if (countdownSeconds === null && !isSubmittingBatch) {
      setCountdownSeconds(AUTO_SUBMIT_DELAY_SECONDS);
    }
  }, [isConnected, unsubmittedCount, isSubmittingBatch, countdownSeconds]);

  // Timer interval: ticks down each second when active
  useEffect(() => {
    if (
      !IS_AUTO_SUBMIT_ENABLED ||
      !isConnected ||
      isAutoPaused ||
      isSubmittingBatch ||
      unsubmittedCount === 0 ||
      countdownSeconds === null
    ) {
      return;
    }

    if (countdownSeconds <= 0) {
      setCountdownSeconds(null);
      void executeAutoSubmitNow();
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdownSeconds((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [
    isConnected,
    countdownSeconds,
    isAutoPaused,
    isSubmittingBatch,
    unsubmittedCount,
    executeAutoSubmitNow,
  ]);

  const handleSubmitSingle = useCallback(
    async (row: KbttDeclarationListItem) => {
      if (!canSelectKbttDeclaration(row)) return;
      if (!isConnected) {
        await SwalVietSage.fire({
          title: "Chưa đăng nhập Cổng BCA",
          text: "Khách sạn chưa đăng nhập hoặc chưa kết nối thành công với Cổng dịch vụ công Bộ Công An. Vui lòng kết nối tài khoản trước khi gửi hồ sơ.",
          icon: "warning",
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
        return;
      }
      const confirmResult = await showConfirmDialog({
        title: "Gửi khai báo BCA",
        text: `Gửi khai báo tạm trú cho khách ${row.fullName} (Phòng ${row.roomNumber ?? "—"}) lên Cổng dịch vụ công Bộ Công an?`,
        confirmText: "Gửi ngay",
        cancelText: "Hủy",
      });
      if (!confirmResult.isConfirmed) return;

      try {
        await saveInlineRow(row);
        await submitMutation.mutateAsync({ occupantId: row.occupantId });
        handleRefresh();
        await showSuccessAlert(
          "Gửi BCA thành công",
          `Đã gửi khai báo cho khách ${row.fullName}.`,
        );
      } catch (err) {
        await showErrorAlert("Lỗi gửi BCA", errorText(err));
      }
    },
    [isConnected, saveInlineRow, submitMutation, handleRefresh],
  );

  const handleViewError = useCallback(async (row: KbttDeclarationListItem) => {
    const rawMessage =
      row.declaration?.providerMessage ||
      "Chưa có thông tin chi tiết về phản hồi từ Cổng dịch vụ công Bộ Công an.";
    const codePrefix =
      row.declaration?.providerCode &&
      !rawMessage.includes(row.declaration.providerCode)
        ? `[${row.declaration.providerCode}] `
        : "";
    const message = `${codePrefix}${rawMessage}`;
    await showErrorAlert(
      `Lý do từ chối - Phòng ${row.roomNumber ?? "—"}`,
      message,
    );
  }, []);

  if (activeTab === "connection" && canConfigure) {
    return (
      <div className="w-full space-y-6 pb-16 pt-1 text-slate-900">
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => handleSwitchTab("declarations")}
            className="inline-flex items-center gap-2 border-b-2 border-transparent px-5 py-3 text-base font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
          >
            Hồ sơ khai báo
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab("connection")}
            className="inline-flex items-center gap-2 border-b-2 border-[#064e3b] px-5 py-3 text-base font-semibold text-[#064e3b] transition-colors"
          >
            Cấu hình kết nối BCA
          </button>
        </div>
        <KbttConnectionPage hotelId={hotelId} canManage={canManage} />
      </div>
    );
  }

  return (
    <div
      className="w-full space-y-6 pb-16 pt-1 text-slate-900"
      aria-labelledby="declarations-title"
    >
      {canConfigure && (
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => handleSwitchTab("declarations")}
            className="inline-flex items-center gap-2 border-b-2 border-[#064e3b] px-5 py-3 text-base font-semibold text-[#064e3b] transition-colors"
          >
            Hồ sơ khai báo
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab("connection")}
            className="inline-flex items-center gap-2 border-b-2 border-transparent px-5 py-3 text-base font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
          >
            Cấu hình kết nối BCA
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
            KHÁCH ĐANG CHECK-IN
          </p>
          <h1
            id="declarations-title"
            className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          >
            Chỉnh sửa & gửi BCA theo danh sách
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Chỉnh sửa thông tin nhiều khách cùng lúc và gửi BCA hàng loạt. Mỗi
            dòng là một khách đang lưu trú.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canConfigure && (
            <button
              type="button"
              onClick={() => handleSwitchTab("connection")}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-base font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
            >
              Cấu hình kết nối BCA
            </button>
          )}
        </div>
      </header>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[260px]">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Tìm theo số phòng, tên khách hoặc giấy tờ..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 py-2.5 text-base text-slate-900 outline-none transition-all focus:border-[#064e3b] focus:ring-2 focus:ring-[#064e3b]/15"
          />
        </div>

        {/* Status Dropdown */}
        <div className="w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base text-slate-700 outline-none transition-all focus:border-[#064e3b] focus:ring-2 focus:ring-[#064e3b]/15"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="UNSENT">Chưa gửi</option>
            <option value="SUBMITTED">Đã gửi BCA</option>
            <option value="REJECTED">Bị từ chối</option>
          </select>
        </div>

        {/* Nationality Dropdown */}
        <div className="w-full sm:w-auto">
          <select
            value={nationalityFilter}
            onChange={(e) => setNationalityFilter(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base text-slate-700 outline-none transition-all focus:border-[#064e3b] focus:ring-2 focus:ring-[#064e3b]/15"
          >
            <option value="ALL">Tất cả quốc tịch</option>
            <option value="VNM">Việt Nam</option>
            <option value="FOREIGN">Nước ngoài</option>
          </select>
        </div>

        {/* Check-in Date Filter */}
        <div className="w-full sm:w-auto">
          <input
            type="date"
            value={checkInDateFilter}
            onChange={(e) => setCheckInDateFilter(e.target.value)}
            title="Lọc theo ngày check-in"
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base text-slate-700 outline-none transition-all focus:border-[#064e3b] focus:ring-2 focus:ring-[#064e3b]/15"
          />
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={declarationsQuery.isFetching}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-base font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          <RefreshIcon
            className={`h-4 w-4 ${declarationsQuery.isFetching ? "animate-spin" : ""}`}
          />
          Làm mới
        </button>
      </div>

      {/* Khối Tự động gửi BCA (Production Auto-Submit Engine) */}
      {connectionQuery.isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 text-sm text-slate-600 shadow-2xs animate-pulse">
          Đang kiểm tra trạng thái kết nối Cổng DVC Bộ Công An...
        </div>
      ) : !isConnected ? (
        <div className="rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50/90 via-orange-50/40 to-slate-50/80 p-4 sm:p-5 shadow-xs transition-all space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-900 shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
                </span>
                Chưa đăng nhập Cổng BCA
              </span>

              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">
                  Tự động gửi BCA đang tắt
                </span>
                <span className="text-xs text-slate-600 font-medium hidden md:inline">
                  · Đang có <strong>{unsubmittedCount}</strong> hồ sơ chưa gửi
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canConfigure ? (
                <button
                  type="button"
                  onClick={() => handleSwitchTab("connection")}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-800 px-4 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-amber-900 transition-colors"
                >
                  <WrenchIcon className="h-4 w-4 text-amber-200" />
                  <span>Đăng nhập / Cấu hình kết nối BCA</span>
                </button>
              ) : (
                <span className="text-xs font-medium text-amber-800 italic">
                  Vui lòng liên hệ Quản lý / Chủ khách sạn kết nối tài khoản BCA
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 pt-1 border-t border-amber-200/60">
            <p>
              Khách sạn chưa đăng nhập hoặc chưa kết nối thành công với Cổng dịch vụ công Bộ Công An. Hệ thống sẽ <strong>không tự động đẩy hồ sơ</strong> cho đến khi tài khoản được kết nối và xác thực thành công.
            </p>
          </div>
        </div>
      ) : unsubmittedCount === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5 text-sm text-emerald-900 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
            </div>
            <div>
              <p className="font-bold text-base text-emerald-950">
                Toàn bộ hồ sơ đã gửi BCA thành công
              </p>
              <p className="text-xs sm:text-sm text-emerald-800 mt-0.5">
                Tự động gửi tạm dừng (sẽ tự động kích hoạt đếm ngược {AUTO_SUBMIT_DELAY_SECONDS}s khi có khách check-in mới).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-900/15 bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-slate-50/80 p-4 sm:p-5 shadow-xs transition-all space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-900 shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                </span>
                Tự động đẩy BCA
              </span>

              <div className="flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-emerald-700 animate-pulse" />
                <span className="text-base font-bold text-slate-900">
                  {isAutoPaused ? (
                    <>
                      Tự động gửi đang tạm dừng (
                      {countdownSeconds ?? AUTO_SUBMIT_DELAY_SECONDS}s)
                    </>
                  ) : (
                    <>
                      Tự động gửi BCA sau:{" "}
                      <span className="text-emerald-800 font-extrabold text-lg">
                        {countdownSeconds ?? AUTO_SUBMIT_DELAY_SECONDS}s
                      </span>
                    </>
                  )}
                </span>
                <span className="text-xs text-slate-500 font-medium hidden md:inline">
                  · Đang có <strong>{unsubmittedCount}</strong> hồ sơ sẵn sàng đẩy
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAutoPaused((prev) => !prev)}
                disabled={isSubmittingBatch}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                {isAutoPaused ? "▶ Tiếp tục" : "⏸ Tạm dừng"}
              </button>

              <button
                type="button"
                onClick={() => void executeAutoSubmitNow()}
                disabled={isSubmittingBatch}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#064e3b] px-4 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-[#043327] disabled:opacity-40 transition-colors"
              >
                <CloudUploadIcon className="h-4 w-4" />
                {isSubmittingBatch
                  ? "Đang gửi..."
                  : `Gửi ngay (${unsubmittedCount})`}
              </button>
            </div>
          </div>

          {/* Progress bar visual */}
          <div className="w-full bg-emerald-100/70 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full transition-all duration-1000 ease-linear"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(
                    100,
                    (((countdownSeconds ?? AUTO_SUBMIT_DELAY_SECONDS)) /
                      AUTO_SUBMIT_DELAY_SECONDS) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
            <p>
              Hệ thống tự động đồng bộ hồ sơ lên Cổng DVC Bộ Công An theo chu kỳ đã cấu hình ({AUTO_SUBMIT_DELAY_SECONDS}s). Khi toàn bộ hồ sơ được nộp xong, bộ đếm sẽ tự động dừng.
            </p>
          </div>
        </div>
      )}

      {/* Table Data View */}
      {declarationsQuery.isPending ? (
        <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center text-slate-500 shadow-xs">
          Đang tải danh sách khách lưu trú…
        </div>
      ) : declarationsQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <p className="font-semibold">
            Không thể tải danh sách khai báo tạm trú
          </p>
          <p className="mt-2">{errorText(declarationsQuery.error)}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-4 min-h-11 rounded-xl bg-red-600 px-5 text-white"
          >
            Thử lại
          </button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">
          {searchQuery ||
          statusFilter !== "ALL" ||
          nationalityFilter !== "ALL" ||
          checkInDateFilter
            ? "Không tìm thấy khách lưu trú phù hợp với bộ lọc."
            : "Chưa có khách đang check-in."}
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
              <tr className="border-b border-slate-200 text-sm font-semibold text-slate-700">
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-14 px-3 py-3.5 text-center whitespace-nowrap"
                >
                  STT
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-28 px-3 py-3.5 whitespace-nowrap"
                >
                  Số phòng
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-40 min-w-[150px] px-3 py-3.5 whitespace-nowrap"
                >
                  Tên khách
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-48 px-3 py-3.5 whitespace-nowrap"
                >
                  Quốc tịch
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-44 px-3 py-3.5 whitespace-nowrap"
                >
                  Số giấy tờ
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-36 px-3 py-3.5 whitespace-nowrap"
                >
                  Loại giấy tờ
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-40 px-3 py-3.5 whitespace-nowrap"
                >
                  Ngày sinh
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-28 px-3 py-3.5 whitespace-nowrap"
                >
                  Giới tính
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-36 px-3 py-3.5 text-center whitespace-nowrap"
                >
                  Trạng thái
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs w-48 min-w-[200px] px-3 py-3.5 text-center whitespace-nowrap"
                >
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-base">
              {filteredRows.map((row, idx) => {
                const statusInfo = getDeclarationStatus(row);
                const isSelectable = canSelectKbttDeclaration(row);
                const edits = inlineEdits[row.occupantId] ?? {};
                const currentIdentity = (
                  edits.identityNumber ??
                  row.identityNumber ??
                  ""
                ).trim();
                const isVietnameseIdentity = /^\d{9,12}$/.test(currentIdentity);
                const isForeignPassport =
                  /^(?=.*[A-Za-z])[A-Za-z0-9]{1,12}$/.test(currentIdentity);

                const effectiveNationality =
                  edits.nationality ??
                  row.nationality ??
                  (row.citizenshipKind === "VIETNAMESE" || isVietnameseIdentity
                    ? "VNM"
                    : "");

                const effectiveDocType = String(
                  edits.documentType ??
                    row.documentType ??
                    (effectiveNationality && effectiveNationality !== "VNM"
                      ? 4
                      : row.citizenshipKind === "FOREIGN"
                        ? 4
                        : /^\d{12}$/.test(currentIdentity)
                          ? 1
                          : /^\d{9}$/.test(currentIdentity)
                            ? 2
                            : isForeignPassport
                              ? 4
                              : ""),
                );
                return (
                  <tr
                    key={row.occupantId}
                    className={
                      isSelectable ? "hover:bg-slate-50/80" : "bg-slate-50/70"
                    }
                  >
                    {/* STT */}
                    <td className="px-3 py-3 text-center text-slate-500 font-medium">
                      {(page - 1) * limit + idx + 1}
                    </td>

                    {/* Số phòng */}
                    <td className="px-3 py-3">
                      <div className="flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-center text-base font-semibold text-slate-800">
                        {row.roomNumber ?? "—"}
                      </div>
                    </td>

                    {/* Tên khách */}
                    <td className="px-3 py-3">
                      <input
                        value={edits.fullName ?? row.fullName}
                        disabled={!isSelectable || isSubmittingBatch}
                        onChange={(event) =>
                          updateInlineField(
                            row.occupantId,
                            "fullName",
                            event.target.value,
                          )
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-base font-medium text-slate-900 disabled:bg-slate-50"
                        aria-label={`Tên khách phòng ${row.roomNumber ?? "—"}`}
                      />
                    </td>

                    {/* Quốc tịch */}
                    <td className="px-3 py-3">
                      <select
                        value={effectiveNationality}
                        disabled={!isSelectable || isSubmittingBatch}
                        onChange={(event) =>
                          updateInlineField(
                            row.occupantId,
                            "nationality",
                            event.target.value,
                          )
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-base text-slate-800 disabled:bg-slate-50"
                        aria-label={`Quốc tịch phòng ${row.roomNumber ?? "—"}`}
                      >
                        <option value="">Chọn quốc tịch</option>
                        {effectiveNationality &&
                          !nationalities.some(
                            (item) => item.code === effectiveNationality,
                          ) && (
                            <option value={effectiveNationality}>
                              {effectiveNationality}
                            </option>
                          )}
                        {nationalities.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.code} ({item.nameVi})
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Số giấy tờ */}
                    <td className="px-3 py-3">
                      <input
                        value={edits.identityNumber ?? row.identityNumber ?? ""}
                        disabled={!isSelectable || isSubmittingBatch}
                        onChange={(event) =>
                          updateInlineField(
                            row.occupantId,
                            "identityNumber",
                            event.target.value,
                          )
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-base text-slate-800 disabled:bg-slate-50"
                        aria-label={`Số giấy tờ phòng ${row.roomNumber ?? "—"}`}
                      />
                    </td>

                    {/* Loại giấy tờ */}
                    <td className="px-3 py-3">
                      <select
                        value={effectiveDocType}
                        disabled={!isSelectable || isSubmittingBatch}
                        onChange={(event) =>
                          updateInlineField(
                            row.occupantId,
                            "documentType",
                            event.target.value,
                          )
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50"
                        aria-label="Loại giấy tờ bắt buộc"
                      >
                        <option value="">Chọn *</option>
                        {effectiveDocType &&
                          !documentTypes.some(
                            (item) => String(item.code) === effectiveDocType,
                          ) && (
                            <option value={effectiveDocType}>
                              {effectiveDocType === "1"
                                ? "Thẻ CCCD"
                                : effectiveDocType === "2"
                                  ? "Thẻ CMND"
                                  : effectiveDocType === "4"
                                    ? "Hộ chiếu"
                                    : effectiveDocType === "8"
                                      ? "Thẻ Căn Cước"
                                      : `Loại ${effectiveDocType}`}
                            </option>
                          )}
                        {documentTypes.map((item) => (
                          <option key={item.code} value={String(item.code)}>
                            {item.nameVi}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Ngày sinh */}
                    <td className="px-3 py-3">
                      <input
                        type="date"
                        value={edits.dateOfBirth ?? row.dateOfBirth ?? ""}
                        disabled={!isSelectable || isSubmittingBatch}
                        onChange={(event) =>
                          updateInlineField(
                            row.occupantId,
                            "dateOfBirth",
                            event.target.value,
                          )
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50"
                        aria-label="Ngày sinh bắt buộc"
                      />
                    </td>
                    {/* Giới tính */}
                    <td className="px-3 py-3">
                      <select
                        value={edits.gender ?? row.gender ?? ""}
                        disabled={!isSelectable || isSubmittingBatch}
                        onChange={(event) =>
                          updateInlineField(
                            row.occupantId,
                            "gender",
                            event.target.value,
                          )
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50"
                        aria-label="Giới tính bắt buộc"
                      >
                        <option value="">Chọn *</option>
                        <option value="M">Nam</option>
                        <option value="F">Nữ</option>
                      </select>
                    </td>
                    {/* Trạng thái */}
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <span
                          className={`inline-flex whitespace-nowrap items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold shadow-2xs ${statusInfo.badgeClass}`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${statusInfo.dotColor}`}
                          />
                          {statusInfo.label}
                        </span>
                        {statusInfo.key === "UNSENT" && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 shadow-2xs"
                            title="Hồ sơ sẽ được hệ thống tự động đẩy lên C06 Bộ Công An"
                          >
                            <ClockIcon className="h-3 w-3 text-emerald-600" />
                            {isAutoPaused
                              ? "Tạm dừng"
                              : `Tự động gửi sau ${countdownSeconds ?? AUTO_SUBMIT_DELAY_SECONDS}s`}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Thao tác */}
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <RowActionMenu
                        statusInfo={statusInfo}
                        onView={() => setSelectedOccupant(row)}
                        onSave={() => void handleSaveInlineRow(row)}
                        onSubmit={() => handleSubmitSingle(row)}
                        onViewError={() => handleViewError(row)}
                        dirty={Boolean(inlineEdits[row.occupantId])}
                        disabled={isSubmittingBatch || isDevLoading}
                        isDevMode={isDevMode}
                        onDevResetSingle={() => void handleDevResetSingle(row)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <footer className="sticky bottom-0 z-20 flex flex-col gap-4 border-t border-slate-200 bg-white/95 px-5 py-3.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between rounded-2xl">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-slate-700">
            Hiển thị <span className="font-bold text-slate-900">{filteredRows.length}</span> / {totalOccupants} khách
          </p>
          <div className="h-4 w-px bg-slate-300 hidden sm:block" aria-hidden="true" />
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <label htmlFor="kbtt-page-size" className="text-slate-500 whitespace-nowrap">
              Số khách / trang:
            </label>
            <select
              id="kbtt-page-size"
              value={limit}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-800 shadow-2xs focus:border-[#064e3b] focus:outline-none"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav aria-label="Phân trang" className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-500 mr-1 hidden sm:inline">
            Trang {page} / {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || declarationsQuery.isFetching}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Trang trước"
            >
              &lt;
            </button>

            {pageNumbers.map((p, idx) => {
              if (p === "...") {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="flex h-11 w-8 items-center justify-center text-sm font-semibold text-slate-400 select-none"
                    aria-hidden="true"
                  >
                    ...
                  </span>
                );
              }
              const pageNum = p as number;
              const isActive = pageNum === page;
              return (
                <button
                  key={`page-${pageNum}`}
                  type="button"
                  disabled={declarationsQuery.isFetching}
                  onClick={() => setPage(pageNum)}
                  className={`flex h-11 min-w-11 px-3 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-[var(--primary)] text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Trang ${pageNum}`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={page >= totalPages || declarationsQuery.isFetching}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Trang sau"
            >
              &gt;
            </button>
          </div>
        </nav>
      </footer>

      {/* Back to Top floating button */}
      {showBackToTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-24 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#064e3b] text-white shadow-lg transition-all duration-200 hover:bg-[#043327] hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] focus-visible:ring-offset-2"
          aria-label="Cuộn lên đầu trang"
          title="Cuộn lên đầu trang"
        >
          <svg
            className="h-6 w-6 stroke-[2.5]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Detail Edit Modal */}
      {selectedOccupant && (
        <DeclarationModal
          hotelId={hotelId}
          occupantId={selectedOccupant.occupantId}
          occupantSummary={selectedOccupant}
          canManage={canManage}
          isConnected={isConnected}
          isDevMode={isDevMode}
          onClose={() => setSelectedOccupant(null)}
          onUpdated={handleRefresh}
        />
      )}

      {/* Dev Intervention Modal */}
      {isDevModalOpen && (
        <KbttDevInterventionModal
          hotelId={hotelId}
          allRows={allRows}
          isDevMode={isDevMode}
          onToggleDevMode={(val) => setIsDevMode(val)}
          devModalEdits={devModalEdits}
          onUpdateDevModalEdit={(occupantId, value) =>
            setDevModalEdits((prev) => ({ ...prev, [occupantId]: value }))
          }
          onSaveDevModalRow={handleSaveDevModalRow}
          onSaveAllDevModalRows={handleSaveAllDevModalRows}
          onDevResetAll={handleDevResetAll}
          onClose={() => setIsDevModalOpen(false)}
          onOpenDetail={(row) => setSelectedOccupant(row)}
          isDevLoading={isDevLoading}
        />
      )}
    </div>
  );
}

function DeclarationModal({
  hotelId,
  occupantId,
  occupantSummary,
  canManage,
  isConnected = true,
  isDevMode = false,
  onClose,
  onUpdated,
}: {
  hotelId: string;
  occupantId: string;
  occupantSummary: KbttDeclarationListItem;
  canManage: boolean;
  isConnected?: boolean;
  isDevMode?: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const boundResource = useMemo(
    () => kbttResource.bind({ hotelId }),
    [hotelId],
  );
  const detailResource = useMemo(
    () => boundResource.queries.declarationDetail.options({ occupantId }),
    [boundResource, occupantId],
  );
  const detailQuery = useQuery(detailResource);

  const saveMutation = useMutation(boundResource.mutations.saveDraft.options());
  const submitMutation = useMutation(boundResource.mutations.submit.options());

  const initialKind =
    detailQuery.data?.declaration?.declarationKind ??
    detailQuery.data?.occupant.citizenshipKind ??
    occupantSummary.citizenshipKind ??
    null;
  const [citizenshipOverride, setCitizenshipOverride] =
    useState<CitizenshipKind | null>(null);
  const [manualClassification, setManualClassification] = useState(false);
  const citizenshipKind = citizenshipOverride ?? initialKind;
  const initialFormData = useMemo(() => {
    if (!detailQuery.data) return {};
    const occupant = detailQuery.data.occupant;
    const initial: Record<string, unknown> = {
      ...((detailQuery.data.declaration?.draftPayload ?? {}) as Record<
        string,
        unknown
      >),
    };
    if (!initial.hoTen && occupant.fullName) initial.hoTen = occupant.fullName;
    if (!initial.soPhong && occupantSummary.roomNumber)
      initial.soPhong = occupantSummary.roomNumber;
    if (!initial.ngayDenCsltStr) {
      initial.ngayDenCsltStr = formatStayDateTimeForForm(
        occupantSummary.checkedInAt ?? occupantSummary.plannedCheckInAt,
      );
    }
    if (!initial.ngayDiDuKienStr) {
      initial.ngayDiDuKienStr = formatStayDateTimeForForm(
        occupantSummary.plannedCheckOutAt,
      );
    }
    if (initialKind === "FOREIGN" && !initial.thoiHanTamTruStr) {
      initial.thoiHanTamTruStr = initial.ngayDiDuKienStr;
    }
    if (!initial.ngayThangNamSinhStr && occupant.dateOfBirth) {
      initial.ngayThangNamSinhStr = occupant.dateOfBirth;
    }
    if (!initial.gioiTinh && occupant.gender) {
      const gender = occupant.gender.trim().toUpperCase();
      if (["M", "MALE", "NAM"].includes(gender)) initial.gioiTinh = "M";
      if (["F", "FEMALE", "NỮ", "NU"].includes(gender)) initial.gioiTinh = "F";
    }
    if (
      initialKind === "VIETNAMESE" &&
      !initial.soGiayTo &&
      occupant.identityNumber
    ) {
      initial.soGiayTo = occupant.identityNumber;
    }
    if (!initial.diaChi && occupant.residencePlace) {
      initial.diaChi = occupant.residencePlace;
    }
    if (!initial.soDienThoai && occupant.phone) {
      initial.soDienThoai = occupant.phone;
    }
    if (initialKind === "FOREIGN") {
      if (!initial.soHoChieu && occupant.identityNumber)
        initial.soHoChieu = occupant.identityNumber;
      if (!initial.loaiNgayThangNamSinh) initial.loaiNgayThangNamSinh = "D";
    }
    return formatKbttDraftForDisplay(initial);
  }, [
    detailQuery.data,
    initialKind,
    occupantSummary.checkedInAt,
    occupantSummary.plannedCheckInAt,
    occupantSummary.plannedCheckOutAt,
    occupantSummary.roomNumber,
  ]);
  const [formEdits, setFormEdits] = useState<Record<string, unknown>>({});
  const baseFormData = useMemo(
    () => ({
      ...(citizenshipOverride && citizenshipOverride !== initialKind
        ? {}
        : initialFormData),
      ...formEdits,
    }),
    [citizenshipOverride, formEdits, initialFormData, initialKind],
  );
  const documentTypesQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "DOCUMENT_TYPE" }),
    enabled: citizenshipKind === "VIETNAMESE",
  });
  const stayReasonsQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "STAY_REASON" }),
    enabled: citizenshipKind === "VIETNAMESE",
  });
  const provincesQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "PROVINCE" }),
    enabled: citizenshipKind === "VIETNAMESE",
  });
  const inferredProvinceCode = uniqueCatalogMatch(
    provincesQuery.data ?? [],
    detailQuery.data?.occupant.residencePlace,
  );
  const provinceCode =
    baseFormData.maTT !== undefined &&
    baseFormData.maTT !== null &&
    String(baseFormData.maTT).trim() !== ""
      ? String(baseFormData.maTT).trim()
      : inferredProvinceCode;
  const wardsQuery = useQuery({
    ...boundResource.queries.catalog.options({
      kind: "WARD",
      parentCode: provinceCode,
    }),
    enabled: citizenshipKind === "VIETNAMESE" && Boolean(provinceCode),
  });
  const residencePlacesQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "RESIDENCE_PLACE" }),
    enabled: citizenshipKind === "VIETNAMESE",
  });
  const nationalitiesQuery = useQuery({
    ...boundResource.queries.catalog.options({ kind: "NATIONALITY" }),
    enabled: citizenshipKind === "FOREIGN",
  });
  const inferredDocumentType = inferDocumentTypeCode(
    documentTypesQuery.data ?? [],
    detailQuery.data?.occupant.identityNumber,
  );
  const inferredStayReasonCode = uniqueCatalogMatch(
    stayReasonsQuery.data ?? [],
    "Du lịch",
  );
  const inferredStayReason =
    inferredStayReasonCode && /^\d+$/.test(inferredStayReasonCode)
      ? Number(inferredStayReasonCode)
      : undefined;
  const inferredWardCode = uniqueCatalogMatch(
    wardsQuery.data ?? [],
    detailQuery.data?.occupant.residencePlace,
  );
  const inferredResidencePlace = uniqueCatalogMatch(
    residencePlacesQuery.data ?? [],
    "Tạm trú",
  );
  const inferredNationalityCode = uniqueCatalogMatch(
    nationalitiesQuery.data ?? [],
    detailQuery.data?.occupant.nationality,
  );
  const formData = useMemo<Record<string, unknown>>(
    () => ({
      ...baseFormData,
      ...(baseFormData.loaiGiayTo === undefined && inferredDocumentType
        ? { loaiGiayTo: Number(inferredDocumentType) }
        : {}),
      ...(baseFormData.lyDoCuTru === undefined && inferredStayReason
        ? { lyDoCuTru: Number(inferredStayReason) }
        : {}),
      ...(baseFormData.maTT === undefined && inferredProvinceCode
        ? { maTT: inferredProvinceCode }
        : {}),
      ...(baseFormData.maPX === undefined && inferredWardCode
        ? { maPX: inferredWardCode }
        : {}),
      ...(baseFormData.noiCuTru === undefined && inferredResidencePlace
        ? { noiCuTru: Number(inferredResidencePlace) }
        : {}),
      ...(baseFormData.quocTich === undefined && inferredNationalityCode
        ? { quocTich: inferredNationalityCode }
        : {}),
    }),
    [
      baseFormData,
      inferredDocumentType,
      inferredStayReason,
      inferredNationalityCode,
      inferredProvinceCode,
      inferredResidencePlace,
      inferredWardCode,
    ],
  );

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateField = (key: string, value: unknown) => {
    setFormEdits((prev) => ({ ...prev, [key]: value }));
  };

  const isActuallySubmitted =
    detailQuery.data?.declaration?.status === "SUBMITTED";
  const isAlreadySubmitted = isActuallySubmitted;
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const handleSaveDraft = async () => {
    if (!canManage) return;
    if (isActuallySubmitted) return;
    if (!citizenshipKind) {
      await showErrorAlert(
        "Chưa xác định quốc tịch",
        "Vui lòng chọn loại quốc tịch trước khi lưu.",
      );
      return;
    }
    try {
      setIsSavingDraft(true);
      await saveMutation.mutateAsync({
        occupantId,
        body: {
          citizenshipKind,
          data: formatKbttDraftForProvider(formData),
          allowSubmittedEdit: true,
        },
      });
      await showSuccessAlert(
        "Đã lưu vào CSDL",
        "Đã lưu thông tin chi tiết (Tỉnh/Xã, địa chỉ...) vào CSDL thành công.",
      );
      onUpdated();
      onClose();
    } catch (error) {
      await showErrorAlert("Không thể lưu vào CSDL", errorText(error));
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    if (isActuallySubmitted) return;
    if (!isConnected) {
      await SwalVietSage.fire({
        title: "Chưa đăng nhập Cổng BCA",
        text: "Khách sạn chưa đăng nhập hoặc chưa kết nối thành công với Cổng dịch vụ công Bộ Công An. Vui lòng kết nối tài khoản trước khi gửi hồ sơ.",
        icon: "warning",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }
    if (!citizenshipKind) {
      await showErrorAlert(
        "Chưa xác định quốc tịch",
        "Giấy tờ chưa đủ dữ liệu để tự phân loại. Vui lòng chọn loại quốc tịch.",
      );
      return;
    }
    try {
      await saveMutation.mutateAsync({
        occupantId,
        body: {
          citizenshipKind,
          data: formatKbttDraftForProvider(formData),
          allowSubmittedEdit: true,
        },
      });
    } catch (saveError) {
      await showErrorAlert("Dữ liệu khai báo chưa hợp lệ", errorText(saveError));
      return;
    }

    try {
      await submitMutation.mutateAsync({ occupantId });
      await showSuccessAlert(
        "Khai báo tạm trú",
        "Bộ Công an đã tiếp nhận hồ sơ.",
      );
      onUpdated();
      onClose();
    } catch (submitError) {
      const isValidation =
        submitError &&
        typeof submitError === "object" &&
        "status" in submitError &&
        (submitError as { status: unknown }).status === 400;
      const title = isValidation
        ? "Dữ liệu chưa đủ điều kiện gửi"
        : "Bộ Công an từ chối hồ sơ";
      await showErrorAlert(title, errorText(submitError));
      onUpdated();
    }
  };

  const isBusy =
    saveMutation.isPending || submitMutation.isPending || isSavingDraft;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-decl-title"
    >
      <div className="relative my-8 w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-800">
                {occupantSummary.roomNumber
                  ? `Phòng ${occupantSummary.roomNumber}`
                  : "Chưa xếp phòng"}
              </span>
            </div>
            <h2
              id="modal-decl-title"
              className="mt-2 text-2xl font-bold text-slate-900"
            >
              Hồ sơ khai báo: {occupantSummary.fullName}
            </h2>
            <p className="mt-0.5 text-base text-slate-500">
              Mã khách: {occupantId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b]"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Loading state */}
        {detailQuery.isPending && (
          <div
            className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500"
            role="status"
          >
            <svg
              className="h-8 w-8 animate-spin text-[#064e3b]"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <p className="text-base font-medium">
              Đang tải chi tiết hồ sơ khai báo…
            </p>
          </div>
        )}

        {/* Error state */}
        {detailQuery.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
            <p className="font-semibold">{errorText(detailQuery.error)}</p>
            <button
              type="button"
              onClick={() => detailQuery.refetch()}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-red-600 px-4 py-2 text-base font-semibold text-white hover:bg-red-700"
            >
              Tải lại
            </button>
          </div>
        )}

        {/* Form Body */}
        {!detailQuery.isPending && !detailQuery.isError && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {detailQuery.data?.declaration?.status === "DRAFT" &&
              detailQuery.data.declaration.providerMessage && (
                <div className="rounded-2xl border border-red-200/90 bg-red-50/50 p-4 shadow-2xs space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-red-900 text-sm sm:text-base">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-200 text-red-800 text-xs font-black">
                      !
                    </span>
                    <span>Lần gửi trước bị Bộ Công an từ chối</span>
                  </div>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: formatAlertErrorMessage(
                        detailQuery.data.declaration.providerMessage,
                      ),
                    }}
                  />
                </div>
              )}

            {citizenshipKind && !manualClassification ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">
                    Đã tự xác định từ dữ liệu check-in
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    {citizenshipKind === "VIETNAMESE"
                      ? "Người Việt Nam · API 5"
                      : "Người nước ngoài · API 4"}
                  </p>
                </div>
                {canManage && !isAlreadySubmitted ? (
                  <button
                    type="button"
                    onClick={() => setManualClassification(true)}
                    className="min-h-11 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                  >
                    Phân loại sai? Chọn lại
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label
                  htmlFor="citizenship-kind-select"
                  className="block text-sm font-semibold text-amber-900 mb-1"
                >
                  Giấy tờ chưa đủ dữ liệu — chọn loại quốc tịch
                </label>
                <select
                  id="citizenship-kind-select"
                  value={citizenshipKind ?? ""}
                  disabled={!canManage || isAlreadySubmitted}
                  onChange={(e) => {
                    setCitizenshipOverride(e.target.value as CitizenshipKind);
                    setFormEdits({});
                  }}
                  className={selectClass}
                >
                  <option value="">-- Chọn thủ công --</option>
                  <option value="VIETNAMESE">
                    Người Việt Nam (API 5 - Báo cáo lưu trú nội địa)
                  </option>
                  <option value="FOREIGN">
                    Người nước ngoài (API 4 - Báo cáo tạm trú người nước ngoài)
                  </option>
                </select>
              </div>
            )}

            {/* Vietnamese Form */}
            {citizenshipKind === "VIETNAMESE" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="hoTen"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Họ và tên <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="hoTen"
                      type="text"
                      required
                      value={String(formData.hoTen ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) => updateField("hoTen", e.target.value)}
                      className={inputClass}
                      placeholder="NGUYEN VAN A"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="gioiTinh"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Giới tính <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="gioiTinh"
                      value={String(formData.gioiTinh ?? "M")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) => updateField("gioiTinh", e.target.value)}
                      className={selectClass}
                    >
                      <option value="M">Nam (M)</option>
                      <option value="F">Nữ (F)</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="ngayThangNamSinhStr"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Ngày sinh (DD/MM/YYYY){" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="ngayThangNamSinhStr"
                      type="text"
                      required
                      placeholder="15/01/1990"
                      value={String(formData.ngayThangNamSinhStr ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("ngayThangNamSinhStr", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="soDienThoai"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Số điện thoại
                    </label>
                    <input
                      id="soDienThoai"
                      type="tel"
                      value={String(formData.soDienThoai ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("soDienThoai", e.target.value || null)
                      }
                      className={inputClass}
                      placeholder="0912345678"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="loaiGiayTo"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Loại giấy tờ <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="loaiGiayTo"
                      required
                      value={
                        formData.loaiGiayTo === undefined
                          ? ""
                          : String(formData.loaiGiayTo)
                      }
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField(
                          "loaiGiayTo",
                          e.target.value ? Number(e.target.value) : undefined,
                        )
                      }
                      className={selectClass}
                    >
                      <option value="">Chọn loại giấy tờ</option>
                      {(documentTypesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.nameVi}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="soGiayTo"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Số giấy tờ <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="soGiayTo"
                      type="text"
                      required
                      value={String(formData.soGiayTo ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField(
                          "soGiayTo",
                          e.target.value.replace(/[^A-Za-z0-9]/g, ""),
                        )
                      }
                      className={inputClass}
                      placeholder="Không chứa dấu cách hoặc ký tự đặc biệt"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="lyDoCuTru"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Lý do cư trú (Mã BCA){" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="lyDoCuTru"
                      required
                      value={
                        formData.lyDoCuTru === undefined
                          ? ""
                          : String(formData.lyDoCuTru)
                      }
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField(
                          "lyDoCuTru",
                          e.target.value ? Number(e.target.value) : undefined,
                        )
                      }
                      className={selectClass}
                    >
                      <option value="">Chọn lý do cư trú</option>
                      {(stayReasonsQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.nameVi}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="lyDoChiTiet"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Lý do chi tiết (bắt buộc khi lý do là 20)
                    </label>
                    <input
                      id="lyDoChiTiet"
                      type="text"
                      value={String(formData.lyDoChiTiet ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("lyDoChiTiet", e.target.value || null)
                      }
                      className={inputClass}
                      placeholder="Nêu rõ mục đích cư trú"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="soPhong"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Số phòng <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="soPhong"
                      type="text"
                      required
                      value={String(formData.soPhong ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) => updateField("soPhong", e.target.value)}
                      className={inputClass}
                      placeholder="101"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ngayDenCsltStr"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Ngày đến <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="ngayDenCsltStr"
                      type="text"
                      required
                      placeholder="HH:mm:ss DD/MM/YYYY"
                      value={String(formData.ngayDenCsltStr ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("ngayDenCsltStr", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ngayDiDuKienStr"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Ngày đi dự kiến <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="ngayDiDuKienStr"
                      type="text"
                      required
                      placeholder="HH:mm:ss DD/MM/YYYY"
                      value={String(formData.ngayDiDuKienStr ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("ngayDiDuKienStr", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="maTT"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Mã tỉnh/TP (Mã BCA)
                    </label>
                    <select
                      id="maTT"
                      value={String(formData.maTT ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) => {
                        updateField("maTT", e.target.value || null);
                        updateField("maPX", null);
                      }}
                      className={selectClass}
                    >
                      <option value="">
                        {provincesQuery.isPending
                          ? "Đang tải danh sách Tỉnh/TP..."
                          : "Chọn tỉnh/thành phố"}
                      </option>
                      {Boolean(formData.maTT) &&
                        !(provincesQuery.data ?? []).some(
                          (item) => item.code === String(formData.maTT),
                        ) && (
                          <option value={String(formData.maTT)}>
                            {String(formData.maTT)}
                          </option>
                        )}
                      {(provincesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.code} - {item.nameVi}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="maPX"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Mã phường/xã (Mã BCA)
                    </label>
                    <select
                      id="maPX"
                      value={String(formData.maPX ?? "")}
                      disabled={
                        !canManage || isAlreadySubmitted || !provinceCode
                      }
                      onChange={(e) =>
                        updateField("maPX", e.target.value || null)
                      }
                      className={selectClass}
                    >
                      <option value="">
                        {!provinceCode
                          ? "Vui lòng chọn Tỉnh/TP trước"
                          : wardsQuery.isPending
                            ? "Đang tải danh sách phường/xã..."
                            : "Chọn phường/xã"}
                      </option>
                      {Boolean(formData.maPX) &&
                        !(wardsQuery.data ?? []).some(
                          (item) => item.code === String(formData.maPX),
                        ) && (
                          <option value={String(formData.maPX)}>
                            {String(formData.maPX)}
                          </option>
                        )}
                      {(wardsQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.code} - {item.nameVi}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="noiCuTru"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Nơi cư trú (Mã BCA)
                    </label>
                    <select
                      id="noiCuTru"
                      value={
                        formData.noiCuTru === undefined ||
                        formData.noiCuTru === null
                          ? ""
                          : String(formData.noiCuTru)
                      }
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField(
                          "noiCuTru",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className={selectClass}
                    >
                      <option value="">Chọn nơi cư trú</option>
                      {(residencePlacesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.nameVi}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="diaChi"
                    className="block text-sm font-semibold text-slate-700 mb-1"
                  >
                    Địa chỉ chi tiết
                  </label>
                  <input
                    id="diaChi"
                    type="text"
                    value={String(formData.diaChi ?? "")}
                    disabled={!canManage || isAlreadySubmitted}
                    onChange={(e) =>
                      updateField("diaChi", e.target.value || null)
                    }
                    className={inputClass}
                    placeholder="Số nhà, đường phố..."
                  />
                </div>

                <div>
                  <label
                    htmlFor="ghiChu"
                    className="block text-sm font-semibold text-slate-700 mb-1"
                  >
                    Ghi chú
                  </label>
                  <textarea
                    id="ghiChu"
                    rows={2}
                    value={String(formData.ghiChu ?? "")}
                    disabled={!canManage || isAlreadySubmitted}
                    onChange={(e) =>
                      updateField("ghiChu", e.target.value || null)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition-all focus:border-[#064e3b] focus:ring-2 focus:ring-[#064e3b]/15"
                    placeholder="Ghi chú thêm về khách lưu trú"
                  />
                </div>
              </div>
            ) : citizenshipKind === "FOREIGN" ? (
              /* Foreign Form */
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="f-hoTen"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Họ và tên <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-hoTen"
                      type="text"
                      required
                      value={String(formData.hoTen ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) => updateField("hoTen", e.target.value)}
                      className={inputClass}
                      placeholder="JOHN DOE"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="quocTich"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Mã quốc tịch BCA <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="quocTich"
                      required
                      value={String(formData.quocTich ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) => updateField("quocTich", e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Chọn quốc tịch</option>
                      {(nationalitiesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.nameVi}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="soHoChieu"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Số hộ chiếu <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="soHoChieu"
                      type="text"
                      required
                      value={String(formData.soHoChieu ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField(
                          "soHoChieu",
                          e.target.value.replace(/[^A-Za-z0-9]/g, ""),
                        )
                      }
                      className={inputClass}
                      placeholder="A12345678"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="f-gioiTinh"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Giới tính <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="f-gioiTinh"
                      value={String(formData.gioiTinh ?? "M")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) => updateField("gioiTinh", e.target.value)}
                      className={selectClass}
                    >
                      <option value="M">Nam (M)</option>
                      <option value="F">Nữ (F)</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="loaiNgayThangNamSinh"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Loại ngày sinh <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="loaiNgayThangNamSinh"
                      value={String(formData.loaiNgayThangNamSinh ?? "D")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("loaiNgayThangNamSinh", e.target.value)
                      }
                      className={selectClass}
                    >
                      <option value="D">D - Đầy đủ ngày/tháng/năm</option>
                      <option value="Y">
                        Y - Chỉ có năm sinh (01/01/YYYY)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="f-ngayThangNamSinhStr"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Ngày sinh (DD/MM/YYYY){" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-ngayThangNamSinhStr"
                      type="text"
                      required
                      placeholder={
                        formData.loaiNgayThangNamSinh === "Y"
                          ? "01/01/1985"
                          : "20/06/1985"
                      }
                      value={String(formData.ngayThangNamSinhStr ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("ngayThangNamSinhStr", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="f-soPhong"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Số phòng <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-soPhong"
                      type="text"
                      required
                      value={String(formData.soPhong ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) => updateField("soPhong", e.target.value)}
                      className={inputClass}
                      placeholder="201"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="thoiHanTamTruStr"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Thời hạn tạm trú <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="thoiHanTamTruStr"
                      type="text"
                      required
                      placeholder="HH:mm:ss DD/MM/YYYY"
                      value={String(formData.thoiHanTamTruStr ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("thoiHanTamTruStr", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="f-ngayDenCsltStr"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Ngày đến <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-ngayDenCsltStr"
                      type="text"
                      required
                      placeholder="HH:mm:ss DD/MM/YYYY"
                      value={String(formData.ngayDenCsltStr ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("ngayDenCsltStr", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="f-ngayDiDuKienStr"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Ngày đi dự kiến <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-ngayDiDuKienStr"
                      type="text"
                      required
                      placeholder="HH:mm:ss DD/MM/YYYY"
                      value={String(formData.ngayDiDuKienStr ?? "")}
                      disabled={!canManage || isAlreadySubmitted}
                      onChange={(e) =>
                        updateField("ngayDiDuKienStr", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {/* Footer Buttons */}
            <div className="flex flex-col-reverse gap-3 pt-4 border-t border-slate-100 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b]"
              >
                Đóng
              </button>

              <div className="flex flex-wrap items-center gap-3">
                {canManage && !isAlreadySubmitted && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleSaveDraft()}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-white px-5 py-3 text-base font-bold text-emerald-800 shadow-xs transition-all hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
                  >
                    {isSavingDraft ? "Đang lưu CSDL…" : "💾 Lưu vào DB"}
                  </button>
                )}

                {canManage && !isActuallySubmitted ? (
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#064e3b] px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-[#043327] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] disabled:opacity-50"
                  >
                    {submitMutation.isPending ? "Đang gửi…" : "Gửi lên Bộ Công an"}
                  </button>
                ) : isActuallySubmitted ? (
                  <span className="inline-flex min-h-12 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-base font-semibold text-emerald-800">
                    Hồ sơ của lần lưu trú này đã gửi BCA
                  </span>
                ) : null}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function KbttDevInterventionModal({
  hotelId: _hotelId,
  allRows,
  isDevMode,
  onToggleDevMode,
  devModalEdits,
  onUpdateDevModalEdit,
  onSaveDevModalRow,
  onSaveAllDevModalRows,
  onDevResetAll,
  onClose,
  onOpenDetail,
  isDevLoading,
}: {
  hotelId: string;
  allRows: KbttDeclarationListItem[];
  isDevMode: boolean;
  onToggleDevMode: (val: boolean) => void;
  devModalEdits: Record<string, string>;
  onUpdateDevModalEdit: (occupantId: string, value: string) => void;
  onSaveDevModalRow: (
    row: KbttDeclarationListItem,
    customIdentity?: string,
  ) => Promise<void>;
  onSaveAllDevModalRows: () => Promise<void>;
  onDevResetAll: (generateRandomIdentity?: boolean) => Promise<void>;
  onClose: () => void;
  onOpenDetail?: (row: KbttDeclarationListItem) => void;
  isDevLoading: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        (r.fullName ?? "").toLowerCase().includes(q) ||
        (r.roomNumber ?? "").toLowerCase().includes(q) ||
        (r.identityNumber ?? "").toLowerCase().includes(q),
    );
  }, [allRows, search]);

  const generateRandomForOccupant = (row: KbttDeclarationListItem) => {
    const isVn =
      row.citizenshipKind === "VIETNAMESE" ||
      row.nationality === "VNM" ||
      !row.nationality;
    let generated = "";
    if (isVn) {
      const provinces = [
        "001",
        "079",
        "031",
        "048",
        "092",
        "038",
        "036",
        "024",
      ];
      const province = provinces[Math.floor(Math.random() * provinces.length)];
      const centuryGender = Math.floor(Math.random() * 4).toString();
      const year = Math.floor(Math.random() * 20 + 80)
        .toString()
        .slice(-2);
      const randomSuffix = Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, "0");
      generated = `${province}${centuryGender}${year}${randomSuffix}`;
    } else {
      const letters = ["B", "C", "E", "G", "K", "N", "P"];
      const letter = letters[Math.floor(Math.random() * letters.length)];
      const digits = Math.floor(Math.random() * 100000000)
        .toString()
        .padStart(8, "0");
      generated = `${letter}${digits}`;
    }
    onUpdateDevModalEdit(row.occupantId, generated);
  };

  const pendingCount = Object.keys(devModalEdits).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dev-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden border border-amber-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-900">
              <WrenchIcon className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="dev-modal-title"
                className="text-lg font-bold text-slate-900"
              >
                Công cụ chỉnh số giấy tờ & đặt lại hồ sơ
              </h2>
              <p className="text-xs text-slate-600">
                Sửa số giấy tờ và đặt lại trạng thái hồ sơ về Chưa gửi để gửi lại lên Cổng BCA.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-amber-200/50 hover:text-slate-800 transition-colors"
            aria-label="Đóng bảng công cụ"
          >
            ✕
          </button>
        </div>

        {/* Quick Actions Panel */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/50 p-6 md:grid-cols-2">
          {/* Card 1: Reset all to DRAFT */}
          <div className="flex flex-col justify-between rounded-2xl border border-amber-200/80 bg-white p-4 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🔄</span>
                <h3 className="font-bold text-slate-900">
                  1-Click: Reset toàn bộ về Chưa gửi
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Đổi trạng thái toàn bộ hồ sơ đang Đã gửi / Thất bại về <span className="font-semibold text-amber-800">Chưa gửi (DRAFT)</span> để có thể ấn nút Upload đẩy lại lên BCA.
              </p>
            </div>
            <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                disabled={isDevLoading}
                onClick={() => void onDevResetAll(false)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                <RefreshIcon className={`h-3.5 w-3.5 ${isDevLoading ? "animate-spin" : ""}`} />
                <span>Reset tất cả về Chưa gửi</span>
              </button>
            </div>
          </div>

          {/* Card 2: Generate random CCCD/Passport + Reset */}
          <div className="flex flex-col justify-between rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🎲</span>
                <h3 className="font-bold text-slate-900">
                  1-Click: Sinh Số giấy tờ ngẫu nhiên & Reset
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Tự động sinh CCCD 12 số hợp lệ (VN) hoặc Passport (QT) cho <span className="font-semibold text-emerald-800">toàn bộ khách</span>, lưu thông tin và đặt lại hồ sơ về Chưa gửi.
              </p>
            </div>
            <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                disabled={isDevLoading}
                onClick={() => void onDevResetAll(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#064e3b] px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#043327] disabled:opacity-50 transition-colors"
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                <span>Sinh ngẫu nhiên & Reset toàn bộ</span>
              </button>
            </div>
          </div>
        </div>

        {/* Cho phép chỉnh sửa & toolbar tìm kiếm */}
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={isDevMode}
              onClick={() => onToggleDevMode(!isDevMode)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isDevMode ? "bg-amber-600" : "bg-slate-300"
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                  isDevMode ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <span
              onClick={() => onToggleDevMode(!isDevMode)}
              className="text-xs font-semibold text-slate-800 cursor-pointer select-none"
            >
              Bật chế độ sửa nhanh Số giấy tờ trên bảng chính (cho phép gõ trực tiếp khi hồ sơ đã gửi)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-[220px]">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Tìm khách / phòng..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8.5 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8.5 pr-3 text-xs text-slate-800 outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>
            {pendingCount > 0 && (
              <button
                type="button"
                disabled={isDevLoading}
                onClick={() => void onSaveAllDevModalRows()}
                className="inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                💾 Lưu {pendingCount} thay đổi
              </button>
            )}
          </div>
        </div>

        {/* Occupant list table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-3.5 py-2.5 w-24">Phòng</th>
                  <th className="px-3.5 py-2.5">Họ tên & Quốc tịch</th>
                  <th className="px-3.5 py-2.5 w-32">Trạng thái</th>
                  <th className="px-3.5 py-2.5 w-36">Số giấy tờ (DB)</th>
                  <th className="px-3.5 py-2.5">Sửa đổi Số giấy tờ mới</th>
                  <th className="px-3.5 py-2.5 text-right w-44">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((row) => {
                  const status = getDeclarationStatus(row);
                  const currentIdentity = row.identityNumber ?? "—";
                  const editedIdentity = devModalEdits[row.occupantId] ?? "";
                  const hasEdit = Boolean(devModalEdits[row.occupantId]);

                  return (
                    <tr
                      key={row.occupantId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        hasEdit ? "bg-amber-50/30" : ""
                      }`}
                    >
                      <td className="px-3.5 py-2.5 font-bold text-slate-800">
                        Phòng {row.roomNumber ?? "—"}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-slate-900">
                          {row.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {row.nationality === "VNM" || row.citizenshipKind === "VIETNAMESE"
                            ? "🇻🇳 Việt Nam"
                            : `🌐 ${row.nationality || "Quốc tế"}`}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${status.badgeClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-700">
                        {currentIdentity}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder={row.identityNumber || "Nhập số giấy tờ mới"}
                            value={hasEdit ? editedIdentity : ""}
                            onChange={(e) =>
                              onUpdateDevModalEdit(
                                row.occupantId,
                                e.target.value,
                              )
                            }
                            className={`h-8 w-full max-w-[180px] rounded-lg border px-2.5 font-mono text-xs outline-none transition-colors ${
                              hasEdit
                                ? "border-amber-400 bg-amber-50/50 font-bold text-amber-950"
                                : "border-slate-200 bg-white text-slate-800 focus:border-amber-500"
                            }`}
                          />
                          <button
                            type="button"
                            title="Tạo số giấy tờ ngẫu nhiên hợp lệ"
                            onClick={() => generateRandomForOccupant(row)}
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                          >
                            <SparklesIcon className="h-3 w-3 text-amber-600" />
                            <span>Random</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onOpenDetail && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenDetail(row);
                              }}
                              title="Mở box chỉnh chi tiết hồ sơ (Tỉnh, Phường/Xã, địa chỉ...)"
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-[#064e3b] hover:bg-slate-50 transition-colors"
                            >
                              <PencilIcon className="h-3 w-3 text-slate-500" />
                              <span>Sửa chi tiết</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isDevLoading || !hasEdit}
                            onClick={() => void onSaveDevModalRow(row)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-600 px-3 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <span>💾 Lưu DB</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <div className="text-xs text-slate-500">
            {filtered.length} khách lưu trú • Khi lưu, số giấy tờ được ghi trực tiếp vào bảng <code className="font-mono text-slate-700">GuestStayOccupant</code> và trạng thái chuyển về <code className="font-mono text-slate-700">DRAFT</code>.
          </div>
          <div className="flex items-center gap-2.5">
            {pendingCount > 0 && (
              <button
                type="button"
                disabled={isDevLoading}
                onClick={() => void onSaveAllDevModalRows()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                💾 Lưu tất cả ({pendingCount})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
