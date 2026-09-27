"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { SwalVietSage } from "@/libs/swal";
import { localMateAdminResource } from "../resource";
import {
  PROVINCE_MAP,
  PROVINCES,
  REGION_MAP,
  TOUR_SCOPE_MAP,
  TOUR_SCOPES,
  detectProvinceFromDestination,
  normalizeTourDuration,
  type RegionCode,
} from "../constants/geography";
import { LocalMateGeographyNav } from "./localmate-geography-nav";
import type {
  CreateLocalMateTourInput,
  LocalMateTourKnowledge,
  LocalMateTourScope,
  UpdateLocalMateTourInput,
} from "../types";

/**
 * Trích xuất vĩ độ (lat) và kinh độ (lng) từ các định dạng URL Google Maps hoặc chuỗi tọa độ
 */
export function extractLatLngFromGoogleMapsUrl(input: string): { lat: string; lng: string } | null {
  if (!input) return null;
  const str = input.trim();

  // 1. Dạng tọa độ thuần: "21.033333, 104.883333" hoặc "21.033333,104.883333"
  const directMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (directMatch) {
    return { lat: directMatch[1], lng: directMatch[2] };
  }

  // 2. Dạng @lat,lng trong URL Google Maps (/maps/place/.../@21.033333,104.883333,15z/...)
  const atMatch = str.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return { lat: atMatch[1], lng: atMatch[2] };
  }

  // 3. Dạng query parameter (?q=lat,lng hoặc &query=lat,lng hoặc &ll=lat,lng)
  const queryMatch = str.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (queryMatch) {
    return { lat: queryMatch[1], lng: queryMatch[2] };
  }

  // 4. Dạng Protobuf trong URL Google Maps (!3d<lat>!4d<lng>)
  const protoMatch = str.match(/!3d(-?\d+(?:\.\d+)?)[^!]*!4d(-?\d+(?:\.\d+)?)/);
  if (protoMatch) {
    return { lat: protoMatch[1], lng: protoMatch[2] };
  }

  // 5. Chuỗi chứa cặp số lat,lng ở bất kỳ đâu trong URL
  const anyCoordsMatch = str.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (anyCoordsMatch) {
    return { lat: anyCoordsMatch[1], lng: anyCoordsMatch[2] };
  }

  return null;
}

type TourFormData = {
  tourCode: string;
  title: string;
  provinceCode: string;
  province: string;
  tourScope: LocalMateTourScope | "";
  duration: string;
  highlights: string;
  content: string;
  latitude: string;
  longitude: string;
};

export const TOUR_DURATION_PRESETS = [
  { label: "1 Ngày", d: 1, n: 0 },
  { label: "2N1Đ", d: 2, n: 1 },
  { label: "3N2Đ", d: 3, n: 2 },
  { label: "4N3Đ", d: 4, n: 3 },
  { label: "5N4Đ", d: 5, n: 4 },
  { label: "Nửa ngày", d: 0.5, n: 0 },
] as const;

/**
 * Tách chuỗi thời lượng tour thành số ngày và số đêm
 */
export function parseDurationToDaysNights(raw?: string): { days: number | string; nights: number | string } {
  if (!raw) return { days: 1, nights: 0 };
  const trimmed = raw.trim();

  // Pattern like: 0,5N or 0.5N or 0,5 ngày or nửa ngày
  if (/^0[.,]5\s*(n|ng[aà]y)?$/i.test(trimmed) || /^n[uử]a\s*ng[aà]y$/i.test(trimmed)) {
    return { days: 0.5, nights: 0 };
  }

  // Pattern like: 2N1Đ, 2N1D, 2n1d, 3N2Đ
  const ndMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*[nN]\s*(\d+)\s*[đĐdD]$/i);
  if (ndMatch) {
    return {
      days: parseFloat(ndMatch[1].replace(",", ".")),
      nights: parseInt(ndMatch[2], 10),
    };
  }

  // Pattern like "2 ngày 1 đêm", "2 ngay 1 dem", "2 Ngày 1 Đêm"
  const textNdMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*ng[aà]y\s*(\d+)\s*[đd][eê]m$/i);
  if (textNdMatch) {
    return {
      days: parseFloat(textNdMatch[1].replace(",", ".")),
      nights: parseInt(textNdMatch[2], 10),
    };
  }

  // Pattern like: 1N, 2N, 3N (without night specified)
  const nOnlyMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*[nN]$/i);
  if (nOnlyMatch) {
    return {
      days: parseFloat(nOnlyMatch[1].replace(",", ".")),
      nights: 0,
    };
  }

  // Pattern like "1 ngày", "2 ngày"
  const textNMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*ng[aà]y$/i);
  if (textNMatch) {
    return {
      days: parseFloat(textNMatch[1].replace(",", ".")),
      nights: 0,
    };
  }

  // Pattern like "1 đêm", "2 đêm"
  const textNightOnly = trimmed.match(/^(\d+)\s*[đd][eê]m$/i);
  if (textNightOnly) {
    return {
      days: 0,
      nights: parseInt(textNightOnly[1], 10),
    };
  }

  return { days: 1, nights: 0 };
}

/**
 * Tạo chuỗi hiển thị thời lượng chuẩn hóa từ số ngày và số đêm
 */
