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
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
} from "@/libs/swal";

import { kbttResource } from "../resources/kbtt-resource";
import {
  canSubmitStay,
  kbttErrorCode,
  sanitizeErrorMessage,
  type CitizenshipKind,
  type KbttCatalogItem,
  type KbttDeclarationListItem,
  type SaveKbttDraftPayload,
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
    const code = kbttErrorCode(error.data);
    if (code) return sanitizeErrorMessage(code);
    if (error.data && typeof error.data === "object") {
      const dataObj = error.data as Record<string, unknown>;
      if (typeof dataObj.detail === "string")
        return sanitizeErrorMessage(dataObj.detail);
      if (typeof dataObj.message === "string")
        return sanitizeErrorMessage(dataObj.message);
    }
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

function formatDisplayDateTime(dateTimeStr: string | null): string {
  if (!dateTimeStr) return "Chưa cập nhật";
  const d = new Date(dateTimeStr);
  if (Number.isNaN(d.getTime())) return dateTimeStr;
  const time = d.toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = d.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${time} ${date}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "READY":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Sẵn sàng gửi
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Bản nháp
        </span>
      );
    case "SUBMITTED":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-900">
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          Đã gửi BCA
        </span>
      );
    case "SENDING":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
          Đang gửi
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-800">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Lỗi khai báo
        </span>
      );
    case "UNKNOWN":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Chưa rõ kết quả
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          Đã hủy
        </span>
      );
    case "MISSING_PROFILE":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          Chưa tạo bản nháp
        </span>
      );
  }
}

