"use client";

import { useId, useMemo, useRef, useState, useEffect } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { StaffHotelRoomOption } from "../types/staff-management-contract";

export type RoomSearchSelectProps = {
  rooms: StaffHotelRoomOption[];
  roomUserAssignmentMap: Map<string, string>;
  value: string;
  onChange: (roomId: string) => void;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  placeholder?: string;
};

function inferFloor(roomNumber: string, floor?: string | null): string {
  if (floor && floor.trim()) {
    const f = floor.trim();
    return f.toLowerCase().startsWith("tầng") ? f : `Tầng ${f}`;
  }
  const digits = roomNumber.replace(/\D/g, "");
  if (digits.length >= 3) {
    const floorDigit = digits.slice(0, digits.length - 2);
    return `Tầng ${floorDigit}`;
  }
  return "Khu vực phòng";
}

export function RoomSearchSelect({
  rooms,
  roomUserAssignmentMap,
  value,
  onChange,
  disabled = false,
  error,
  required = false,
  placeholder = "Phòng phụ trách (Tùy chọn)",
}: RoomSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerId = useId();

  // Danh sách phòng đã được backend query lọc chính xác (`unassignedOnly=true`)
  const availableRooms = rooms;

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === value),
    [rooms, value],
  );

  // Click outside and Escape key handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
        clearTimeout(timer);
      };
    }
  }, [isOpen]);

  // Filter and group available rooms
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();

    const matched = availableRooms.filter((r) => {
      if (!q) return true;
      const matchNum = r.roomNumber.toLowerCase().includes(q);
      const matchType = r.type ? r.type.toLowerCase().includes(q) : false;
      const matchCode = r.code ? r.code.toLowerCase().includes(q) : false;
      const matchFloor = r.floor ? r.floor.toLowerCase().includes(q) : false;
      return matchNum || matchType || matchCode || matchFloor;
    });

    // Group by floor
    const groups = new Map<string, StaffHotelRoomOption[]>();
    for (const room of matched) {
      const floorName = inferFloor(room.roomNumber, room.floor);
      const list = groups.get(floorName) ?? [];
      list.push(room);
      groups.set(floorName, list);
    }

    // Sort rooms within each group by roomNumber
    for (const [, list] of groups) {
      list.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
    }

    return Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [availableRooms, search]);

  const hasNoAvailableRooms = availableRooms.length === 0;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        id={triggerId}
        type="button"
        disabled={disabled || hasNoAvailableRooms}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`min-h-11 w-full rounded-lg border px-3 py-2 text-left text-sm transition-all flex items-center justify-between gap-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
          error
            ? "border-red-500 bg-red-50/20 ring-1 ring-red-500/30"
            : isOpen
            ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/15 bg-white"
            : "border-[var(--outline-variant)] bg-white hover:border-slate-400"
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {hasNoAvailableRooms ? (
            <span className="flex items-center gap-1.5 text-slate-400 text-xs sm:text-sm">
              <VsIcon name="block" className="text-base text-slate-400 shrink-0" />
              <span>Hết phòng khả dụng (Đã có người phụ trách hết)</span>
            </span>
          ) : selectedRoom ? (
            <>
              <span className="shrink-0 inline-flex items-center rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-bold text-amber-900">
                P.{selectedRoom.roomNumber}
              </span>
              <span className="truncate text-xs sm:text-sm font-medium text-slate-800">
                {selectedRoom.type || "Tiêu chuẩn"}
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-500 text-xs sm:text-sm">
              <VsIcon name="meeting_room" className="text-base text-slate-400 shrink-0" />
              <span>{placeholder}</span>
              {required ? <span className="text-red-500 font-bold">*</span> : null}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedRoom && !disabled ? (
            <>
              <span
                role="button"
                tabIndex={0}
                title="Bỏ chọn phòng"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onChange("");
                  }
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <VsIcon name="close" className="text-sm" />
              </span>
              <span
                title="Lễ tân phụ trách phòng này. Để trống nếu nhân viên phụ trách chung toàn khách sạn."
                className="inline-flex h-6 w-6 items-center justify-center text-slate-400"
              >
                <VsIcon name="info" className="text-sm" />
              </span>
            </>
          ) : (
            <VsIcon
              name={isOpen ? "expand_less" : "expand_more"}
              className="text-slate-400 text-lg transition-transform"
            />
          )}
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen ? (
        <div className="absolute left-0 top-full mt-1.5 w-full min-w-[300px] sm:min-w-[340px] max-w-[420px] z-50 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Bar & Available Count */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/80">
            <div className="relative flex items-center">
              <VsIcon name="search" className="absolute left-2.5 text-slate-400 text-base pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm số phòng hoặc loại phòng (VD: 101, Deluxe...)"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600"
                >
                  <VsIcon name="close" className="text-sm" />
                </button>
              ) : null}
            </div>

            <div className="mt-2 flex items-center justify-between text-xs px-0.5">
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                {availableRooms.length} phòng khả dụng để phân công
              </span>
              {search ? (
                <span className="text-slate-500">Khớp {filteredGroups.reduce((acc, [, list]) => acc + list.length, 0)} phòng</span>
              ) : null}
            </div>
          </div>

          {/* Rooms Scroll List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 p-1">
            {filteredGroups.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                <VsIcon name="search_off" className="mx-auto mb-1 text-2xl text-slate-300 block" />
                {search
                  ? `Không tìm thấy phòng phù hợp với "${search}"`
                  : "Không còn phòng trống nào để phân công."}
              </div>
            ) : (
              filteredGroups.map(([floorName, floorRooms]) => (
                <div key={floorName} className="py-1">
                  <div className="sticky top-0 z-10 bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {floorName} ({floorRooms.length})
                  </div>
                  <div className="space-y-0.5 px-1">
                    {floorRooms.map((room) => {
                      const isSelected = room.id === value;

                      return (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => {
                            onChange(room.id);
                            setIsOpen(false);
                          }}
                          className={`w-full rounded-lg px-2.5 py-2 text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? "bg-amber-50 border border-amber-300 text-amber-950 font-semibold"
                              : "hover:bg-slate-100 text-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${
                                isSelected
                                  ? "bg-amber-200 text-amber-900"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              P.{room.roomNumber}
                            </span>
                            <span className="truncate text-xs">
                              {room.type || "Tiêu chuẩn"}
                            </span>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5">
                            {isSelected ? (
                              <span className="flex items-center gap-1 text-[11px] text-amber-800 font-semibold">
                                <VsIcon name="check" className="text-sm font-bold text-amber-700" />
                                Đang chọn
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                Khả dụng
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Guidance */}
          <div className="p-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Danh sách chỉ hiển thị các phòng chưa phân công</span>
            {required ? (
              <span className="text-red-500 font-medium">* Bắt buộc</span>
            ) : (
              <span className="text-slate-500 font-medium">* Tùy chọn</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
