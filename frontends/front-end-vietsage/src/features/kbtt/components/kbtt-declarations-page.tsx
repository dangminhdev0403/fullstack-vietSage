"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { HttpError } from "@/core/http/http-error";
import {
  formatAlertErrorMessage,
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
} from "@/libs/swal";

import { KbttConnectionPage } from "./kbtt-connection-page";
import { kbttResource } from "../resources/kbtt-resource";
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
  if (error instanceof HttpError) {
    if (error.data && typeof error.data === "object") {
      const dataObj = error.data as Record<string, unknown>;
      const providerDetail = sanitizeProviderDetail(error.data);
      if (providerDetail) return providerDetail;
      if (typeof dataObj.message === "string")
        return sanitizeErrorMessage(dataObj.message);
    }
    const code = kbttErrorCode(error.data);
    if (code) return sanitizeErrorMessage(code);
    if (error.status === 400) return "Dữ liệu khai báo không hợp lệ.";
    if (error.status === 403)
      return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy hồ sơ khách lưu trú.";
    return sanitizeErrorMessage(kbttErrorCode(error.data));
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

function DotsVerticalIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM10 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM10 18a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
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

function RowActionMenu({
  statusInfo,
  onEdit,
  onSubmit,
  onViewError,
  disabled,
}: {
  statusInfo: { key: string; label: string };
  onEdit: () => void;
  onSubmit: () => void;
  onViewError: () => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 transition-colors"
        aria-label="Thao tác"
      >
        <DotsVerticalIcon className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-1.5 w-56 origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ring-1 ring-black/5 focus:outline-none">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-base font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <PencilIcon className="h-4 w-4 text-slate-500" />
            {statusInfo.key === "SUBMITTED"
              ? "Xem chi tiết"
              : "Chỉnh sửa chi tiết"}
          </button>
          {statusInfo.key !== "SUBMITTED" ? (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onSubmit();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-base font-medium text-emerald-800 hover:bg-emerald-50 transition-colors"
            >
              <CloudUploadIcon className="h-4 w-4 text-emerald-600" />
              Gửi BCA ngay
            </button>
          ) : (
            <p className="px-3 py-2 text-sm font-medium text-slate-500">
              Hồ sơ của lần lưu trú này đã gửi
            </p>
          )}
          {statusInfo.key === "REJECTED" && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onViewError();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-base font-medium text-rose-700 hover:bg-rose-50 transition-colors"
            >
              <AlertCircleIcon className="h-4 w-4 text-rose-500" />
              Xem lý do từ chối
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  const [activeTab, setActiveTab] = useState<"declarations" | "connection">(
    initialTab,
  );
  const [page, setPage] = useState(1);
  const limit = 50;

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [nationalityFilter, setNationalityFilter] = useState<string>("ALL");
  const [checkInDateFilter, setCheckInDateFilter] = useState<string>("");

  // Selection state
  const [selectedOccupantIds, setSelectedOccupantIds] = useState<Set<string>>(
    new Set(),
  );
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
      [boundResource, page],
    ),
  );

  const submitMutation = useMutation(boundResource.mutations.submit.options());

  const allRows = useMemo(
    () => declarationsQuery.data ?? [],
    [declarationsQuery.data],
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
  const selectedCount = selectableRows.filter((row) =>
    selectedOccupantIds.has(row.occupantId),
  ).length;
  const isAllSelected =
    selectableRows.length > 0 && selectedCount === selectableRows.length;

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedOccupantIds(new Set());
    } else {
      setSelectedOccupantIds(new Set(selectableRows.map((r) => r.occupantId)));
    }
  }, [isAllSelected, selectableRows]);

  const handleToggleRow = useCallback((row: KbttDeclarationListItem) => {
    if (!canSelectKbttDeclaration(row)) return;
    setSelectedOccupantIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.occupantId)) {
        next.delete(row.occupantId);
      } else {
        next.add(row.occupantId);
      }
      return next;
    });
  }, []);

  const unsubmittedCount = selectableRows.length;

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: boundResource.key });
  }, [boundResource, queryClient]);

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

  const handleBulkEdit = useCallback(() => {
    if (selectedCount === 0) {
      void showErrorAlert(
        "Thông báo",
        "Vui lòng chọn ít nhất một phòng để chỉnh sửa.",
      );
      return;
    }
    const firstSelected = selectableRows.find((r) =>
      selectedOccupantIds.has(r.occupantId),
    );
    if (firstSelected) {
      setSelectedOccupant(firstSelected);
    }
  }, [selectedCount, selectedOccupantIds, selectableRows]);

  const handleSubmitSelected = useCallback(async () => {
    if (selectedCount === 0) {
      await showErrorAlert(
        "Thông báo",
        "Vui lòng chọn ít nhất một phòng/khách để gửi BCA.",
      );
      return;
    }

    const selectedRows = selectableRows.filter((r) =>
      selectedOccupantIds.has(r.occupantId),
    );
    if (selectedRows.length === 0) {
      await showErrorAlert(
        "Thông báo",
        "Không còn hồ sơ chưa gửi trong lựa chọn.",
      );
      return;
    }
    const confirmResult = await showConfirmDialog({
      title: "Upload BCA đã chọn",
      text: `Bạn có chắc muốn gửi khai báo tạm trú cho ${selectedRows.length} khách đã chọn lên Cổng dịch vụ công Bộ Công an không?`,
      confirmText: "Gửi ngay",
      cancelText: "Hủy",
    });
    if (!confirmResult.isConfirmed) return;

    setIsSubmittingBatch(true);
    let successCount = 0;
    const errors: string[] = [];

    for (const row of selectedRows) {
      try {
        await submitMutation.mutateAsync({ occupantId: row.occupantId });
        successCount++;
      } catch (err) {
        const msg = errorText(err);
        errors.push(`Phòng ${row.roomNumber ?? "—"} (${row.fullName}): ${msg}`);
      }
    }

    setIsSubmittingBatch(false);
    handleRefresh();

    if (errors.length === 0) {
      await showSuccessAlert(
        "Gửi BCA thành công",
        `Đã gửi thành công khai báo tạm trú cho ${successCount} khách lên Bộ Công an.`,
      );
      setSelectedOccupantIds(new Set());
    } else {
      await showErrorAlert(
        "Kết quả gửi BCA",
        `Thành công: ${successCount}/${selectedRows.length} khách.\n\nLỗi:\n${errors.join("\n")}`,
      );
    }
  }, [
    selectedCount,
    selectedOccupantIds,
    selectableRows,
    submitMutation,
    handleRefresh,
  ]);

  const handleSubmitAll = useCallback(async () => {
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
    const errors: string[] = [];

    for (const row of unsubmittedRows) {
      try {
        await submitMutation.mutateAsync({ occupantId: row.occupantId });
        successCount++;
      } catch (err) {
        const msg = errorText(err);
        errors.push(`Phòng ${row.roomNumber ?? "—"} (${row.fullName}): ${msg}`);
      }
    }

    setIsSubmittingBatch(false);
    handleRefresh();

    if (errors.length === 0) {
      await showSuccessAlert(
        "Gửi BCA thành công",
        `Đã gửi thành công khai báo tạm trú cho toàn bộ ${successCount} khách lên Bộ Công an.`,
      );
      setSelectedOccupantIds(new Set());
    } else {
      await showErrorAlert(
        "Kết quả gửi BCA",
        `Thành công: ${successCount}/${unsubmittedRows.length} khách.\n\nLỗi:\n${errors.join("\n")}`,
      );
    }
  }, [selectableRows, submitMutation, handleRefresh]);

  const handleSubmitSingle = useCallback(
    async (row: KbttDeclarationListItem) => {
      if (!canSelectKbttDeclaration(row)) return;
      const confirmResult = await showConfirmDialog({
        title: "Gửi khai báo BCA",
        text: `Gửi khai báo tạm trú cho khách ${row.fullName} (Phòng ${row.roomNumber ?? "—"}) lên Cổng dịch vụ công Bộ Công an?`,
        confirmText: "Gửi ngay",
        cancelText: "Hủy",
      });
      if (!confirmResult.isConfirmed) return;

      try {
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
    [submitMutation, handleRefresh],
  );

  const handleViewError = useCallback(async (row: KbttDeclarationListItem) => {
    const message =
      row.declaration?.providerMessage ||
      "Chưa có thông tin chi tiết về phản hồi từ Cổng dịch vụ công Bộ Công an.";
    await showErrorAlert(
      `Lý do từ chối - Phòng ${row.roomNumber ?? "—"}`,
      message,
    );
  }, []);

  if (activeTab === "connection" && canConfigure) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 pb-16 pt-2 text-slate-900">
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
      className="mx-auto max-w-7xl space-y-6 pb-16 pt-2 text-slate-900"
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
            Chỉnh sửa thông tin nhiều phòng cùng lúc và gửi BCA hàng loạt. Mỗi
            dòng là một phòng đang lưu trú.
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
        <div className="relative flex-1 min-w-[240px]">
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

      {/* Batch Actions Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-800">
            Đã chọn {selectedCount}/{selectableRows.length} hồ sơ chưa gửi
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {filteredRows.length - selectableRows.length} hồ sơ đã gửi được khóa
            chọn
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleBulkEdit}
            disabled={selectedCount === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-600 bg-white px-4 py-2 text-base font-semibold text-emerald-800 shadow-xs hover:bg-emerald-50 disabled:opacity-40 transition-colors"
          >
            <PencilIcon className="h-4 w-4" />
            Chỉnh sửa hàng loạt
          </button>
          <button
            type="button"
            onClick={handleSubmitSelected}
            disabled={selectedCount === 0 || isSubmittingBatch}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-600 bg-white px-4 py-2 text-base font-semibold text-emerald-800 shadow-xs hover:bg-emerald-50 disabled:opacity-40 transition-colors"
          >
            <CloudUploadIcon className="h-4 w-4" />
            {isSubmittingBatch ? "Đang gửi..." : "Upload BCA đã chọn"}
          </button>
          <button
            type="button"
            onClick={handleSubmitAll}
            disabled={unsubmittedCount === 0 || isSubmittingBatch}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#064e3b] px-5 py-2 text-base font-semibold text-white shadow-xs hover:bg-[#043327] disabled:opacity-40 transition-colors"
          >
            <CloudUploadIcon className="h-4 w-4" />
            Upload tất cả ({unsubmittedCount})
          </button>
        </div>
      </div>

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
            ? "Không tìm thấy phòng hoặc khách phù hợp với bộ lọc."
            : "Chưa có khách đang check-in."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full min-w-[960px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-sm font-semibold text-slate-700">
                <th scope="col" className="w-12 px-4 py-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    disabled={selectableRows.length === 0 || isSubmittingBatch}
                    className="h-5 w-5 rounded border-slate-300 text-[#064e3b] focus:ring-[#064e3b] disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Chọn tất cả hồ sơ chưa gửi"
                  />
                </th>
                <th scope="col" className="w-14 px-3 py-3.5 text-center">
                  STT
                </th>
                <th scope="col" className="w-28 px-3 py-3.5">
                  Số phòng
                </th>
                <th scope="col" className="min-w-[200px] px-3 py-3.5">
                  Tên khách
                </th>
                <th scope="col" className="w-44 px-3 py-3.5">
                  Quốc tịch
                </th>
                <th scope="col" className="w-40 px-3 py-3.5">
                  Số giấy tờ
                </th>
                <th scope="col" className="w-36 px-3 py-3.5 text-center">
                  Trạng thái
                </th>
                <th scope="col" className="w-24 px-3 py-3.5 text-center">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-base">
              {filteredRows.map((row, idx) => {
                const statusInfo = getDeclarationStatus(row);
                const isSelectable = canSelectKbttDeclaration(row);
                const isChecked =
                  isSelectable && selectedOccupantIds.has(row.occupantId);

                return (
                  <tr
                    key={row.occupantId}
                    className={`transition-colors ${
                      isChecked
                        ? "bg-emerald-50/40"
                        : isSelectable
                          ? "hover:bg-slate-50/80"
                          : "bg-slate-50/70"
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleRow(row)}
                        disabled={!isSelectable || isSubmittingBatch}
                        title={
                          isSelectable
                            ? "Chọn hồ sơ của lần lưu trú này"
                            : "Hồ sơ của lần lưu trú này đã gửi BCA"
                        }
                        className="h-5 w-5 rounded border-slate-300 text-[#064e3b] focus:ring-[#064e3b] disabled:cursor-not-allowed disabled:opacity-25"
                        aria-label={
                          isSelectable
                            ? `Chọn phòng ${row.roomNumber ?? "—"}`
                            : `Phòng ${row.roomNumber ?? "—"} đã gửi BCA`
                        }
                      />
                    </td>

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
                      <div
                        onClick={() => setSelectedOccupant(row)}
                        title={
                          isSelectable
                            ? "Bấm để chỉnh sửa chi tiết"
                            : "Bấm để xem hồ sơ đã gửi"
                        }
                        className="flex min-h-10 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-base font-medium text-slate-900 transition-colors hover:border-[#064e3b] hover:bg-slate-50/50"
                      >
                        <span className="truncate">{row.fullName}</span>
                      </div>
                    </td>

                    {/* Quốc tịch */}
                    <td className="px-3 py-3">
                      <div className="flex min-h-10 items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-base text-slate-800">
                        <span className="truncate">
                          {formatNationality(row)}
                        </span>
                        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </div>
                    </td>

                    {/* Số giấy tờ */}
                    <td className="px-3 py-3">
                      <div className="flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-base text-slate-800">
                        <span className="truncate">
                          {row.identityNumber || "—"}
                        </span>
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex whitespace-nowrap items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold shadow-2xs ${statusInfo.badgeClass}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${statusInfo.dotColor}`}
                        />
                        {statusInfo.label}
                      </span>
                    </td>

                    {/* Thao tác */}
                    <td className="px-3 py-3 text-center">
                      <RowActionMenu
                        statusInfo={statusInfo}
                        onEdit={() => setSelectedOccupant(row)}
                        onSubmit={() => handleSubmitSingle(row)}
                        onViewError={() => handleViewError(row)}
                        disabled={isSubmittingBatch}
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
      <footer className="flex flex-col gap-4 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base text-slate-600">
          Hiển thị {filteredRows.length} / {allRows.length} phòng
        </p>
        <div className="flex items-center gap-3">
          <span className="text-base text-slate-600">Trang {page}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || declarationsQuery.isFetching}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
              aria-label="Trang trước"
            >
              &lt;
            </button>
            <button
              type="button"
              disabled={allRows.length < limit || declarationsQuery.isFetching}
              onClick={() => setPage((value) => value + 1)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
              aria-label="Trang sau"
            >
              &gt;
            </button>
          </div>
        </div>
      </footer>

      {/* Detail Edit Modal */}
      {selectedOccupant && (
        <DeclarationModal
          hotelId={hotelId}
          occupantId={selectedOccupant.occupantId}
          occupantSummary={selectedOccupant}
          canManage={canManage}
          onClose={() => setSelectedOccupant(null)}
          onUpdated={handleRefresh}
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
  onClose,
  onUpdated,
}: {
  hotelId: string;
  occupantId: string;
  occupantSummary: KbttDeclarationListItem;
  canManage: boolean;
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
    typeof baseFormData.maTT === "string"
      ? baseFormData.maTT
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    if (detailQuery.data?.declaration?.status === "SUBMITTED") return;
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
        body: { citizenshipKind, data: formatKbttDraftForProvider(formData) },
      });
      await submitMutation.mutateAsync({ occupantId });
      await showSuccessAlert(
        "Khai báo tạm trú",
        "Bộ Công an đã tiếp nhận hồ sơ.",
      );
      onUpdated();
      onClose();
    } catch (error) {
      await showErrorAlert("Bộ Công an từ chối hồ sơ", errorText(error));
      onUpdated();
    }
  };

  const isBusy = saveMutation.isPending || submitMutation.isPending;
  const isAlreadySubmitted =
    detailQuery.data?.declaration?.status === "SUBMITTED";

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
                      <option value="">Chọn tỉnh/thành phố</option>
                      {(provincesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.nameVi}
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
                      <option value="">Chọn phường/xã</option>
                      {(wardsQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.code}>
                          {item.nameVi}
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

              {canManage && !isAlreadySubmitted ? (
                <button
                  type="submit"
                  disabled={isBusy}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#064e3b] px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-[#043327] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] disabled:opacity-50"
                >
                  {isBusy ? "Đang gửi…" : "Gửi lên Bộ Công an"}
                </button>
              ) : isAlreadySubmitted ? (
                <span className="inline-flex min-h-12 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-base font-semibold text-emerald-800">
                  Hồ sơ của lần lưu trú này đã gửi BCA
                </span>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