export function KbttDeclarationsPage({
  hotelId,
  canManage,
}: {
  hotelId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 50;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOccupant, setSelectedOccupant] =
    useState<KbttDeclarationListItem | null>(null);
  const [submittingStayId, setSubmittingStayId] = useState<string | null>(null);
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
  const submitStayMutation = useMutation(
    boundResource.mutations.submitStay.options(),
  );
  const allRows = useMemo(
    () => declarationsQuery.data ?? [],
    [declarationsQuery.data],
  );
  const pageStayCount = useMemo(
    () => new Set(allRows.map((row) => row.stayId)).size,
    [allRows],
  );
  const roomGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const grouped = new Map<string, KbttDeclarationListItem[]>();
    for (const row of allRows) {
      const haystack =
        `${row.roomNumber ?? ""} ${row.fullName} ${row.identityNumber ?? ""}`.toLowerCase();
      if (q && !haystack.includes(q)) continue;
      const guests = grouped.get(row.stayId) ?? [];
      guests.push(row);
      grouped.set(row.stayId, guests);
    }
    return [...grouped.entries()].map(([stayId, guests]) => ({
      stayId,
      roomNumber: guests[0]?.roomNumber ?? null,
      guests,
    }));
  }, [allRows, searchQuery]);

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: boundResource.key });
  }, [boundResource, queryClient]);

  const handleSubmitStay = useCallback(
    async (
      stayId: string,
      roomNumber: string | null,
      guests: KbttDeclarationListItem[],
    ) => {
      if (!canSubmitStay(guests, canManage)) return;
      const confirm = await showConfirmDialog({
        title: `Gửi toàn bộ ${guests.length} khách phòng ${roomNumber ?? "chưa xếp"}?`,
        text: "Hệ thống sẽ gửi toàn bộ danh sách khách đang check-in trong phòng và tự phân tuyến API 4/5 theo quốc tịch. Hồ sơ chưa sẵn sàng hoặc chưa rõ kết quả sẽ chặn toàn bộ thao tác.",
        confirmText: "Gửi toàn bộ khách",
        cancelText: "Hủy",
        icon: "warning",
      });
      if (!confirm.isConfirmed) return;
      try {
        setSubmittingStayId(stayId);
        const result = await submitStayMutation.mutateAsync({ stayId });
        await showSuccessAlert(
          "Khai báo tạm trú",
          `Đã gửi ${result.submittedCount} khách phòng ${roomNumber ?? ""} thành công.`,
        );
        handleRefresh();
      } catch (error) {
        await showErrorAlert("Gửi danh sách phòng thất bại", errorText(error));
        handleRefresh();
      } finally {
        setSubmittingStayId(null);
      }
    },
    [canManage, handleRefresh, submitStayMutation],
  );

  return (
    <div
      className="mx-auto max-w-7xl space-y-6 pb-16 pt-2 text-slate-900"
      aria-labelledby="declarations-title"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
            KHÁCH ĐANG CHECK-IN
          </p>
          <h1
            id="declarations-title"
            className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          >
            Khai báo tạm trú theo phòng
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Mỗi phòng hiển thị toàn bộ khách đang lưu trú. Hoàn thiện từng hồ
            sơ, sau đó gửi cả phòng một lần.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={declarationsQuery.isFetching}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-base font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60"
        >
          {declarationsQuery.isFetching ? "Đang tải…" : "Làm mới"}
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="w-full sm:max-w-md">
          <span className="sr-only">
            Tìm theo phòng, tên khách hoặc giấy tờ
          </span>
          <input
            type="search"
            placeholder="Tìm theo phòng, tên khách hoặc giấy tờ..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base outline-none focus:border-[#064e3b] focus:ring-2 focus:ring-[#064e3b]/15"
          />
        </label>
        <p className="text-sm font-medium text-slate-500">
          {roomGroups.length} phòng · {allRows.length} khách
        </p>
      </div>

      {declarationsQuery.isPending ? (
        <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center text-slate-500 shadow-xs">
          Đang tải danh sách khách…
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
      ) : roomGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">
          {searchQuery
            ? "Không tìm thấy phòng hoặc khách phù hợp."
            : "Chưa có khách đang check-in."}
        </div>
      ) : (
        <div className="space-y-5">
          {roomGroups.map(({ stayId, roomNumber, guests }) => {
            const readyToSubmit = canSubmitStay(guests, canManage);
            const unresolved = guests.filter((guest) =>
              [
                "MISSING_PROFILE",
                "DRAFT",
                "SENDING",
                "UNKNOWN",
                "CANCELLED",
              ].includes(guest.derivedStatus),
            ).length;
            return (
              <section
                key={stayId}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
              >
                <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Phòng {roomNumber ?? "chưa xếp"}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {guests.length} khách đang check-in
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      disabled={!readyToSubmit || submittingStayId === stayId}
                      onClick={() =>
                        handleSubmitStay(stayId, roomNumber, guests)
                      }
                      className="min-h-11 rounded-xl bg-emerald-700 px-5 text-base font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {submittingStayId === stayId
                        ? "Đang gửi…"
                        : `Gửi toàn bộ ${guests.length} khách`}
                    </button>
                  )}
                  {!readyToSubmit && unresolved > 0 && (
                    <p className="text-sm font-medium text-amber-700">
                      Còn {unresolved} hồ sơ cần hoàn thiện hoặc đối soát.
                    </p>
                  )}
                </header>
                <ul className="divide-y divide-slate-100">
                  {guests.map((guest) => (
                    <li
                      key={guest.occupantId}
                      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900">
                            {guest.fullName}
                          </h3>
                          <StatusBadge status={guest.derivedStatus} />
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {guest.citizenshipKind === "FOREIGN"
                            ? `Nước ngoài${guest.nationality ? ` · ${guest.nationality}` : ""}`
                            : guest.citizenshipKind === "VIETNAMESE"
                              ? "Việt Nam"
                              : "Chưa phân loại quốc tịch"}
                          {guest.identityNumber
                            ? ` · ${guest.identityNumber}`
                            : " · Chưa có giấy tờ"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedOccupant(guest)}
                        className="min-h-11 shrink-0 rounded-xl bg-[#064e3b] px-4 text-base font-semibold text-white hover:bg-[#043327]"
                      >
                        {guest.derivedStatus === "MISSING_PROFILE"
                          ? "Khai báo thông tin"
                          : "Xem / Chỉnh sửa hồ sơ"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-slate-200 pt-4">
        <p className="text-base text-slate-600">Trang {page}</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || declarationsQuery.isFetching}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="min-h-11 rounded-xl border bg-white px-4 disabled:opacity-50"
          >
            Trang trước
          </button>
          <button
            type="button"
            disabled={pageStayCount < limit || declarationsQuery.isFetching}
            onClick={() => setPage((value) => value + 1)}
            className="min-h-11 rounded-xl border bg-white px-4 disabled:opacity-50"
          >
            Trang sau
          </button>
        </div>
      </footer>

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
  const readyMutation = useMutation(
    boundResource.mutations.markReady.options(),
  );

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
    return initial;
  }, [detailQuery.data, initialKind, occupantSummary.roomNumber]);
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

  const handleSaveDraft = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!canManage) return;
    if (!citizenshipKind) {
      await showErrorAlert(
        "Chưa xác định quốc tịch",
        "Giấy tờ chưa đủ dữ liệu để tự phân loại. Vui lòng chọn loại quốc tịch.",
      );
      return;
    }

    try {
      const payload: SaveKbttDraftPayload = {
        citizenshipKind,
        data: formData,
      };
      await saveMutation.mutateAsync({ occupantId, body: payload });
      await showSuccessAlert("Khai báo tạm trú", "Đã lưu bản nháp thành công.");
      onUpdated();
    } catch (error) {
      await showErrorAlert("Lưu bản nháp thất bại", errorText(error));
    }
  };

  const handleMarkReady = async () => {
    if (!canManage) return;
    if (!citizenshipKind) {
      await showErrorAlert(
        "Chưa xác định quốc tịch",
        "Giấy tờ chưa đủ dữ liệu để tự phân loại. Vui lòng chọn loại quốc tịch.",
      );
      return;
    }

    const confirm = await showConfirmDialog({
      title: "Đánh dấu hồ sơ sẵn sàng?",
      text: "Hệ thống sẽ kiểm tra toàn bộ các trường bắt buộc của Bộ Công an. Sau khi sẵn sàng, hồ sơ đủ điều kiện để kết xuất gửi cơ quan quản lý.",
      confirmText: "Đánh dấu sẵn sàng",
      cancelText: "Hủy",
      icon: "question",
    });
    if (!confirm.isConfirmed) return;

    try {
      // First save any recent changes
      const payload: SaveKbttDraftPayload = {
        citizenshipKind,
        data: formData,
      };
      await saveMutation.mutateAsync({ occupantId, body: payload });

      // Then mark ready
      await readyMutation.mutateAsync({ occupantId });
      await showSuccessAlert(
        "Khai báo tạm trú",
        "Hồ sơ đã được kiểm tra hợp lệ và chuyển sang trạng thái SẴN SÀNG.",
      );
      onUpdated();
      onClose();
    } catch (error) {
      await showErrorAlert("Chưa đủ điều kiện sẵn sàng", errorText(error));
    }
  };

  const isBusy = saveMutation.isPending || readyMutation.isPending;
  const declStatus =
    detailQuery.data?.declaration?.status ?? occupantSummary.derivedStatus;
  const isEditable = ["DRAFT", "READY", "FAILED", "MISSING_PROFILE"].includes(
    declStatus,
  );

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
              <StatusBadge status={declStatus} />
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
          <form onSubmit={handleSaveDraft} className="space-y-6">
            {declStatus === "UNKNOWN" && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                <p className="font-semibold">
                  Hồ sơ đang ở trạng thái chưa rõ kết quả (UNKNOWN)
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  Hệ thống không thể xác định kết quả từ phía Bộ Công an. Vì lý
                  do an toàn dữ liệu, hồ sơ không thể gửi lại hoặc sửa đổi trực
                  tiếp. Vui lòng liên hệ hỗ trợ kỹ thuật hoặc đối soát với cơ
                  quan quản lý.
                </p>
              </div>
            )}
            {declStatus === "SUBMITTED" && (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
                <p className="font-semibold">
                  Hồ sơ đã được gửi thành công lên Bộ Công an
                </p>
                <p className="mt-1 text-sm text-emerald-800">
                  Thời gian gửi:{" "}
                  {formatDisplayDateTime(
                    detailQuery.data?.declaration?.submittedAt ?? null,
                  )}
                  . Hồ sơ ở trạng thái ĐÃ GỬI không thể sửa đổi trực tiếp.
                </p>
              </div>
            )}

            {/* Citizenship is inferred from scanned check-in data. Manual selection is fallback-only. */}
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
                {isEditable && canManage ? (
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
                  disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      Ngày sinh (YYYY-MM-DD){" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="ngayThangNamSinhStr"
                      type="text"
                      required
                      placeholder="1990-01-15"
                      value={String(formData.ngayThangNamSinhStr ?? "")}
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.ngayDenCsltStr ?? "")}
                      disabled={!isEditable || !canManage}
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
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.ngayDiDuKienStr ?? "")}
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage || !provinceCode}
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
                      disabled={!isEditable || !canManage}
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
                    disabled={!isEditable || !canManage}
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
                    disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
                      onChange={(e) =>
                        updateField("loaiNgayThangNamSinh", e.target.value)
                      }
                      className={selectClass}
                    >
                      <option value="D">D - Đầy đủ ngày/tháng/năm</option>
                      <option value="Y">
                        Y - Chỉ có năm sinh (YYYY-01-01)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="f-ngayThangNamSinhStr"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Ngày sinh (YYYY-MM-DD){" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="f-ngayThangNamSinhStr"
                      type="text"
                      required
                      placeholder={
                        formData.loaiNgayThangNamSinh === "Y"
                          ? "1985-01-01"
                          : "1985-06-20"
                      }
                      value={String(formData.ngayThangNamSinhStr ?? "")}
                      disabled={!isEditable || !canManage}
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
                      disabled={!isEditable || !canManage}
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
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.thoiHanTamTruStr ?? "")}
                      disabled={!isEditable || !canManage}
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
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.ngayDenCsltStr ?? "")}
                      disabled={!isEditable || !canManage}
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
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={String(formData.ngayDiDuKienStr ?? "")}
                      disabled={!isEditable || !canManage}
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

              {canManage && isEditable && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-bold text-slate-800 shadow-xs transition-all hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] disabled:opacity-50"
                  >
                    {saveMutation.isPending && (
                      <svg
                        className="h-4 w-4 animate-spin text-slate-600"
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
                    )}
                    Lưu bản nháp
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleMarkReady}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#064e3b] px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-[#043327] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#064e3b] disabled:opacity-50"
                  >
                    {readyMutation.isPending && (
                      <svg
                        className="h-4 w-4 animate-spin text-white"
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
                    )}
                    Đánh dấu sẵn sàng
                  </button>
                </div>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
