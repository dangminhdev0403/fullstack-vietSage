"use client";

import { useMemo, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  PROVINCE_MAP,
  PROVINCES,
  REGIONS,
  detectProvinceFromDestination,
  type ProvinceTaxonomy,
  type RegionCode,
  type RegionTaxonomy,
} from "../constants/geography";
import type { LocalMateTourKnowledge } from "../types";

interface LocalMateGeographyNavProps {
  regionFilter: "ALL" | RegionCode;
  onSelectRegion: (region: "ALL" | RegionCode) => void;
  provinceFilter: string;
  onSelectProvince: (provinceCode: string) => void;
  tours: LocalMateTourKnowledge[];
}

export function LocalMateGeographyNav({
  regionFilter,
  onSelectRegion,
  provinceFilter,
  onSelectProvince,
  tours,
}: LocalMateGeographyNavProps) {
  // Compute tour counts per province and per region
  const { provinceCounts, regionCounts, totalToursCount } = useMemo(() => {
    const pCounts: Record<string, number> = {};
    const rCounts: Record<RegionCode, number> = {
      BAC: 0,
      TRUNG: 0,
      TAY_NGUYEN: 0,
      NAM: 0,
    };

    for (const p of PROVINCES) {
      pCounts[p.code] = 0;
    }

    for (const t of tours) {
      const detected = detectProvinceFromDestination(t.title);
      const code = t.provinceCode || detected?.code;

      if (code) {
        pCounts[code] = (pCounts[code] || 0) + 1;
        const tax = PROVINCE_MAP[code];
        if (tax?.regionCode && rCounts[tax.regionCode] !== undefined) {
          rCounts[tax.regionCode] += 1;
        }
      }
    }

    return {
      provinceCounts: pCounts,
      regionCounts: rCounts,
      totalToursCount: tours.length,
    };
  }, [tours]);

  // Initial expanded state: ONLY expand the region that has tours or matches active filter!
  // In our system, Miền Bắc has active tours, so by default only BAC is expanded.
  const [expandedRegions, setExpandedRegions] = useState<Record<RegionCode, boolean>>({
    BAC: true,
    TRUNG: false,
    TAY_NGUYEN: false,
    NAM: false,
  });

  // Mobile toggle drawer
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggleRegionAccordion = (regionCode: RegionCode, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRegions((prev) => ({
      ...prev,
      [regionCode]: !prev[regionCode],
    }));
  };

  const handleSelectAll = () => {
    onSelectRegion("ALL");
    onSelectProvince("ALL");
    setIsMobileOpen(false);
  };

  const handleRegionClick = (region: RegionTaxonomy) => {
    // If clicking a collapsed region, auto-expand it
    if (!expandedRegions[region.code]) {
      setExpandedRegions((prev) => ({ ...prev, [region.code]: true }));
    }

    if (regionFilter === region.code && provinceFilter === "ALL") {
      onSelectRegion("ALL");
    } else {
      onSelectRegion(region.code);
      onSelectProvince("ALL");
    }
    setIsMobileOpen(false);
  };

  const handleProvinceClick = (prov: ProvinceTaxonomy) => {
    onSelectRegion(prov.regionCode);
    onSelectProvince(prov.code);
    setIsMobileOpen(false);
  };

  const isAllActive = regionFilter === "ALL" && provinceFilter === "ALL";

  // Label for mobile trigger button
  const activeLabel = useMemo(() => {
    if (provinceFilter !== "ALL") {
      return PROVINCE_MAP[provinceFilter]?.name ?? provinceFilter;
    }
    if (regionFilter !== "ALL") {
      const r = REGIONS.find((item) => item.code === regionFilter);
      return r ? r.name : "Toàn quốc";
    }
    return "Tất cả Tỉnh / TP";
  }, [provinceFilter, regionFilter]);

  return (
    <>
      {/* Mobile Drawer Trigger Bar (< lg) */}
      <div className="lg:hidden mb-4 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-800 text-white shadow-xs">
              <VsIcon name="map" className="text-base" />
            </span>
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Bộ lọc khu vực:
              </span>
              <p className="truncate text-sm font-semibold text-stone-900">
                {activeLabel}{" "}
                <span className="text-xs text-emerald-800 font-semibold">
                  ({provinceFilter !== "ALL" ? provinceCounts[provinceFilter] ?? 0 : totalToursCount})
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 text-base font-semibold text-stone-700 hover:bg-emerald-800 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <VsIcon name="filter_list" className="text-base" />
            <span>{isMobileOpen ? "Đóng" : "Chọn vùng"}</span>
          </button>
        </div>

        {isMobileOpen && (
          <div className="mt-3 pt-3 border-t border-stone-100">
            <NavigationList
              isAllActive={isAllActive}
              handleSelectAll={handleSelectAll}
              regionFilter={regionFilter}
              provinceFilter={provinceFilter}
              handleRegionClick={handleRegionClick}
              toggleRegionAccordion={toggleRegionAccordion}
              expandedRegions={expandedRegions}
              handleProvinceClick={handleProvinceClick}
              regionCounts={regionCounts}
              provinceCounts={provinceCounts}
              totalToursCount={totalToursCount}
            />
          </div>
        )}
      </div>

      {/* Desktop Vertical Nav Sidebar (>= lg) */}
      <aside className="hidden lg:block w-72 shrink-0 sticky top-6">
        <div className="rounded-2xl border border-stone-200/80 bg-white p-3 shadow-xs transition-all">
          <div className="flex items-center justify-between px-2.5 py-1.5 mb-2 border-b border-stone-100">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
              Phân vùng địa lý
            </span>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/70">
              {totalToursCount} tour
            </span>
          </div>

          {/* Nav List */}
          <NavigationList
            isAllActive={isAllActive}
            handleSelectAll={handleSelectAll}
            regionFilter={regionFilter}
            provinceFilter={provinceFilter}
            handleRegionClick={handleRegionClick}
            toggleRegionAccordion={toggleRegionAccordion}
            expandedRegions={expandedRegions}
            handleProvinceClick={handleProvinceClick}
            regionCounts={regionCounts}
            provinceCounts={provinceCounts}
            totalToursCount={totalToursCount}
          />
        </div>
      </aside>
    </>
  );
}

