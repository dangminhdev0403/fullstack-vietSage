"use client";

import { useState } from "react";
import type { HousekeepingAssignmentScope, StaffHotelRoomOption } from "../types/staff-management-contract";

export const ALL_HOUSEKEEPING_ROOMS: HousekeepingAssignmentScope = { mode: "ALL", floors: [], roomIds: [], label: null };

export function housekeepingScopeLabel(scope?: HousekeepingAssignmentScope | null) {
  if (!scope || scope.mode === "ALL") return "Toàn khách sạn";
  if (scope.mode === "FLOORS") return `Tầng ${scope.floors.join(", ")}`;
  return `${scope.label || "Khu vực"} · ${scope.roomIds.length} phòng`;
}

export function HousekeepingScopeEditor({ value, rooms, onChange, disabled }: {
  value: HousekeepingAssignmentScope;
  rooms: StaffHotelRoomOption[];
  onChange: (scope: HousekeepingAssignmentScope) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const floors = [...new Set(rooms.map((room) => room.floor).filter((floor): floor is string => Boolean(floor)))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
  const visibleRooms = rooms.filter((room) => room.roomNumber.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (values: string[], id: string) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-[var(--outline-variant)] p-3 text-base text-[var(--on-surface)]">
      <legend className="px-1 font-semibold">Phân công buồng phòng</legend>
      <label className="block space-y-1">
        <span>Phạm vi</span>
        <select value={value.mode} onChange={(event) => { onChange({ mode: event.target.value as HousekeepingAssignmentScope["mode"], floors: [], roomIds: [], label: null }); setSearch(""); }} className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] px-3">
          <option value="ALL">Toàn khách sạn</option>
          <option value="FLOORS">Theo tầng</option>
          <option value="ROOMS">Theo khu vực / nhóm phòng</option>
        </select>
      </label>
      {value.mode === "FLOORS" ? (
        <div className="max-h-44 overflow-y-auto overscroll-contain">
          {floors.length ? floors.map((floor) => <label key={floor} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={value.floors.includes(floor)} onChange={() => onChange({ ...value, floors: toggle(value.floors, floor) })} className="size-5 accent-[var(--primary)]" /><span>Tầng {floor}</span></label>) : <p role="status">Chưa có tầng. Chọn theo khu vực / nhóm phòng.</p>}
        </div>
      ) : null}
      {value.mode === "ROOMS" ? (
        <>
          <label className="block space-y-1"><span>Tên khu vực</span><input value={value.label ?? ""} maxLength={80} onChange={(event) => onChange({ ...value, label: event.target.value || null })} placeholder="Ví dụ: Khu A" className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] px-3" /></label>
          <label className="block space-y-1"><span>Chọn phòng ({value.roomIds.length})</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm số phòng" className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] px-3" /></label>
          <div className="max-h-44 overflow-y-auto overscroll-contain">
            {visibleRooms.map((room) => <label key={room.id} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={value.roomIds.includes(room.id)} onChange={() => onChange({ ...value, roomIds: toggle(value.roomIds, room.id) })} className="size-5 accent-[var(--primary)]" /><span>Phòng {room.roomNumber}{room.floor ? ` · Tầng ${room.floor}` : ""}</span></label>)}
            {!visibleRooms.length ? <p role="status">Không có phòng phù hợp.</p> : null}
          </div>
        </>
      ) : null}
    </fieldset>
  );
}
