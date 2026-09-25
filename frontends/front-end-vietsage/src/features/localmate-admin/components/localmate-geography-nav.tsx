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
      const detected = detectProvinceFromDestination(t.destination, t.title);
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
      <div className="lg:hidden mb-4 rounded-2xl border border-[#25483F]/15 bg-white p-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#173F35] text-white shadow-xs">
              <VsIcon name="map" className="text-base" />
            </span>
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold text-[#5A6861] uppercase tracking-wider">
                Bộ lọc khu vực:
              </span>
              <p className="truncate text-sm font-bold text-[#142823]">
                {activeLabel}{" "}
                <span className="text-xs text-[#173F35] font-bold">
                  ({provinceFilter !== "ALL" ? provinceCounts[provinceFilter] ?? 0 : totalToursCount})
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#25483F]/20 bg-[#FAF8F5] px-3 text-xs font-bold text-[#173F35] hover:bg-[#173F35] hover:text-white transition-all cursor-pointer shrink-0"
          >
            <VsIcon name="filter_list" className="text-base" />
            <span>{isMobileOpen ? "Đóng" : "Chọn vùng"}</span>
          </button>
        </div>

        {isMobileOpen && (
          <div className="mt-3 pt-3 border-t border-[#25483F]/10">
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
            />
          </div>
        )}
      </div>

      {/* Desktop Vertical Nav Sidebar (>= lg) */}
      <aside className="hidden lg:block w-72 shrink-0 sticky top-6">
        <div className="rounded-2xl border border-[#25483F]/12 bg-white p-3 shadow-[0_4px_20px_rgba(20,40,35,0.04)] transition-all">
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
}: NavigationListProps) {
  return (
    <div className="space-y-1.5">
      {/* 1. Tất cả Tỉnh / TP */}
      <button
        type="button"
        onClick={handleSelectAll}
        className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-all cursor-pointer ${
          isAllActive
            ? "bg-[#EAF3EE] text-[#173F35] font-bold border-l-4 border-[#173F35]"
            : "text-[#30413A] hover:bg-[#FAF8F5] hover:text-[#173F35] font-semibold"
        }`}
      >
        <VsIcon
          name="explore"
          className={`text-lg shrink-0 ${isAllActive ? "text-[#173F35]" : "text-[#5A6861]"}`}
        />
        <span className="text-[14.5px] leading-tight">Tất cả Tỉnh / TP</span>
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
              className={`group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm transition-all cursor-pointer ${
                isRegionActive
                  ? "bg-[#EAF3EE] text-[#173F35] font-bold border-l-4 border-[#173F35]"
                  : regionFilter === region.code
                  ? "text-[#173F35] font-bold bg-[#173F35]/5"
                  : "text-[#30413A] hover:bg-[#FAF8F5] hover:text-[#173F35] font-semibold"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <VsIcon
                  name={region.iconName}
                  className={`text-lg shrink-0 ${
                    isRegionActive || regionFilter === region.code
                      ? "text-[#173F35]"
                      : "text-[#5A6861]"
                  }`}
                />
                <span className="truncate text-[14.5px] leading-tight">{region.name}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                    isRegionActive
                      ? "bg-[#173F35] text-white"
                      : regionTourCount > 0
                      ? "bg-[#EAF3EE] text-[#173F35]"
                      : "bg-[#F3EFE6] text-[#7A8B83]"
                  }`}
                >
                  {regionTourCount}
                </span>

                <button
                  type="button"
                  onClick={(e) => toggleRegionAccordion(region.code, e)}
                  title={isRegionExpanded ? "Thu gọn" : "Mở rộng"}
                  className="p-1 text-[#788880] hover:text-[#142823] transition-transform rounded-md hover:bg-black/5 cursor-pointer"
                >
                  <VsIcon
                    name={isRegionExpanded ? "expand_more" : "chevron_right"}
                    className="text-sm"
                  />
                </button>
              </div>
            </div>

            {/* Provinces List (when expanded) */}
            {isRegionExpanded && (
              <div className="mt-1 space-y-1 pl-3.5 pr-1 py-1 max-h-80 overflow-y-auto">
                {sortedProvinces.map((prov) => {
                  const isProvActive = provinceFilter === prov.code;
                  const tourCount = provinceCounts[prov.code] ?? 0;

                  return (
                    <button
                      key={prov.code}
                      type="button"
                      onClick={() => handleProvinceClick(prov)}
                      className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-all cursor-pointer ${
                        isProvActive
                          ? "bg-[#EAF3EE] text-[#173F35] font-bold border-l-3 border-[#173F35]"
                          : "text-[#3D4F46] hover:bg-[#FAF8F5] hover:text-[#142823] font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <VsIcon
                          name="location_on"
                          className={`text-base shrink-0 ${
                            isProvActive
                              ? "text-[#173F35]"
                              : tourCount > 0
                              ? "text-[#16805C]"
                              : "text-[#9AA59F]"
                          }`}
                        />
                        <span className="truncate text-[13.5px]">{prov.name}</span>
                      </div>

                      <span
                        className={`text-xs font-bold tabular-nums ml-2 ${
                          isProvActive
                            ? "text-[#173F35]"
                            : tourCount > 0
                            ? "text-[#173F35]"
                            : "text-[#9AA59F]"
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