interface NavigationListProps {
  isAllActive: boolean;
  handleSelectAll: () => void;
  regionFilter: "ALL" | RegionCode;
  provinceFilter: string;
  handleRegionClick: (region: RegionTaxonomy) => void;
  toggleRegionAccordion: (regionCode: RegionCode, e: React.MouseEvent) => void;
  expandedRegions: Record<RegionCode, boolean>;
  handleProvinceClick: (prov: ProvinceTaxonomy) => void;
  regionCounts: Record<RegionCode, number>;
  provinceCounts: Record<string, number>;
  totalToursCount: number;
}

function NavigationList({
  isAllActive,
  handleSelectAll,
  regionFilter,
  provinceFilter,
  handleRegionClick,
  toggleRegionAccordion,
  expandedRegions,
  handleProvinceClick,
  regionCounts,
  provinceCounts,
  totalToursCount,
}: NavigationListProps) {
  return (
    <div className="space-y-1">
      {/* 1. Tất cả Tỉnh / TP */}
      <button
        type="button"
        onClick={handleSelectAll}
        className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
          isAllActive
            ? "bg-emerald-800 text-white font-semibold shadow-xs"
            : "text-stone-700 hover:bg-stone-50 hover:text-stone-900 font-medium"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <VsIcon
            name="explore"
            className={`text-base shrink-0 ${isAllActive ? "text-white" : "text-stone-400"}`}
          />
          <span className="text-sm">Tất cả Tỉnh / TP</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            isAllActive
              ? "bg-emerald-900/60 text-emerald-100"
              : "bg-stone-100 text-stone-500"
          }`}
        >
          {totalToursCount}
        </span>
      </button>

      {/* 2. 4 Khu vực chính */}
      {REGIONS.map((region) => {
        const isRegionActive = regionFilter === region.code && provinceFilter === "ALL";
        const isRegionExpanded = expandedRegions[region.code];
        const allProvinces = PROVINCES.filter((p) => p.regionCode === region.code);
        const regionTourCount = regionCounts[region.code] ?? 0;

        // Sort provinces: ones with tours first, then alphabetical
        const sortedProvinces = [...allProvinces].sort((a, b) => {
          const countA = provinceCounts[a.code] ?? 0;
          const countB = provinceCounts[b.code] ?? 0;
          if (countA !== countB) return countB - countA;
          return a.name.localeCompare(b.name, "vi");
        });

        return (
          <div key={region.code} className="rounded-xl">
            {/* Region Header Row */}
            <div
              onClick={() => handleRegionClick(region)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleRegionClick(region);
                }
              }}
              role="button"
              tabIndex={0}
              className={`group flex min-h-11 items-center justify-between rounded-xl px-3 py-2 text-base transition-colors cursor-pointer ${
                isRegionActive
                  ? "bg-emerald-800 text-white font-semibold shadow-xs"
                  : regionFilter === region.code
                  ? "bg-emerald-50 text-emerald-900 font-semibold"
                  : "text-stone-700 hover:bg-stone-50 hover:text-stone-900 font-medium"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <VsIcon
                  name={region.iconName}
                  className={`text-base shrink-0 ${
                    isRegionActive
                      ? "text-white"
                      : regionFilter === region.code
                      ? "text-emerald-700"
                      : "text-stone-400"
                  }`}
                />
                <span className="truncate text-sm">{region.name}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                    isRegionActive
                      ? "bg-emerald-900/60 text-emerald-100"
                      : regionTourCount > 0
                      ? "bg-emerald-100/70 text-emerald-800"
                      : "bg-stone-100 text-stone-400"
                  }`}
                >
                  {regionTourCount}
                </span>

                <button
                  type="button"
                  onClick={(e) => toggleRegionAccordion(region.code, e)}
                  title={isRegionExpanded ? "Thu gọn" : "Mở rộng"}
                  className={`p-0.5 transition-transform rounded-md cursor-pointer ${
                    isRegionActive
                      ? "text-white/80 hover:text-white"
                      : "text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  <VsIcon
                    name={isRegionExpanded ? "expand_more" : "chevron_right"}
                    className="text-base"
                  />
                </button>
              </div>
            </div>

            {/* Provinces List (when expanded) */}
            {isRegionExpanded && (
              <div className="mt-1 space-y-0.5 pl-3 pr-1 py-1 max-h-80 overflow-y-auto">
                {sortedProvinces.map((prov) => {
                  const isProvActive = provinceFilter === prov.code;
                  const tourCount = provinceCounts[prov.code] ?? 0;

                  return (
                    <button
                      key={prov.code}
                      type="button"
                      onClick={() => handleProvinceClick(prov)}
                      className={`w-full flex min-h-11 items-center justify-between rounded-lg px-2.5 py-1.5 text-base transition-colors cursor-pointer ${
                        isProvActive
                          ? "bg-emerald-100/80 text-emerald-900 font-semibold"
                          : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <VsIcon
                          name="location_on"
                          className={`text-sm shrink-0 ${
                            isProvActive
                              ? "text-emerald-800"
                              : tourCount > 0
                              ? "text-emerald-600"
                              : "text-stone-300"
                          }`}
                        />
                        <span className="truncate">{prov.name}</span>
                      </div>

                      <span
                        className={`text-xs tabular-nums ml-2 font-medium ${
                          isProvActive
                            ? "text-emerald-900 font-semibold"
                            : tourCount > 0
                            ? "text-emerald-700 font-semibold"
                            : "text-stone-300"
                        }`}
                      >
                        {tourCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