export function formatDaysNightsToDuration(days: number | string, nights: number | string): string {
  const dStr = String(days ?? "").trim();
  const nStr = String(nights ?? "").trim();

  if (dStr === "" && nStr === "") return "";

  const d = dStr === "" ? 0 : parseFloat(dStr.replace(",", "."));
  const n = nStr === "" ? 0 : parseInt(nStr, 10);

  if (isNaN(d) && isNaN(n)) return "";

  if (d === 0.5 && (!n || n === 0)) {
    return "Nửa Ngày";
  }

  if (d > 0 && n > 0) {
    return `${d} Ngày ${n} Đêm`;
  }
  if (d > 0 && (!n || n === 0)) {
    return `${d} Ngày`;
  }
  if ((!d || d === 0) && n > 0) {
    return `${n} Đêm`;
  }
  if (d === 0 && n === 0) {
    return "Trong ngày";
  }

  return `${d} Ngày`;
}

const initialFormData: TourFormData = {
  tourCode: "",
  title: "",
  provinceCode: "",
  province: "",
  tourScope: "",
  duration: "",
  highlights: "",
  content: "",
  latitude: "",
  longitude: "",
};

export function LocalMateKnowledgeView() {
  // Cascading Geography & Classification Filters
  const [regionFilter, setRegionFilter] = useState<"ALL" | RegionCode>("ALL");
  const [provinceFilter, setProvinceFilter] = useState("ALL");
  const [scopeFilter, setScopeFilter] = useState("ALL");
  const [durationFilter, setDurationFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectProvince = (provCode: string) => {
    setProvinceFilter(provCode);
    if (provCode === "ALL") {
      setRegionFilter("ALL");
    } else {
      const tax = PROVINCE_MAP[provCode];
      if (tax?.regionCode) {
        setRegionFilter(tax.regionCode);
      }
    }
    setCurrentPage(1);
  };

  const handleSelectRegion = (reg: "ALL" | RegionCode) => {
    setRegionFilter(reg);
    setProvinceFilter("ALL");
    setCurrentPage(1);
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Form modal state (Create / Edit)
  const [isTourModalOpen, setIsTourModalOpen] = useState(false);
  const [editingTourId, setEditingTourId] = useState<string | null>(null);
  const [tourFormData, setTourFormData] = useState<TourFormData>(initialFormData);
  const [durationDays, setDurationDays] = useState<number | string>(1);
  const [durationNights, setDurationNights] = useState<number | string>(0);
  const [mapsUrlInput, setMapsUrlInput] = useState("");

  // Query
  const resource = localMateAdminResource.bind({});
  const { data, isLoading, isError, refetch } = useQuery(
    resource.queries.data.options(undefined as never),
  );

  // Tour Mutations
  const createTourMutation = useMutation(resource.mutations.createTour.options());
  const updateTourMutation = useMutation(resource.mutations.updateTour.options());
  const deleteTourMutation = useMutation(resource.mutations.deleteTour.options());

  const tours: LocalMateTourKnowledge[] = useMemo(() => data?.tours ?? [], [data?.tours]);

  // Covered provinces count
  const coveredProvincesCount = useMemo(() => {
    const pCodes = new Set<string>();
    for (const t of tours) {
      const detected = detectProvinceFromDestination(t.title);
      const code = t.provinceCode || detected?.code;
      if (code) pCodes.add(code);
    }
    return pCodes.size;
  }, [tours]);

  // Unique durations
  const durations = useMemo(() => {
    const set = new Set<string>();
    for (const t of tours) {
      if (t.duration) set.add(normalizeTourDuration(t.duration));
    }
    return Array.from(set).sort();
  }, [tours]);

  // Filtered tours
  const filteredTours = useMemo(() => {
    return tours.filter((t) => {
      const detected = detectProvinceFromDestination(t.title);
      const tourProvCode = t.provinceCode || detected?.code || "";
      const tourProvName = t.province || (tourProvCode ? PROVINCE_MAP[tourProvCode]?.name : detected?.name) || "";
      const tourScope = t.tourScope;

      const tourTax = tourProvCode ? PROVINCE_MAP[tourProvCode] : undefined;
      const tourRegCode = tourTax?.regionCode;

      const matchesRegion = regionFilter === "ALL" || tourRegCode === regionFilter;
      const matchesProvince = provinceFilter === "ALL" || tourProvCode === provinceFilter;
      const matchesScope =
        scopeFilter === "ALL" ||
        (scopeFilter === "LOCAL"
          ? tourScope === "LOCAL" || tourScope === "REGIONAL_DAYTRIP"
          : tourScope === scopeFilter);
      const tourDurationNorm = normalizeTourDuration(t.duration);
      const matchesDuration =
        durationFilter === "ALL" ||
        tourDurationNorm === durationFilter ||
        t.duration === durationFilter;

      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.tourCode.toLowerCase().includes(q) ||
        tourProvName.toLowerCase().includes(q) ||
        (t.highlights && t.highlights.some((h) => h.toLowerCase().includes(q)));

      return matchesRegion && matchesProvince && matchesScope && matchesDuration && matchesQuery;
    });
  }, [tours, regionFilter, provinceFilter, scopeFilter, durationFilter, searchQuery]);

  // Check if any filter is active
  const hasActiveFilters =
    regionFilter !== "ALL" ||
    provinceFilter !== "ALL" ||
    scopeFilter !== "ALL" ||
    durationFilter !== "ALL" ||
    searchQuery.trim().length > 0;

  const handleClearFilters = () => {
    setRegionFilter("ALL");
    setProvinceFilter("ALL");
    setScopeFilter("ALL");
    setDurationFilter("ALL");
    setSearchQuery("");
    setCurrentPage(1);
  };

  // Pagination calculation
  const totalItems = filteredTours.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTours = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredTours.slice(start, start + pageSize);
  }, [filteredTours, safeCurrentPage, pageSize]);

  // Handle changes for Days and Nights
  const handleDaysChange = (newDays: string) => {
    setDurationDays(newDays);
    const formatted = formatDaysNightsToDuration(newDays, durationNights);
    setTourFormData((prev) => ({ ...prev, duration: formatted }));
  };

  const handleNightsChange = (newNights: string) => {
    setDurationNights(newNights);
    const formatted = formatDaysNightsToDuration(durationDays, newNights);
    setTourFormData((prev) => ({ ...prev, duration: formatted }));
  };

  const handleSelectPreset = (d: number, n: number) => {
    setDurationDays(d);
    setDurationNights(n);
    const formatted = formatDaysNightsToDuration(d, n);
    setTourFormData((prev) => ({ ...prev, duration: formatted }));
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingTourId(null);
    setDurationDays(1);
    setDurationNights(0);
    setMapsUrlInput("");
    setTourFormData({
      ...initialFormData,
      tourCode: `HVNT-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear().toString().slice(-2)}`,
      duration: "1 Ngày",
    });
    setIsTourModalOpen(true);
  };

  // Open Edit Modal with auto-mapping
  const handleOpenEditModal = (tour: LocalMateTourKnowledge) => {
    const detected = detectProvinceFromDestination(tour.title);
    const provCode = tour.provinceCode || detected?.code || "";
    const provName =
      tour.province ||
      (provCode ? PROVINCE_MAP[provCode]?.name : detected?.name) ||
      "";

    const normalizedDur = normalizeTourDuration(tour.duration);
    const parsed = parseDurationToDaysNights(tour.duration);
    setDurationDays(parsed.days);
    setDurationNights(parsed.nights);
    setMapsUrlInput("");

    setEditingTourId(tour.id);
    setTourFormData({
      tourCode: tour.tourCode,
      title: tour.title,
      provinceCode: provCode,
      province: provName,
      tourScope: tour.tourScope || "",
      duration: normalizedDur || formatDaysNightsToDuration(parsed.days, parsed.nights),
      highlights: (tour.highlights || []).join(", "),
      content: tour.content,
      latitude: tour.latitude == null ? "" : String(tour.latitude),
      longitude: tour.longitude == null ? "" : String(tour.longitude),
    });
    setIsTourModalOpen(true);
  };

  // Duplicate Tour
  const handleDuplicateTour = (tour: LocalMateTourKnowledge) => {
    const detected = detectProvinceFromDestination(tour.title);
    const provCode = tour.provinceCode || detected?.code || "";
    const provName =
      tour.province ||
      (provCode ? PROVINCE_MAP[provCode]?.name : detected?.name) ||
      "";

    const normalizedDur = normalizeTourDuration(tour.duration);
    const parsed = parseDurationToDaysNights(tour.duration);
    setDurationDays(parsed.days);
    setDurationNights(parsed.nights);
    setMapsUrlInput("");

    setEditingTourId(null);
    setTourFormData({
      tourCode: `${tour.tourCode}-COPY`,
      title: `${tour.title} (Bản sao)`,
      provinceCode: provCode,
      province: provName,
      tourScope: tour.tourScope || "",
      duration: normalizedDur || formatDaysNightsToDuration(parsed.days, parsed.nights),
      highlights: (tour.highlights || []).join(", "),
      content: tour.content,
      latitude: tour.latitude == null ? "" : String(tour.latitude),
      longitude: tour.longitude == null ? "" : String(tour.longitude),
    });
    setIsTourModalOpen(true);
  };

  // Check if tour coordinates are valid for minimap preview
  const hasValidCoordinates = useMemo(() => {
    if (!tourFormData.latitude.trim() || !tourFormData.longitude.trim()) return false;
    const lat = Number(tourFormData.latitude);
    const lng = Number(tourFormData.longitude);
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }, [tourFormData.latitude, tourFormData.longitude]);

  // Save Tour (Create or Update)
  const handleSaveTour = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !tourFormData.title.trim() ||
      !tourFormData.duration.trim() ||
      !tourFormData.content.trim()
    ) {
      await SwalVietSage.fire({
        title: "Thiếu thông tin",
        text: "Vui lòng nhập đầy đủ Tên tour, Thời lượng và Nội dung chi tiết.",
        icon: "warning",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    const highlightsArray = tourFormData.highlights
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const detected = detectProvinceFromDestination(tourFormData.title);
    const resolvedProvCode =
      tourFormData.provinceCode.trim() || detected?.code || undefined;
    const resolvedProvName =
      tourFormData.province.trim() ||
      (resolvedProvCode ? PROVINCE_MAP[resolvedProvCode]?.name : detected?.name) ||
      undefined;
    const hasLatitude = tourFormData.latitude.trim() !== "";
    const hasLongitude = tourFormData.longitude.trim() !== "";
    const latitude = Number(tourFormData.latitude);
    const longitude = Number(tourFormData.longitude);
    if (
      hasLatitude !== hasLongitude ||
      (hasLatitude &&
        (!Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180))
    ) {
      await SwalVietSage.fire({
        title: "Tọa độ chưa hợp lệ",
        text: "Vui lòng nhập đủ vĩ độ (-90 đến 90) và kinh độ (-180 đến 180).",
        icon: "warning",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }
    const coordinates = hasLatitude
      ? { latitude, longitude }
      : editingTourId
        ? { latitude: null, longitude: null }
        : {};

    try {
      const canonicalDuration = normalizeTourDuration(tourFormData.duration.trim());

      if (editingTourId) {
        const payload: UpdateLocalMateTourInput = {
          tourCode: tourFormData.tourCode.trim() || undefined,
          title: tourFormData.title.trim(),
          provinceCode: resolvedProvCode,
          province: resolvedProvName,
          tourScope: (tourFormData.tourScope as LocalMateTourScope) || undefined,
          duration: canonicalDuration,
          highlights: highlightsArray,
          content: tourFormData.content.trim(),
          ...coordinates,
        };

        await updateTourMutation.mutateAsync({
          tourId: editingTourId,
          input: payload,
        });

        await SwalVietSage.fire({
          title: "Cập nhật thành công!",
          text: `Đã cập nhật lịch trình tour "${tourFormData.title.trim()}".`,
          icon: "success",
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
      } else {
        const payload: CreateLocalMateTourInput = {
          tourCode: tourFormData.tourCode.trim() || undefined,
          title: tourFormData.title.trim(),
          provinceCode: resolvedProvCode,
          province: resolvedProvName,
          tourScope: (tourFormData.tourScope as LocalMateTourScope) || undefined,
          duration: canonicalDuration,
          highlights: highlightsArray,
          content: tourFormData.content.trim(),
          ...coordinates,
        };

        await createTourMutation.mutateAsync({ input: payload });

        await SwalVietSage.fire({
          title: "Thêm thành công!",
          text: `Đã thêm mới lịch trình tour "${tourFormData.title.trim()}".`,
          icon: "success",
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
      }

      setIsTourModalOpen(false);
      setEditingTourId(null);
      setTourFormData(initialFormData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Có lỗi xảy ra khi lưu lịch trình tour.";
      await SwalVietSage.fire({
        title: "Lưu thất bại",
        text: msg,
        icon: "error",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  };

  // Delete Tour
  const handleDeleteTour = async (tour: LocalMateTourKnowledge) => {
    const confirmResult = await SwalVietSage.fire({
      title: "Xoá lịch trình tour?",
      text: `Bạn có chắc muốn xoá lịch trình "${tour.title}" (${tour.tourCode})? Hành động này không thể hoàn tác.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Xoá tour",
      cancelButtonText: "Hủy",
      reverseButtons: false,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await deleteTourMutation.mutateAsync({ tourId: tour.id });
      await SwalVietSage.fire({
        title: "Đã xoá!",
        text: `Đã xoá thành công lịch trình tour ${tour.tourCode}.`,
        icon: "success",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi khi xoá lịch trình tour.";
      await SwalVietSage.fire({
        title: "Xoá thất bại",
        text: msg,
        icon: "error",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  };

  const isSaving = createTourMutation.isPending || updateTourMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-1">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-800 text-white shadow-xs">
              <VsIcon name="menu_book" className="text-2xl" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
                Kho tri thức Tour AI
              </h1>
              <p className="mt-0.5 text-xs sm:text-sm text-stone-500 max-w-2xl leading-relaxed">
                Quản lý các chương trình tour, phân cấp địa lý Tỉnh / Thành và dữ liệu gợi ý cho trợ lý LocalMate AI.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4.5 text-base font-semibold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <VsIcon name="add" className="text-lg" />
          <span>Thêm lịch trình mới</span>
        </button>
      </div>

      {/* Executive Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Card 1: Tổng số Tours */}
        <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Tổng lịch trình</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-100 text-stone-600">
              <VsIcon name="explore" className="text-base" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">{tours.length}</span>
            <span className="text-xs font-medium text-stone-500">lịch trình</span>
          </div>
        </div>

        {/* Card 2: Tỉnh/Thành phủ sóng */}
        <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Tỉnh / Thành</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
              <VsIcon name="map" className="text-base" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-800 tracking-tight">
              {coveredProvincesCount}
            </span>
            <span className="text-xs font-medium text-stone-500">/ {PROVINCES.length} trọng điểm</span>
          </div>
        </div>

        {/* Card 3: Định vị GPS */}
        <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Định vị GPS</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-50 text-sky-700">
              <VsIcon name="my_location" className="text-base" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
              {tours.filter((t) => t.latitude != null && t.longitude != null).length}
            </span>
            <span className="text-xs font-medium text-stone-500">tour có tọa độ</span>
          </div>
        </div>

        {/* Card 4: LocalMate AI Hub */}
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-[11px] font-semibold uppercase tracking-wider">LocalMate AI</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-800/10 text-emerald-800">
              <VsIcon name="smart_toy" className="text-base" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-bold text-emerald-900 tracking-tight">Active Engine</span>
            <span className="text-xs font-medium text-emerald-700">Sẵn sàng tư vấn</span>
          </div>
        </div>
      </div>

      {/* Cascading Filter Toolbar */}
      <div className="rounded-2xl border border-stone-200/80 bg-white p-3.5 sm:p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12 items-center">
          {/* Search Input */}
          <div className="relative lg:col-span-4">
            <VsIcon
              name="search"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-stone-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm theo tên tour, tỉnh thành, điểm nổi bật..."
              className="min-h-11 w-full rounded-xl border border-stone-200 bg-stone-50/50 pl-10 pr-4 text-base font-medium text-stone-900 placeholder:text-stone-400 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/10 transition-all"
            />
          </div>

          {/* Cascading Dropdown 1: Tỉnh / Thành phố */}
          <div className="lg:col-span-3">
            <select
              value={provinceFilter}
              onChange={(e) => handleSelectProvince(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 text-base font-medium text-stone-800 focus:border-emerald-700 focus:bg-white focus:outline-none cursor-pointer transition-all"
            >
              <option value="ALL">
                {regionFilter !== "ALL"
                  ? `Tất cả (${REGION_MAP[regionFilter]?.name})`
                  : "Tất cả Tỉnh / TP"}
              </option>
              {(regionFilter !== "ALL"
                ? PROVINCES.filter((p) => p.regionCode === regionFilter)
                : PROVINCES
              ).map((prov) => (
                <option key={prov.code} value={prov.code}>
                  {prov.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cascading Dropdown 2: Thời lượng tour */}
          <div className="lg:col-span-2">
            <select
              value={durationFilter}
              onChange={(e) => {
                setDurationFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-11 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 text-base font-medium text-stone-800 focus:border-emerald-700 focus:bg-white focus:outline-none cursor-pointer transition-all"
            >
              <option value="ALL">Tất cả thời lượng</option>
              {durations.map((dur) => (
                <option key={dur} value={dur}>
                  {dur}
                </option>
              ))}
            </select>
          </div>

          {/* Cascading Dropdown 3: Phạm vi tour (Scope) */}
          <div className="lg:col-span-2">
            <select
              value={scopeFilter}
              onChange={(e) => {
                setScopeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-11 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 text-base font-medium text-stone-800 focus:border-emerald-700 focus:bg-white focus:outline-none cursor-pointer transition-all"
            >
              <option value="ALL">Tất cả phạm vi</option>
              {TOUR_SCOPES.map((scope) => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </select>
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-1.5 lg:col-span-1 justify-end">
            {/* Clear filters button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                title="Xóa bộ lọc"
                className="inline-flex h-10.5 w-10.5 items-center justify-center rounded-xl border border-stone-200 bg-stone-50/50 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-all cursor-pointer shadow-xs shrink-0"
              >
                <VsIcon name="filter_alt_off" className="text-base" />
              </button>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => refetch()}
              title="Làm mới dữ liệu"
              className="flex h-10.5 w-10.5 items-center justify-center rounded-xl border border-stone-200 bg-stone-50/50 text-stone-700 hover:bg-white hover:border-emerald-700 hover:text-emerald-800 transition-all cursor-pointer shadow-xs shrink-0"
            >
              <VsIcon name="refresh" className="text-lg" />
            </button>
          </div>
        </div>
      </div>

      {/* 2-Column Section: Box Khu Vực (Left) & Bảng Tour (Right) */}
      <div className="flex flex-col lg:flex-row items-start gap-6">
        {/* Left Column: Nav dọc phân vùng địa lý (4 khu vực) */}
        <LocalMateGeographyNav
          regionFilter={regionFilter}
          onSelectRegion={handleSelectRegion}
          provinceFilter={provinceFilter}
          onSelectProvince={handleSelectProvince}
          tours={tours}
        />

        {/* Right Column: Main Tour List Container */}
        <div className="flex-1 min-w-0 w-full">
          {/* Main Tour List Container */}
          <div className="rounded-2xl border border-stone-200/80 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-24 text-center">
            <div className="inline-block h-9 w-9 animate-spin rounded-full border-3 border-emerald-800 border-t-transparent" />
            <p className="mt-3 text-xs sm:text-sm font-semibold text-stone-500">
              Đang tải danh sách lịch trình tour...
            </p>
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-rose-600">
            <p className="font-semibold text-sm">Không thể tải dữ liệu kho tri thức tour.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-all cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : filteredTours.length === 0 ? (
          <div className="p-16 text-center text-stone-500">
            <VsIcon name="search" className="mx-auto text-4xl text-stone-300 mb-3" />
            <p className="font-bold text-base text-stone-900">Không tìm thấy lịch trình tour nào</p>
            <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto leading-relaxed">
              Thử điều chỉnh từ khóa tìm kiếm hoặc chọn bộ lọc Tỉnh / Thời lượng khác để xem kết quả.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-all cursor-pointer"
                >
                  Xóa bộ lọc
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-all cursor-pointer"
              >
                <VsIcon name="add" className="text-base" />
                <span>Thêm lịch trình mới</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-stone-200/90 bg-stone-50/95 text-[11px] font-bold text-stone-600 uppercase tracking-wider backdrop-blur-xs">
                  <th className="px-5 py-3.5 min-w-[340px]">Chương trình Tour</th>
                  <th className="px-4 py-3.5 min-w-[280px]">Tỉnh thành & Phạm vi</th>
                  <th className="px-4 py-3.5 min-w-[130px]">Thời lượng</th>
                  <th className="px-5 py-3.5 w-[85px] min-w-[85px] whitespace-nowrap text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {paginatedTours.map((tour) => {
                  // Resolve Geography & Scope
                  const detected = detectProvinceFromDestination(tour.title);
                  const provCode = tour.provinceCode || detected?.code;
                  const provName =
                    tour.province ||
                    (provCode ? PROVINCE_MAP[provCode]?.name : detected?.name) ||
                    "Khác";
                  const scopeDef = tour.tourScope ? TOUR_SCOPE_MAP[tour.tourScope] : undefined;
                  const hasGps = tour.latitude != null && tour.longitude != null;

                  // Highlights list
                  const hlList = Array.isArray(tour.highlights)
                    ? tour.highlights
                    : typeof tour.highlights === "string"
                      ? (tour.highlights as string).split(",").map((s) => s.trim()).filter(Boolean)
                      : [];

                  return (
                    <tr
                      key={tour.id}
                      onClick={() => handleOpenEditModal(tour)}
                      className="group cursor-pointer transition-colors hover:bg-stone-50/80 active:bg-stone-100/60"
                      title="Nhấp vào dòng để chỉnh sửa lịch trình"
                    >
                      {/* Tour Column */}
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-start gap-2">
                            {tour.tourCode && (
                              <span className="font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded shadow-2xs shrink-0 mt-0.5">
                                {tour.tourCode}
                              </span>
                            )}
                            <span className="font-bold text-sm sm:text-[14.5px] text-stone-900 group-hover:text-emerald-800 transition-colors leading-snug line-clamp-2">
                              {tour.title}
                            </span>
                          </div>

                          {hlList.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {hlList.slice(0, 3).map((item, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-stone-50 border border-stone-200/80 px-2 py-0.5 text-xs text-stone-600 font-medium"
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                                  <span className="truncate max-w-[240px]">{item}</span>
                                </span>
                              ))}
                              {hlList.length > 3 && (
                                <span className="text-[11px] font-semibold text-stone-400">
                                  +{hlList.length - 3} điểm khác
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Geography & Scope Column */}
                      <td className="px-4 py-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {/* Badge Tỉnh */}
                          <span className="inline-flex items-center gap-1 rounded-lg bg-stone-100 border border-stone-200/90 px-2.5 py-1 text-xs font-semibold text-stone-800 shadow-2xs">
                            <VsIcon name="location_on" className="text-sm text-stone-500" />
                            <span>{provName}</span>
                          </span>

                          {/* Badge Scope */}
                          {scopeDef && (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-2xs ${scopeDef.badgeClass}`}
                              title={scopeDef.description}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                              <span>{scopeDef.shortLabel}</span>
                            </span>
                          )}

                          {/* GPS Badge */}
                          {hasGps && (
                            <span
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200/80 px-2 py-1 text-xs font-semibold text-emerald-800 shadow-2xs"
                              title={`Tọa độ: ${tour.latitude}, ${tour.longitude}`}
                            >
                              <VsIcon name="my_location" className="text-xs text-emerald-700" />
                              <span>GPS</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Duration Column */}
                      <td className="px-4 py-4 align-top whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50/90 border border-amber-200/90 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-2xs">
                          <VsIcon name="schedule" className="text-sm text-amber-700" />
                          <span>{normalizeTourDuration(tour.duration) || "Chưa rõ"}</span>
                        </span>
                      </td>

                      {/* Action Column: Chỉ hiện nút Xoá Lịch Trình theo yêu cầu */}
                      <td
                        className="px-5 py-4 align-top text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleDeleteTour(tour)}
                          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-stone-200/90 bg-white text-stone-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 shadow-2xs transition-all cursor-pointer group/del"
                          title="Xoá lịch trình"
                          aria-label={`Xoá lịch trình ${tour.title}`}
                        >
                          <VsIcon name="delete" className="text-base transition-transform group-hover/del:scale-110" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Sticky-like bottom Pagination bar */}
        {!isLoading && filteredTours.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-stone-200 bg-stone-50/60 px-4 sm:px-5 py-3 text-xs text-stone-600">
            <div className="flex items-center gap-2">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 cursor-pointer focus:border-emerald-700 focus:outline-hidden"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span>
                trên tổng số <strong className="text-stone-900 font-semibold">{totalItems}</strong> lịch trình

              </span>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 disabled:opacity-40 hover:bg-stone-50 cursor-pointer transition-colors shadow-2xs"
              >
                <VsIcon name="chevron_left" className="text-sm" />
              </button>

              <span className="px-2.5 text-xs font-semibold text-stone-800">
                {safeCurrentPage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 disabled:opacity-40 hover:bg-stone-50 cursor-pointer transition-colors shadow-2xs"
              >
                <VsIcon name="chevron_right" className="text-sm" />
              </button>
            </div>
          </div>
        )}
      </div>
        </div>
      </div>

      {/* Tour Create/Edit Form Modal */}
      {isTourModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs sm:p-6">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 sm:p-7 shadow-xl border border-stone-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  {editingTourId ? "Chỉnh sửa lịch trình tour" : "Thêm lịch trình tour mới"}
                </h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  Nạp dữ liệu vào kho tri thức LocalMate AI phục vụ phân vùng gợi ý và tư vấn tự động.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {editingTourId && (
                  <button
                    type="button"
                    onClick={() => {
                      const currentTour = tours.find((t) => t.id === editingTourId);
                      if (currentTour) handleDuplicateTour(currentTour);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
                    title="Nhân bản lịch trình này thành một bản sao mới"
                  >
                    <VsIcon name="content_copy" className="text-sm" />
                    <span>Nhân bản</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsTourModalOpen(false)}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
                  aria-label="Đóng"
                >
                  <VsIcon name="close" className="text-xl" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveTour} className="mt-5 space-y-4.5">
              {/* Row 1: Tỉnh/Thành & Phạm vi & Thời lượng (Nhập số ngày, số đêm) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                {/* Tỉnh / Thành phố */}
                <div className="sm:col-span-4">
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Tỉnh / Thành phố
                  </label>
                  <select
                    value={tourFormData.provinceCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const prov = PROVINCE_MAP[code];
                      setTourFormData((prev) => ({
                        ...prev,
                        provinceCode: code,
                        province: prov ? prov.name : "",
                      }));
                    }}
                    className="h-10.5 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 cursor-pointer transition-colors"
                  >
                    <option value="">-- Chọn Tỉnh / TP --</option>
                    {PROVINCES.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Phạm vi tour (Scope) */}
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Phạm vi tour (Scope)
                  </label>
                  <select
                    value={tourFormData.tourScope}
                    onChange={(e) =>
                      setTourFormData({
                        ...tourFormData,
                        tourScope: e.target.value as LocalMateTourScope,
                      })
                    }
                    className="h-10.5 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 cursor-pointer transition-colors"
                  >
                    <option value="">-- Chọn phạm vi --</option>
                    {TOUR_SCOPES.map((scope) => (
                      <option key={scope.value} value={scope.value}>
                        {scope.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Thời lượng: Nhập số ngày, số đêm */}
                <div className="sm:col-span-5">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-stone-700">
                      Thời lượng <span className="text-rose-500">*</span>
                    </label>
                    {tourFormData.duration && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200/90 px-2 py-0.5 text-xs font-semibold text-amber-900 shadow-2xs">
                        <VsIcon name="schedule" className="text-xs text-amber-700" />
                        <span>{tourFormData.duration}</span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Input Số ngày */}
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="60"
                        step="any"
                        required
                        value={durationDays}
                        onChange={(e) => handleDaysChange(e.target.value)}
                        placeholder="Số ngày"
                        className="h-10.5 w-full rounded-xl border border-stone-200 bg-white pl-3 pr-12 text-sm text-stone-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 transition-colors"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-stone-500">
                        Ngày
                      </span>
                    </div>

                    {/* Input Số đêm */}
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="60"
                        step="1"
                        value={durationNights}
                        onChange={(e) => handleNightsChange(e.target.value)}
                        placeholder="Số đêm"
                        className="h-10.5 w-full rounded-xl border border-stone-200 bg-white pl-3 pr-12 text-sm text-stone-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 transition-colors"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-stone-500">
                        Đêm
                      </span>
                    </div>
                  </div>

                  {/* Nút chọn nhanh (Presets) */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {TOUR_DURATION_PRESETS.map((preset) => {
                      const isActive =
                        Number(durationDays) === preset.d && Number(durationNights) === preset.n;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handleSelectPreset(preset.d, preset.n)}
                          className={`rounded-md border px-2 py-0.5 text-xs transition-colors cursor-pointer ${
                            isActive
                              ? "bg-amber-100 text-amber-900 border-amber-300 font-bold"
                              : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-800 font-medium"
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 2: Tên Lịch trình Tour */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Tên lịch trình tour <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={tourFormData.title}
                  onChange={(e) =>
                    setTourFormData({ ...tourFormData, title: e.target.value })
                  }
                  placeholder="Ví dụ: Hà Nội → Mù Cang Chải – La Pán Tẩn – Tú Lệ"
                  className="h-10.5 w-full rounded-xl border border-stone-200 bg-white px-3.5 text-sm font-medium text-stone-800 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 transition-colors"
                />
              </div>

              {/* Row 3: Tọa độ điểm đến trọng điểm & Google Maps Converter / Preview Minimap */}
              <div className="rounded-2xl border border-stone-200/90 bg-stone-50/60 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-800">
                      <VsIcon name="location_on" className="text-base" />
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-stone-800">
                        Tọa độ & Bản đồ vị trí (Google Maps)
                      </h4>
                      <p className="text-xs text-stone-500">
                        Dán link Google Maps để tự động trích xuất Vĩ độ & Kinh độ, hoặc nhập số trực tiếp.
                      </p>
                    </div>
                  </div>
                  {hasValidCoordinates && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                      <VsIcon name="check_circle" className="text-xs" />
                      Đã có GPS
                    </span>
                  )}
                </div>

                {/* Google Maps Link Converter Input */}
                <div className="mt-3">
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    Dán link Google Maps (URL / Tọa độ)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                      <VsIcon name="link" className="text-base" />
                    </div>
                    <input
                      type="text"
                      value={mapsUrlInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMapsUrlInput(val);
                        const coords = extractLatLngFromGoogleMapsUrl(val);
                        if (coords) {
                          setTourFormData((prev) => ({
                            ...prev,
                            latitude: coords.lat,
                            longitude: coords.lng,
                          }));
                        }
                      }}
                      placeholder="Dán link Google Maps (VD: https://www.google.com/maps/place/.../@21.0333,104.8833... hoặc 21.0333, 104.8833)"
                      className="h-10.5 w-full rounded-xl border border-stone-200 bg-white pl-9.5 pr-24 text-xs sm:text-sm text-stone-800 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!mapsUrlInput.trim()) return;
                        const coords = extractLatLngFromGoogleMapsUrl(mapsUrlInput);
                        if (coords) {
                          setTourFormData((prev) => ({
                            ...prev,
                            latitude: coords.lat,
                            longitude: coords.lng,
                          }));
                        } else {
                          SwalVietSage.fire({
                            title: "Không tìm thấy tọa độ",
                            text: "Vui lòng kiểm tra lại link Google Maps. Bạn có thể copy link từ thanh địa chỉ trình duyệt hoặc copy trực tiếp tọa độ (ví dụ: 21.033333, 104.883333).",
                            icon: "info",
                            showConfirmButton: true,
                            confirmButtonText: "OK",
                          });
                        }
                      }}
                      className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded-lg bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 text-stone-700 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Trích xuất
                    </button>
                  </div>
                </div>

                {/* 2 Inputs for Latitude & Longitude */}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tour-latitude" className="mb-1 block text-xs font-medium text-stone-600">
                      Vĩ độ (Latitude)
                    </label>
                    <input
                      id="tour-latitude"
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={tourFormData.latitude}
                      onChange={(e) => setTourFormData({ ...tourFormData, latitude: e.target.value })}
                      placeholder="Ví dụ: 21.033333"
                      className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3.5 text-sm font-mono text-stone-800 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="tour-longitude" className="mb-1 block text-xs font-medium text-stone-600">
                      Kinh độ (Longitude)
                    </label>
                    <input
                      id="tour-longitude"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={tourFormData.longitude}
                      onChange={(e) => setTourFormData({ ...tourFormData, longitude: e.target.value })}
                      placeholder="Ví dụ: 104.883333"
                      className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3.5 text-sm font-mono text-stone-800 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 transition-colors"
                    />
                  </div>
                </div>

                {/* Minimap Preview Container */}
                {hasValidCoordinates ? (
                  <div className="mt-3.5 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xs">
                    <div className="flex items-center justify-between px-3.5 py-2 bg-stone-50 border-b border-stone-200 text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-stone-700">
                        <VsIcon name="map" className="text-emerald-700 text-sm" />
                        <span>Xem trước trên Google Maps:</span>
                        <strong className="font-mono text-emerald-800">
                          {Number(tourFormData.latitude).toFixed(6)}, {Number(tourFormData.longitude).toFixed(6)}
                        </strong>
                      </span>
                      <a
                        href={`https://www.google.com/maps?q=${tourFormData.latitude},${tourFormData.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                      >
                        <span>Mở bản đồ lớn</span>
                        <VsIcon name="open_in_new" className="text-xs" />
                      </a>
                    </div>
                    <iframe
                      title="Google Maps Minimap Preview"
                      src={`https://maps.google.com/maps?q=${tourFormData.latitude},${tourFormData.longitude}&hl=vi&z=13&output=embed`}
                      className="w-full h-44 sm:h-52 border-0"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-dashed border-stone-200 bg-white/70 px-3.5 py-3 text-xs text-stone-500">
                    <VsIcon name="info" className="text-base text-stone-400 shrink-0" />
                    <span>
                      Chưa có tọa độ bản đồ. Bạn có thể dán link Google Maps ở trên hoặc nhập Vĩ độ / Kinh độ để xem trước vị trí trực tiếp.
                    </span>
                  </div>
                )}
              </div>

              {/* Row 4: Điểm nổi bật (Highlights) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-stone-700">
                    Điểm nổi bật
                  </label>
                  <span className="text-xs text-stone-400">Phân cách bởi dấu phẩy</span>
                </div>
                <input
                  type="text"
                  value={tourFormData.highlights}
                  onChange={(e) =>
                    setTourFormData({ ...tourFormData, highlights: e.target.value })
                  }
                  placeholder="Ví dụ: Đèo Khau Phạ, Ruộng bậc thang Mâm Xôi, Tắm khoáng nóng Trạm Tấu..."
                  className="h-10.5 w-full rounded-xl border border-stone-200 bg-white px-3.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 transition-colors"
                />
              </div>

              {/* Row 7: Nội dung chi tiết */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Nội dung chi tiết lịch trình <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={6}
                  required
                  value={tourFormData.content}
                  onChange={(e) =>
                    setTourFormData({ ...tourFormData, content: e.target.value })
                  }
                  placeholder="Chi tiết từng ngày, hoạt động trải nghiệm, địa điểm ăn uống, thông tin văn hóa..."
                  className="w-full rounded-xl border border-stone-200 bg-white p-3.5 text-sm leading-relaxed text-stone-800 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/10 transition-colors resize-y"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-stone-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsTourModalOpen(false)}
                  className="rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-6 py-2.5 text-sm font-medium text-white shadow-xs hover:shadow-sm disabled:opacity-50 transition-all cursor-pointer"
                >
                  <VsIcon name={editingTourId ? "save" : "check"} className="text-base" />
                  <span>{isSaving ? "Đang lưu..." : editingTourId ? "Lưu thay đổi" : "Tạo lịch trình"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
