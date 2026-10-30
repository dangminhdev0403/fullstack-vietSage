"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { HotelArrival } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  buildFrontDeskGroupSummaries,
  type FrontDeskGroupSummary,
} from "@/features/hotel-ops/utils/front-desk-groups";

export type GroupArrivalsListModalProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  arrivals: HotelArrival[];
  todayYmd: string;
  onSelectGroup: (groupCode: string) => void;
};

const ITEMS_PER_PAGE = 5;

function formatDateOnly(value?: string | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
  }).format(date);
}

export function GroupArrivalsListModal({
  isOpen,
  onClose,
  arrivals,
  onSelectGroup,
}: GroupArrivalsListModalProps) {
  const titleId = useId();
  const descId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "READY" | "IN_HOUSE" | "COMPLETED">("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  // Keyboard escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Aggregate arrivals into group summaries
  const allGroups = useMemo(() => {
    return buildFrontDeskGroupSummaries(arrivals);
  }, [arrivals]);

  // Status counts
  const counts = useMemo(() => {
    let ready = 0;
    let inHouse = 0;
    let completed = 0;

    for (const g of allGroups) {
      const isFullyCheckedIn = g.checkedInRooms === g.totalRooms;
      const isPartiallyCheckedIn = g.checkedInRooms > 0 && !isFullyCheckedIn;

      if (isFullyCheckedIn) {
        completed += 1;
      } else if (isPartiallyCheckedIn) {
        inHouse += 1;
      } else if (g.arrivingRooms > 0) {
        ready += 1;
      }
    }

    return { total: allGroups.length, ready, inHouse, completed };
  }, [allGroups]);

  // Filter groups by search query and status filter
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allGroups.filter((g) => {
      // Status check
      const isFullyCheckedIn = g.checkedInRooms === g.totalRooms;
      const isPartiallyCheckedIn = g.checkedInRooms > 0 && !isFullyCheckedIn;
      const isReady = !isFullyCheckedIn && g.arrivingRooms > 0;

      if (statusFilter === "READY" && !isReady) return false;
      if (statusFilter === "IN_HOUSE" && !isPartiallyCheckedIn) return false;
      if (statusFilter === "COMPLETED" && !isFullyCheckedIn) return false;

      // Search check
      if (q) {
        const matchesCode = g.groupCode.toLowerCase().includes(q);
        const matchesName = g.leadGuestName.toLowerCase().includes(q);
        const matchesPhone = Boolean(g.leadGuestPhone?.includes(q));
        const matchesRoom = g.assignedRoomNumbers.some((num) => num.includes(q));
        if (!matchesCode && !matchesName && !matchesPhone && !matchesRoom) {
          return false;
        }
      }

      return true;
    });
  }, [allGroups, searchQuery, statusFilter]);

  // Pagination calculation
  const totalItems = filteredGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedGroups = filteredGroups.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        className="w-full max-w-6xl xl:max-w-7xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200"
      >
        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 shadow-2xs">
              <VsIcon name="groups" className="text-xl" />
            </div>
            <div>
              <h2
                id={titleId}
                className="text-base sm:text-lg font-bold text-slate-900 text-balance"
              >
                Danh sách đoàn đặt trước
              </h2>
              <p id={descId} className="text-xs text-slate-600 text-pretty">
                Chọn đoàn cần làm thủ tục để tiến hành xác thực CCCD / Hộ chiếu cho từng phòng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer min-h-[44px] min-w-[44px]"
          >
            <VsIcon name="close" className="text-lg" />
          </button>
        </header>

        {/* SEARCH & FILTER CONTROLS */}
        <section className="border-b border-slate-200 bg-white px-6 py-3 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-lg">
              <VsIcon
                name="search"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Tìm mã đoàn (#GRP), tên đoàn, SĐT..."
                className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-4 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 outline-none transition shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <VsIcon name="close" className="text-sm" />
                </button>
              )}
            </div>

            {/* Quick Status Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => { setStatusFilter("ALL"); setCurrentPage(1); }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer min-h-[36px] whitespace-nowrap ${
                  statusFilter === "ALL"
                    ? "bg-purple-700 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span>Tất cả ({counts.total})</span>
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter("READY"); setCurrentPage(1); }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer min-h-[36px] whitespace-nowrap ${
                  statusFilter === "READY"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span>Chờ nhận ({counts.ready})</span>
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter("IN_HOUSE"); setCurrentPage(1); }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer min-h-[36px] whitespace-nowrap ${
                  statusFilter === "IN_HOUSE"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span>Đang nhận ({counts.inHouse})</span>
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter("COMPLETED"); setCurrentPage(1); }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer min-h-[36px] whitespace-nowrap ${
                  statusFilter === "COMPLETED"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span>Đã nhận đủ ({counts.completed})</span>
              </button>
            </div>
          </div>
        </section>

        {/* TABLE CONTENT */}
        <main className="flex-1 overflow-y-auto px-6 py-4">
          {filteredGroups.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 mx-auto shadow-2xs">
                <VsIcon name="groups" className="text-2xl" />
              </div>
              <h3 className="text-base font-bold text-slate-800 text-balance">
                Không tìm thấy đoàn khách nào
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto text-pretty">
                {searchQuery
                  ? "Không có đoàn khách nào khớp với từ khóa tìm kiếm. Vui lòng kiểm tra lại mã đoàn hoặc số điện thoại."
                  : "Hiện chưa có đoàn khách nào có lịch nhận phòng trong khoảng thời gian này."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <th scope="col" className="px-4 py-3 whitespace-nowrap">Đoàn khách</th>
                      <th scope="col" className="px-4 py-3 whitespace-nowrap">Quy mô phòng</th>
                      <th scope="col" className="px-4 py-3 whitespace-nowrap">Thời gian lưu trú</th>
                      <th scope="col" className="px-4 py-3 whitespace-nowrap">Trạng thái đoàn</th>
                      <th scope="col" className="w-36 px-4 py-3 text-right whitespace-nowrap">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedGroups.map((group) => {
                      const isFullyCheckedIn = group.checkedInRooms === group.totalRooms;
                      const isPartiallyCheckedIn = group.checkedInRooms > 0 && !isFullyCheckedIn;
                      const canCheckIn = group.checkedInRooms < group.totalRooms;

                      return (
                        <tr
                          key={group.groupCode}
                          tabIndex={0}
                          role="button"
                          aria-label={`Chọn đoàn #${group.groupCode} - ${group.leadGuestName}`}
                          onClick={() => {
                            if (canCheckIn) {
                              onSelectGroup(group.groupCode);
                              onClose();
                            }
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && canCheckIn) {
                              e.preventDefault();
                              onSelectGroup(group.groupCode);
                              onClose();
                            }
                          }}
                          className={`group transition-colors ${
                            canCheckIn
                              ? "cursor-pointer hover:bg-purple-50/50 focus-visible:bg-purple-50/70 focus-visible:outline-none"
                              : "hover:bg-slate-50/60"
                          }`}
                        >
                          {/* Đoàn khách */}
                          <td className="px-4 py-3 align-middle whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 whitespace-nowrap font-mono shadow-2xs">
                                <VsIcon name="groups" className="h-3.5 w-3.5 text-purple-600" />
                                <span>#{group.groupCode}</span>
                              </span>
                              <div>
                                <span className="font-bold text-slate-900 text-sm group-hover:text-purple-900 transition-colors block">
                                  {group.leadGuestName}
                                </span>
                                {group.leadGuestPhone && (
                                  <span className="text-xs text-slate-500 font-medium">
                                    ĐT: {group.leadGuestPhone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Quy mô phòng */}
                          <td className="px-4 py-3 align-middle whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">
                                {group.totalRooms} phòng
                              </span>
                              {group.unassignedRoomCount > 0 ? (
                                <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
                                  {group.unassignedRoomCount} chưa gán
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 whitespace-nowrap">
                                  Đã gán đủ
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Thời gian lưu trú */}
                          <td className="px-4 py-3 align-middle whitespace-nowrap text-xs sm:text-sm font-medium text-slate-700">
                            <div className="flex items-center gap-1.5">
                              <span>{formatDateOnly(group.earliestCheckInAt)}</span>
                              <span className="text-slate-400">→</span>
                              <span>{formatDateOnly(group.latestCheckOutAt)}</span>
                            </div>
                          </td>

                          {/* Trạng thái đoàn */}
                          <td className="px-4 py-3 align-middle whitespace-nowrap">
                            {isFullyCheckedIn ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 whitespace-nowrap">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                <span>Đã nhận đủ phòng</span>
                              </span>
                            ) : isPartiallyCheckedIn ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-800 whitespace-nowrap">
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                                <span>Đang nhận ({group.checkedInRooms}/{group.totalRooms})</span>
                              </span>
                            ) : group.arrivingRooms > 0 ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 whitespace-nowrap">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                                <span>Chờ nhận phòng</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                                <span>Đã kết thúc</span>
                              </span>
                            )}
                          </td>

                          {/* Thao tác */}
                          <td className="w-36 px-4 py-3 align-middle text-right whitespace-nowrap">
                            {canCheckIn ? (
                              <button
                                type="button"
                                title={`Check-in cho đoàn #${group.groupCode}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectGroup(group.groupCode);
                                  onClose();
                                }}
                                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white px-3 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer whitespace-nowrap active:scale-[0.98]"
                              >
                                <VsIcon name="badge" className="text-sm" />
                                <span>Check-in đoàn</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
                                <VsIcon name="check_circle" className="text-sm" />
                                <span>Đã xong</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        {/* PAGINATION FOOTER */}
        <footer className="border-t border-slate-200 bg-slate-50/80 px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-medium text-slate-600">
            {totalItems > 0 ? (
              <span>
                Hiển thị <span className="font-bold text-slate-900">{startIndex + 1}</span> -{" "}
                <span className="font-bold text-slate-900">
                  {Math.min(startIndex + ITEMS_PER_PAGE, totalItems)}
                </span>{" "}
                trên tổng số <span className="font-bold text-slate-900">{totalItems}</span> đoàn
              </span>
            ) : (
              <span>Không có dữ liệu</span>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer min-h-[32px]"
              >
                <VsIcon name="chevron_left" className="text-sm" />
                <span>Trước</span>
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 min-w-[32px] rounded-lg px-2 text-xs font-bold transition cursor-pointer min-h-[32px] ${
                      pageNum === safePage
                        ? "bg-purple-700 text-white shadow-2xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer min-h-[32px]"
              >
                <span>Sau</span>
                <VsIcon name="chevron_right" className="text-sm" />
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
