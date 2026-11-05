"use client";

import type { HousekeepingFilterState } from "../types/housekeeping-contract";
import { getFloorName } from "../utils/housekeeping-helpers";

type HousekeepingFilterBarProps = {
  filter: HousekeepingFilterState;
  onFilterChange: (patch: Partial<HousekeepingFilterState>) => void;
  availableFloors: string[];
  dirtyRoomsCount: number;
  totalRoomsCount: number;
};

export function HousekeepingFilterBar({ filter, onFilterChange, availableFloors, dirtyRoomsCount, totalRoomsCount }: HousekeepingFilterBarProps) {
  return (
    <div className="space-y-3">
      <div aria-label="Trạng thái phòng" className="flex flex-wrap gap-2">
        {([
          ["processing", "Cần dọn", dirtyRoomsCount],
          ["all", "Tất cả", totalRoomsCount],
        ] as const).map(([status, label, count]) => (
          <button
            key={status}
            type="button"
            aria-pressed={filter.status === status}
            onClick={() => onFilterChange({ status })}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-base font-semibold whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${filter.status === status ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-primary-fixed"}`}
          >
            {label} <span className="text-sm">{count}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
        <label className="min-w-0 space-y-1.5 text-sm font-medium text-slate-700">
          <span>Tầng</span>
          <select
            value={filter.floor}
            onChange={(event) => onFilterChange({ floor: event.target.value })}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <option value="all">Tất cả tầng</option>
            {availableFloors.map((floor) => <option key={floor} value={floor}>{getFloorName(floor)}</option>)}
          </select>
        </label>
        <label className="min-w-0 space-y-1.5 text-sm font-medium text-slate-700">
          <span>Tìm phòng</span>
          <input
            type="search"
            value={filter.search}
            onChange={(event) => onFilterChange({ search: event.target.value })}
            placeholder="Số phòng"
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </label>
      </div>
    </div>
  );
}
