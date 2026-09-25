"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { SwalVietSage } from "@/libs/swal";
import { localMateAdminResource } from "../resource";
import {
  PROVINCE_MAP,
  PROVINCES,
  REGIONS,
  REGION_MAP,
  TOUR_SCOPE_MAP,
  TOUR_SCOPES,
  COMMON_TOUR_DURATIONS,
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

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "Mới cập nhật";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return "Mới cập nhật";
  }
}

type TourFormData = {
  tourCode: string;
  title: string;
  provinceCode: string;
  province: string;
  destination: string;
  tourScope: LocalMateTourScope | "";
  duration: string;
  highlights: string;
  content: string;
  latitude: string;
  longitude: string;
};

const initialFormData: TourFormData = {
  tourCode: "",
  title: "",
  provinceCode: "",
  province: "",
  destination: "",
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
  const [destinationFilter, setDestinationFilter] = useState("ALL");
  const [scopeFilter, setScopeFilter] = useState("ALL");
  const [durationFilter, setDurationFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectProvince = (provCode: string) => {
    setProvinceFilter(provCode);
    setDestinationFilter("ALL");
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
    setDestinationFilter("ALL");
    setCurrentPage(1);
  };

  // Selection
  const [selectedTourIds, setSelectedTourIds] = useState<Set<string>>(new Set());
  const [openMenuTourId, setOpenMenuTourId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Form modal state (Create / Edit)
  const [isTourModalOpen, setIsTourModalOpen] = useState(false);
  const [editingTourId, setEditingTourId] = useState<string | null>(null);
  const [tourFormData, setTourFormData] = useState<TourFormData>(initialFormData);

  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close popup menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuTourId(null);
      }
    }
    if (openMenuTourId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuTourId]);

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

  // Unique destinations overall
  const destinations = useMemo(() => {
    const set = new Set<string>();
    for (const t of tours) {
      if (t.destination) set.add(t.destination);
    }
    return Array.from(set).sort();
  }, [tours]);

  // Covered provinces count
  const coveredProvincesCount = useMemo(() => {
    const pCodes = new Set<string>();
    for (const t of tours) {
      const detected = detectProvinceFromDestination(t.destination, t.title);
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

  // Child destinations list based on selected province or region filter
  const cascadingDestinations = useMemo(() => {
    if (provinceFilter !== "ALL") {
      const taxonomy = PROVINCE_MAP[provinceFilter];
      const baseDestinations = taxonomy ? [...taxonomy.destinations] : [];

      // Include destinations from actual tours under this province
      const tourDests = new Set<string>();
      for (const t of tours) {
        const detected = detectProvinceFromDestination(t.destination, t.title);
        const code = t.provinceCode || detected?.code;
        if (code === provinceFilter && t.destination) {
          tourDests.add(t.destination);
        }
      }
      return Array.from(new Set([...baseDestinations, ...Array.from(tourDests)])).sort();
    }

    if (regionFilter !== "ALL") {
      const regProvs = PROVINCES.filter((p) => p.regionCode === regionFilter);
      const regCodes = new Set(regProvs.map((p) => p.code));
      const allSet = new Set<string>();
      for (const p of regProvs) {
        for (const d of p.destinations) allSet.add(d);
      }
      for (const t of tours) {
        const detected = detectProvinceFromDestination(t.destination, t.title);
        const code = t.provinceCode || detected?.code;
        if (code && regCodes.has(code) && t.destination) {
          allSet.add(t.destination);
        }
      }
      return Array.from(allSet).sort();
    }

    // When ALL provinces are selected: return all unique destinations
    const allSet = new Set<string>();
    for (const p of PROVINCES) {
      for (const d of p.destinations) allSet.add(d);
    }
    for (const t of tours) {
      if (t.destination) allSet.add(t.destination);
    }
    return Array.from(allSet).sort();
  }, [provinceFilter, regionFilter, tours]);

  // Filtered tours
  const filteredTours = useMemo(() => {
    return tours.filter((t) => {
      const detected = detectProvinceFromDestination(t.destination, t.title);
      const tourProvCode = t.provinceCode || detected?.code || "";
      const tourProvName = t.province || (tourProvCode ? PROVINCE_MAP[tourProvCode]?.name : detected?.name) || "";
      const tourScope = t.tourScope;

      const tourTax = tourProvCode ? PROVINCE_MAP[tourProvCode] : undefined;
      const tourRegCode = tourTax?.regionCode;

      const matchesRegion = regionFilter === "ALL" || tourRegCode === regionFilter;
      const matchesProvince = provinceFilter === "ALL" || tourProvCode === provinceFilter;
      const matchesDest =
        destinationFilter === "ALL" ||
        t.destination.toLowerCase() === destinationFilter.toLowerCase();
      const matchesScope = scopeFilter === "ALL" || tourScope === scopeFilter;
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
        t.destination.toLowerCase().includes(q) ||
        tourProvName.toLowerCase().includes(q) ||
        (t.highlights && t.highlights.some((h) => h.toLowerCase().includes(q)));

      return matchesRegion && matchesProvince && matchesDest && matchesScope && matchesDuration && matchesQuery;
    });
  }, [tours, regionFilter, provinceFilter, destinationFilter, scopeFilter, durationFilter, searchQuery]);

  // Check if any filter is active
  const hasActiveFilters =
    regionFilter !== "ALL" ||
    provinceFilter !== "ALL" ||
    destinationFilter !== "ALL" ||
    scopeFilter !== "ALL" ||
    durationFilter !== "ALL" ||
    searchQuery.trim().length > 0;

  const handleClearFilters = () => {
    setRegionFilter("ALL");
    setProvinceFilter("ALL");
    setDestinationFilter("ALL");
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

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingTourId(null);
    setTourFormData({
      ...initialFormData,
      tourCode: `HVNT-${Math.floor(1000 + Math.random() * 9000)}-25`,
      provinceCode: "LAO_CAI",
      province: "Lào Cai",
      destination: "Sa Pa",
      tourScope: "LOCAL",
      duration: "1 ngày",
    });
    setIsTourModalOpen(true);
  };

  // Open Edit Modal with auto-mapping
  const handleOpenEditModal = (tour: LocalMateTourKnowledge) => {
    const detected = detectProvinceFromDestination(tour.destination, tour.title);
    const provCode = tour.provinceCode || detected?.code || "";
    const provName =
      tour.province ||
      (provCode ? PROVINCE_MAP[provCode]?.name : detected?.name) ||
      "";

    setEditingTourId(tour.id);
    setTourFormData({
      tourCode: tour.tourCode,
      title: tour.title,
      provinceCode: provCode,
      province: provName,
      destination: tour.destination,
      tourScope: tour.tourScope || "",
      duration: normalizeTourDuration(tour.duration),
      highlights: (tour.highlights || []).join(", "),
      content: tour.content,
      latitude: tour.latitude == null ? "" : String(tour.latitude),
      longitude: tour.longitude == null ? "" : String(tour.longitude),
    });
    setOpenMenuTourId(null);
    setIsTourModalOpen(true);
  };

  // Duplicate Tour
  const handleDuplicateTour = (tour: LocalMateTourKnowledge) => {
    const detected = detectProvinceFromDestination(tour.destination, tour.title);
    const provCode = tour.provinceCode || detected?.code || "";
    const provName =
      tour.province ||
      (provCode ? PROVINCE_MAP[provCode]?.name : detected?.name) ||
      "";

    setEditingTourId(null);
    setTourFormData({
      tourCode: `${tour.tourCode}-COPY`,
      title: `${tour.title} (Bản sao)`,
      provinceCode: provCode,
      province: provName,
      destination: tour.destination,
      tourScope: tour.tourScope || "",
      duration: normalizeTourDuration(tour.duration),
      highlights: (tour.highlights || []).join(", "),
      content: tour.content,
      latitude: tour.latitude == null ? "" : String(tour.latitude),
      longitude: tour.longitude == null ? "" : String(tour.longitude),
    });
    setOpenMenuTourId(null);
    setIsTourModalOpen(true);
  };

  // Available child destinations for current modal province selection
  const modalChildDestinations = useMemo(() => {
    if (!tourFormData.provinceCode) return [];
    const prov = PROVINCE_MAP[tourFormData.provinceCode];
    return prov ? prov.destinations : [];
  }, [tourFormData.provinceCode]);

  // Save Tour (Create or Update)
  const handleSaveTour = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !tourFormData.title.trim() ||
      !tourFormData.destination.trim() ||
      !tourFormData.duration.trim() ||
      !tourFormData.content.trim()
    ) {
      await SwalVietSage.fire({
        title: "Thiếu thông tin",
        text: "Vui lòng nhập đầy đủ Tên tour, Điểm đến, Thời lượng và Nội dung chi tiết.",
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

    const detected = detectProvinceFromDestination(tourFormData.destination, tourFormData.title);
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
          destination: tourFormData.destination.trim(),
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
          destination: tourFormData.destination.trim(),
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
    setOpenMenuTourId(null);
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

  // Bulk selection toggles
  const handleToggleSelectAll = () => {
    if (selectedTourIds.size === paginatedTours.length) {
      setSelectedTourIds(new Set());
    } else {
      setSelectedTourIds(new Set(paginatedTours.map((t) => t.id)));
    }
  };

  const handleToggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedTourIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTourIds(next);
  };

  const isSaving = createTourMutation.isPending || updateTourMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-1">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#173F35]/10 text-[#173F35] shadow-xs">
              <VsIcon name="menu_book" className="text-2xl" />
            </span>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#142823]">
                Kho tri thức Tour AI
              </h1>
              <p className="mt-1 text-base text-[#52635A] max-w-2xl leading-relaxed">
                Quản lý các chương trình tour, phân cấp địa lý Tỉnh / Điểm đến và dữ liệu gợi ý cho trợ lý LocalMate AI.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#173F35] to-[#245347] px-6 text-sm font-bold text-white shadow-[0_8px_20px_rgba(23,63,53,0.25)] transition-all hover:scale-[1.02] hover:shadow-[0_12px_28px_rgba(23,63,53,0.32)] active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <VsIcon name="add" className="text-xl" />
          <span>Thêm lịch trình mới</span>
        </button>
      </div>

      {/* Executive Metric Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Card 1: Tổng số Tours */}
        <div className="rounded-2xl border border-[#25483F]/12 bg-white p-5 shadow-[0_4px_20px_rgba(20,40,35,0.04)] transition-all hover:shadow-[0_8px_30px_rgba(20,40,35,0.08)]">
          <div className="flex items-center justify-between text-[#5A6861]">
            <span className="text-xs font-bold uppercase tracking-wider">Tổng lịch trình</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173F35]/10 text-[#173F35]">
              <VsIcon name="explore" className="text-lg" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#142823] tracking-tight">{tours.length}</span>
            <span className="text-xs font-semibold text-[#5A6861]">tour hệ thống</span>
          </div>
        </div>

        {/* Card 2: Tỉnh/Thành phủ sóng */}
        <div className="rounded-2xl border border-[#25483F]/12 bg-white p-5 shadow-[0_4px_20px_rgba(20,40,35,0.04)] transition-all hover:shadow-[0_8px_30px_rgba(20,40,35,0.08)]">
          <div className="flex items-center justify-between text-[#5A6861]">
            <span className="text-xs font-bold uppercase tracking-wider">Tỉnh / Thành</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173F35]/10 text-[#173F35]">
              <VsIcon name="map" className="text-lg" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#173F35] tracking-tight">
              {coveredProvincesCount}
            </span>
            <span className="text-xs font-semibold text-[#173F35]">/ {PROVINCES.length} trọng điểm</span>
          </div>
        </div>

        {/* Card 3: Điểm đến */}
        <div className="rounded-2xl border border-[#25483F]/12 bg-white p-5 shadow-[0_4px_20px_rgba(20,40,35,0.04)] transition-all hover:shadow-[0_8px_30px_rgba(20,40,35,0.08)]">
          <div className="flex items-center justify-between text-[#5A6861]">
            <span className="text-xs font-bold uppercase tracking-wider">Điểm đến phủ sóng</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#16805C]/10 text-[#16805C]">
              <VsIcon name="location_on" className="text-lg" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#142823] tracking-tight">{destinations.length}</span>
            <span className="text-xs font-semibold text-[#16805C]">khu vực trọng điểm</span>
          </div>
        </div>

        {/* Card 4: LocalMate AI Hub */}
        <div className="rounded-2xl border border-[#B18B26]/25 bg-gradient-to-br from-[#FFFDF8] to-[#FFF9EC] p-5 shadow-[0_4px_20px_rgba(177,139,38,0.08)]">
          <div className="flex items-center justify-between text-[#8A6A13]">
            <span className="text-xs font-bold uppercase tracking-wider">LocalMate AI Hub</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#B18B26]/15 text-[#B18B26]">
              <VsIcon name="smart_toy" className="text-lg" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-xl font-black text-[#8A6A13] tracking-tight">Active Engine</span>
            <span className="text-xs font-semibold text-[#8A6A13]/80">24/7 Concierge</span>
          </div>
        </div>
      </div>

      {/* Cascading Filter Toolbar */}
      <div className="rounded-2xl border border-[#25483F]/12 bg-white p-4 sm:p-5 shadow-[0_4px_20px_rgba(20,40,35,0.04)]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 items-center">
          {/* Search Input */}
          <div className="relative lg:col-span-4">
            <VsIcon
              name="search"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-[#788880]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm theo tiêu đề, mã tour, điểm đến, tỉnh thành..."
              className="h-12 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] pl-11 pr-4 text-sm font-medium text-[#142823] placeholder:text-[#788880] focus:border-[#173F35] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#173F35]/15 transition-all"
            />
          </div>

          {/* Cascading Dropdown 1: Tỉnh / Thành phố */}
          <div className="lg:col-span-2">
            <select
              value={provinceFilter}
              onChange={(e) => handleSelectProvince(e.target.value)}
              className="h-12 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-3.5 text-sm font-semibold text-[#142823] focus:border-[#173F35] focus:bg-white focus:outline-none cursor-pointer transition-all"
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

          {/* Cascading Dropdown 2: Điểm đến con */}
          <div className="lg:col-span-2">
            <select
              value={destinationFilter}
              onChange={(e) => {
                setDestinationFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-12 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-3.5 text-sm font-semibold text-[#142823] focus:border-[#173F35] focus:bg-white focus:outline-none cursor-pointer transition-all"
            >
              <option value="ALL">
                {provinceFilter !== "ALL"
                  ? `Tất cả điểm đến (${PROVINCE_MAP[provinceFilter]?.name ?? ""})`
                  : `Tất cả điểm đến (${cascadingDestinations.length})`}
              </option>
              {cascadingDestinations.map((dest) => (
                <option key={dest} value={dest}>
                  {dest}
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
              className="h-12 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-3.5 text-sm font-semibold text-[#142823] focus:border-[#173F35] focus:bg-white focus:outline-none cursor-pointer transition-all"
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
          <div className="flex items-center gap-2 lg:col-span-2 justify-end">
            {/* Clear filters button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                title="Xóa bộ lọc"
                className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[#25483F]/15 bg-white px-3 text-xs font-bold text-[#5C6E66] hover:bg-[#FAF8F5] hover:text-[#173F35] transition-all cursor-pointer"
              >
                <VsIcon name="filter_alt_off" className="text-base" />
                <span>Đặt lại</span>
              </button>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => refetch()}
              title="Làm mới dữ liệu"
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] text-[#142823] hover:bg-white hover:border-[#173F35] transition-all cursor-pointer shadow-xs shrink-0"
            >
              <VsIcon name="refresh" className="text-xl" />
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
          <div className="rounded-2xl border border-[#25483F]/12 bg-white shadow-[0_12px_40px_rgba(20,40,35,0.06)] overflow-hidden">
        {isLoading ? (
          <div className="py-24 text-center">
            <div className="inline-block h-10 w-10 animate-spin rounded-full border-3 border-[#173F35] border-t-transparent" />
            <p className="mt-4 text-sm font-bold text-[#5A6861]">
              Đang tải danh sách lịch trình tour...
            </p>
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-[#C94A4A]">
            <p className="font-bold text-base">Không thể tải dữ liệu kho tri thức tour.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 rounded-xl bg-[#173F35] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#12322a] transition-all cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : filteredTours.length === 0 ? (
          <div className="p-16 text-center text-[#5A6861]">
            <VsIcon name="search" className="mx-auto text-4xl text-[#5A6861]/40 mb-3" />
            <p className="font-bold text-lg text-[#142823]">Không tìm thấy lịch trình tour nào</p>
            <p className="text-sm text-[#5A6861] mt-1.5 max-w-md mx-auto">
              Thử điều chỉnh từ khóa tìm kiếm hoặc chọn bộ lọc Tỉnh / Điểm đến khác để xem kết quả.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="rounded-xl border border-[#25483F]/20 bg-white px-5 py-2.5 text-sm font-bold text-[#142823] hover:bg-[#FAF8F5] transition-all cursor-pointer"
                >
                  Xóa bộ lọc
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-2 rounded-xl bg-[#173F35] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#12322a] transition-all cursor-pointer"
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
                <tr className="sticky top-0 z-10 border-b border-[#25483F]/10 bg-[#FAF7F0] text-xs font-bold uppercase tracking-wider text-[#485951]">
                  <th className="w-12 px-6 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={
                        paginatedTours.length > 0 &&
                        selectedTourIds.size === paginatedTours.length
                      }
                      onChange={handleToggleSelectAll}
                      className="h-4 w-4 rounded border-[#25483F]/30 text-[#173F35] focus:ring-[#173F35] cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 min-w-[320px]">Chương trình Tour</th>
                  <th className="px-6 py-4 min-w-[220px]">Điểm đến</th>
                  <th className="px-6 py-4 min-w-[140px]">Thời lượng</th>
                  <th className="px-6 py-4 w-[100px] text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#25483F]/10">
                {paginatedTours.map((tour) => {
                  const isSelected = selectedTourIds.has(tour.id);

                  // Resolve Geography & Scope
                  const detected = detectProvinceFromDestination(tour.destination, tour.title);
                  const provCode = tour.provinceCode || detected?.code;
                  const provName =
                    tour.province ||
                    (provCode ? PROVINCE_MAP[provCode]?.name : detected?.name) ||
                    "Khác";
                  const scopeDef = tour.tourScope ? TOUR_SCOPE_MAP[tour.tourScope] : undefined;

                  return (
                    <tr
                      key={tour.id}
                      onClick={() => handleOpenEditModal(tour)}
                      className={`group cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#FAF7F0]"
                          : "hover:bg-[#FAF8F5]"
                      }`}
                    >
                      {/* Checkbox */}
                      <td
                        className="px-6 py-5 text-center"
                        onClick={(e) => handleToggleSelectRow(tour.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-[#25483F]/30 text-[#173F35] focus:ring-[#173F35] cursor-pointer"
                        />
                      </td>

                      {/* Tour Column */}
                      <td className="px-6 py-5">
                        <div className="font-bold text-base text-[#142823] group-hover:text-[#173F35] transition-colors leading-snug line-clamp-2">
                          {tour.title}
                        </div>
                      </td>

                      {/* Destination Column */}
                      <td className="px-6 py-5">
                        <div className="flex flex-col items-start gap-1.5">
                          {/* Badges row: Tỉnh + Scope */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Badge Tỉnh (VietSage Moss Green) */}
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#173F35]/10 border border-[#25483F]/15 px-2 py-0.5 text-xs font-bold text-[#173F35]">
                              <VsIcon name="location_on" className="text-xs" />
                              <span>{provName}</span>
                            </span>

                            {/* Badge Scope trực quan */}
                            {scopeDef && (
                              <span
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${scopeDef.badgeClass}`}
                                title={scopeDef.description}
                              >
                                <VsIcon name="navigation" className="text-xs" />
                                <span>{scopeDef.shortLabel}</span>
                              </span>
                            )}
                          </div>

                          {/* Tên Điểm đến chính */}
                          <div className="text-sm font-bold text-[#142823] tracking-tight">
                            {tour.destination}
                          </div>
                        </div>
                      </td>

                      {/* Duration Column */}
                      <td className="px-6 py-5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4F7F5] border border-[#25483F]/8 px-3 py-1.5 text-sm font-bold text-[#142823] whitespace-nowrap">
                          <VsIcon name="schedule" className="text-sm text-[#173F35]" />
                          <span>{normalizeTourDuration(tour.duration)}</span>
                        </span>
                      </td>

                      {/* Action Menu Column */}
                      <td
                        className="px-6 py-5 text-right relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuTourId(
                              openMenuTourId === tour.id ? null : tour.id,
                            )
                          }
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#5C6E66] hover:bg-[#25483F]/8 hover:text-[#142823] ml-auto transition-colors cursor-pointer"
                          title="Tùy chọn thao tác"
                        >
                          <VsIcon name="more_vert" className="text-xl" />
                        </button>

                        {/* Floating Popup Menu */}
                        {openMenuTourId === tour.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-6 top-12 z-20 w-48 rounded-2xl border border-[#25483F]/15 bg-white py-2 shadow-xl text-left"
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(tour)}
                              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-semibold text-[#142823] hover:bg-[#FAF8F5] cursor-pointer"
                            >
                              <VsIcon name="edit" className="text-base text-[#5C6E66]" />
                              <span>Chỉnh sửa</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateTour(tour)}
                              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-semibold text-[#142823] hover:bg-[#FAF8F5] cursor-pointer"
                            >
                              <VsIcon name="content_copy" className="text-base text-[#5C6E66]" />
                              <span>Nhân bản</span>
                            </button>
                            <div className="my-1 border-t border-[#25483F]/10" />
                            <button
                              type="button"
                              onClick={() => handleDeleteTour(tour)}
                              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-semibold text-[#C94A4A] hover:bg-red-50 cursor-pointer"
                            >
                              <VsIcon name="delete" className="text-base" />
                              <span>Xoá lịch trình</span>
                            </button>
                          </div>
                        )}
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-[#25483F]/10 bg-[#FAF7F0] px-6 py-4 text-sm font-medium text-[#5C6E66]">
            <div className="flex items-center gap-2.5">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-[#25483F]/15 bg-white px-3 py-1.5 text-sm font-bold text-[#142823] cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span>
                trên tổng số <strong className="text-[#142823] font-bold">{totalItems}</strong> lịch trình
                {selectedTourIds.size > 0 && (
                  <span className="ml-2 font-bold text-[#173F35]">
                    (Đã chọn {selectedTourIds.size})
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#25483F]/15 bg-white text-[#142823] disabled:opacity-40 hover:bg-[#FAF8F5] cursor-pointer transition-colors shadow-xs"
              >
                <VsIcon name="chevron_left" className="text-base" />
              </button>

              <span className="px-3 text-sm font-bold text-[#142823]">
                {safeCurrentPage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#25483F]/15 bg-white text-[#142823] disabled:opacity-40 hover:bg-[#FAF8F5] cursor-pointer transition-colors shadow-xs"
              >
                <VsIcon name="chevron_right" className="text-base" />
              </button>
            </div>
          </div>
        )}
      </div>
        </div>
      </div>

      {/* Tour Create/Edit Form Modal */}
      {isTourModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-[#25483F]/15">
            <div className="flex items-center justify-between border-b border-[#25483F]/10 pb-4">
              <div>
                <h3 className="text-xl font-black text-[#142823]">
                  {editingTourId ? "Chỉnh sửa lịch trình Tour" : "Thêm lịch trình Tour mới"}
                </h3>
                <p className="mt-0.5 text-xs text-[#52635A]">
                  Nạp dữ liệu vào kho tri thức LocalMate AI phục vụ phân vùng gợi ý và tư vấn tự động.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTourModalOpen(false)}
                className="rounded-xl p-2 text-[#52635A] hover:bg-[#FAF8F5] hover:text-[#142823] transition-colors cursor-pointer"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSaveTour} className="mt-5 space-y-4">
              {/* Row 1: Mã Tour & Tỉnh/Thành & Phạm vi Scope */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#485951]">
                    Mã tour
                  </label>
                  <input
                    type="text"
                    value={tourFormData.tourCode}
                    onChange={(e) =>
                      setTourFormData({ ...tourFormData, tourCode: e.target.value })
                    }
                    placeholder="HVNT-0031-25"
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#25483F]/15 bg-white px-3.5 text-sm font-mono font-bold text-[#142823] placeholder:text-[#788880] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#485951]">
                    Tỉnh / Thành phố *
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
                        // Auto-fill first destination of province if current destination is blank
                        destination: prev.destination || (prov?.destinations[0] ?? ""),
                      }));
                    }}
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-3 text-sm font-semibold text-[#142823] focus:border-[#173F35] focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Chọn Tỉnh / TP --</option>
                    {PROVINCES.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#485951]">
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
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-3 text-sm font-semibold text-[#142823] focus:border-[#173F35] focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Chọn phạm vi --</option>
                    {TOUR_SCOPES.map((scope) => (
                      <option key={scope.value} value={scope.value}>
                        {scope.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Điểm đến (với Gợi ý con) & Thời lượng */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#485951]">
                      Điểm đến trọng điểm *
                    </label>
                    {modalChildDestinations.length > 0 && (
                      <span className="text-[11px] font-semibold text-[#173F35]">
                        Gợi ý theo {tourFormData.province || "Tỉnh"}:
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={tourFormData.destination}
                    onChange={(e) =>
                      setTourFormData({ ...tourFormData, destination: e.target.value })
                    }
                    placeholder="Sa Pa, Mù Cang Chải, Hồ Thác Bà..."
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#25483F]/15 bg-white px-3.5 text-sm font-semibold text-[#142823] placeholder:text-[#788880] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                  />
                  {/* Quick-select chips */}
                  {modalChildDestinations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {modalChildDestinations.map((dest) => (
                        <button
                          key={dest}
                          type="button"
                          onClick={() => setTourFormData({ ...tourFormData, destination: dest })}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                            tourFormData.destination === dest
                              ? "bg-[#173F35] text-white shadow-xs"
                              : "bg-[#173F35]/8 text-[#173F35] hover:bg-[#173F35]/15"
                          }`}
                        >
                          {dest}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#485951]">
                    Thời lượng *
                  </label>
                  <input
                    type="text"
                    required
                    value={tourFormData.duration}
                    onChange={(e) =>
                      setTourFormData({ ...tourFormData, duration: e.target.value })
                    }
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val) {
                        setTourFormData((prev) => ({
                          ...prev,
                          duration: normalizeTourDuration(val),
                        }));
                      }
                    }}
                    placeholder="Ví dụ: 2 Ngày 1 Đêm, 1 Ngày..."
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#25483F]/15 bg-white px-3.5 text-sm font-semibold text-[#142823] placeholder:text-[#788880] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                  />
                  {/* Quick selection chips for standard durations */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {COMMON_TOUR_DURATIONS.map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() =>
                          setTourFormData({ ...tourFormData, duration: dur })
                        }
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                          tourFormData.duration === dur
                            ? "bg-[#173F35] text-white shadow-xs"
                            : "bg-[#173F35]/8 text-[#173F35] hover:bg-[#173F35]/15"
                        }`}
                      >
                        {dur}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <fieldset className="rounded-2xl border border-[#25483F]/12 bg-[#FBF9F5] p-4">
                <legend className="px-1 text-sm font-bold text-[#173F35]">
                  Tọa độ điểm đến trọng điểm
                </legend>
                <p className="mb-3 text-sm text-[#52635A]">
                  Mốc dùng để tính khoảng cách từ khách sạn. Có thể để trống cho dữ liệu cũ dùng fallback tỉnh/khu vực.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tour-latitude" className="mb-1.5 block text-sm font-semibold text-[#485951]">
                      Vĩ độ
                    </label>
                    <input
                      id="tour-latitude"
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={tourFormData.latitude}
                      onChange={(e) => setTourFormData({ ...tourFormData, latitude: e.target.value })}
                      placeholder="21.033333"
                      className="h-12 w-full rounded-xl border border-[#25483F]/15 bg-white px-4 text-base font-medium text-[#142823] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                    />
                  </div>
                  <div>
                    <label htmlFor="tour-longitude" className="mb-1.5 block text-sm font-semibold text-[#485951]">
                      Kinh độ
                    </label>
                    <input
                      id="tour-longitude"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={tourFormData.longitude}
                      onChange={(e) => setTourFormData({ ...tourFormData, longitude: e.target.value })}
                      placeholder="104.883333"
                      className="h-12 w-full rounded-xl border border-[#25483F]/15 bg-white px-4 text-base font-medium text-[#142823] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Row 3: Tên Lịch trình Tour */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951]">
                  Tên lịch trình tour *
                </label>
                <input
                  type="text"
                  required
                  value={tourFormData.title}
                  onChange={(e) =>
                    setTourFormData({ ...tourFormData, title: e.target.value })
                  }
                  placeholder="HÀ NỘI → MÙ CANG CHẢI – LA PÁN TẨN – TÚ LỆ"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#25483F]/15 bg-white px-3.5 text-base font-bold text-[#142823] placeholder:text-[#788880] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                />
              </div>

              {/* Row 4: Điểm nổi bật (Highlights) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951]">
                  Điểm nổi bật (phân cách bởi dấu phẩy)
                </label>
                <input
                  type="text"
                  value={tourFormData.highlights}
                  onChange={(e) =>
                    setTourFormData({ ...tourFormData, highlights: e.target.value })
                  }
                  placeholder="Đèo Khau Phạ, Ruộng bậc thang Mâm Xôi, Tắm khoáng nóng Trạm Tấu"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#25483F]/15 bg-white px-3.5 text-sm font-medium text-[#142823] placeholder:text-[#788880] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                />
              </div>

              {/* Row 5: Nội dung chi tiết */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951]">
                  Nội dung chi tiết lịch trình *
                </label>
                <textarea
                  rows={6}
                  required
                  value={tourFormData.content}
                  onChange={(e) =>
                    setTourFormData({ ...tourFormData, content: e.target.value })
                  }
                  placeholder="Chi tiết từng ngày, hoạt động trải nghiệm, địa điểm ăn uống, thông tin văn hóa..."
                  className="mt-1.5 w-full rounded-xl border border-[#25483F]/15 bg-white p-3.5 text-sm leading-relaxed text-[#142823] placeholder:text-[#788880] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-[#25483F]/10 pt-4">
                <button
                  type="button"
                  onClick={() => setIsTourModalOpen(false)}
                  className="rounded-xl border border-[#25483F]/15 px-5 py-2.5 text-sm font-bold text-[#5A6861] hover:bg-[#FAF8F5] hover:text-[#142823] transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#173F35] to-[#245347] px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
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
