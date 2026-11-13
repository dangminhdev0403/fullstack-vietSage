"use client";

import { useMemo, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type {
  PriorityRoomAlertItem,
  PriorityRoomBucket,
} from "@/features/hotel-ops/utils/priority-room-alerts";

type FilterBucket = "all" | PriorityRoomBucket;

type BucketStyle = {
  pillClass: string;
  dotClass: string;
  iconName: string;
};

const BUCKET_STYLES: Record<PriorityRoomBucket, BucketStyle> = {
  overdue: {
    pillClass: "border-rose-200 bg-rose-50 text-rose-800",
    dotClass: "bg-rose-600",
    iconName: "schedule",
  },
  urgent: {
    pillClass: "border-amber-200 bg-amber-50 text-amber-800",
    dotClass: "bg-amber-600",
    iconName: "bolt",
  },
  due: {
    pillClass: "border-purple-200 bg-purple-50 text-purple-800",
    dotClass: "bg-purple-600",
    iconName: "calendar_today",
  },
};

const DEFAULT_VISIBLE_LIMIT = 6;

export type PriorityRoomsControlSectionProps = {
  items: PriorityRoomAlertItem[];
  targetDateLabel: string;
  isFutureDate: boolean;
  canCheckInStay: boolean;
  canManageRooms: boolean;
  canManageReservations: boolean;
  onInspectItem: (item: PriorityRoomAlertItem, triggerEl: HTMLElement | null) => void;
  onPrimaryAction: (item: PriorityRoomAlertItem, triggerEl: HTMLElement | null) => void;
};

function getPrimaryActionButtonClass(item: PriorityRoomAlertItem): string {
  switch (item.bucket) {
    case "overdue":
      return "border-rose-300 bg-rose-600 text-white hover:bg-rose-700";
    case "urgent":
      return "border-amber-300 bg-amber-600 text-white hover:bg-amber-700";
    case "due":
      return "border-purple-300 bg-purple-700 text-white hover:bg-purple-800";
  }
}

function isDirectMutationAction(item: PriorityRoomAlertItem): boolean {
  return item.actionKind === "check-in" || item.actionKind === "mark-ready";
}

function canExecutePrimaryAction(
  item: PriorityRoomAlertItem,
  permissions: {
    canCheckInStay: boolean;
    canManageRooms: boolean;
    canManageReservations: boolean;
  },
): boolean {
  switch (item.actionKind) {
    case "check-in":
      return permissions.canCheckInStay;
    case "mark-ready":
      return permissions.canManageRooms;
    case "assign-room":
      return permissions.canManageReservations || permissions.canCheckInStay;
    case "manage-stay":
    case "resolve-room":
      return true;
  }
}

function PriorityRowActions({
  item,
  permissions,
  fullWidthOnMobile,
  onInspectItem,
  onPrimaryAction,
}: {
  item: PriorityRoomAlertItem;
  permissions: {
    canCheckInStay: boolean;
    canManageRooms: boolean;
    canManageReservations: boolean;
  };
  fullWidthOnMobile?: boolean;
  onInspectItem: (item: PriorityRoomAlertItem, triggerEl: HTMLElement | null) => void;
  onPrimaryAction: (item: PriorityRoomAlertItem, triggerEl: HTMLElement | null) => void;
}) {
  const canPrimary = canExecutePrimaryAction(item, permissions);
  const directMutation = isDirectMutationAction(item);
  const buttonHeight = fullWidthOnMobile ? "min-h-[44px] flex-1" : "min-h-[38px]";

  if (!directMutation) {
    return (
      <button
        type="button"
        onClick={(e) => onInspectItem(item, e.currentTarget)}
        className={`inline-flex ${buttonHeight} items-center justify-center rounded-xl border px-3.5 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25 ${
          canPrimary
            ? getPrimaryActionButtonClass(item)
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {canPrimary ? item.actionLabel : "Chi tiết"}
      </button>
    );
  }

  return (
    <>
      {canPrimary ? (
        <button
          type="button"
          onClick={(e) => onPrimaryAction(item, e.currentTarget)}
          className={`inline-flex ${buttonHeight} items-center justify-center rounded-xl border px-3.5 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25 ${getPrimaryActionButtonClass(item)}`}
        >
          {item.actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={(e) => onInspectItem(item, e.currentTarget)}
        className={`inline-flex ${buttonHeight} items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20`}
      >
        Chi tiết
      </button>
    </>
  );
}

/**
 * Displays overdue stays/arrivals, urgent prep rooms, and due pre-bookings
 * only when at least one actionable item exists.
 */
export function PriorityRoomsControlSection({
  items,
  targetDateLabel,
  isFutureDate,
  canCheckInStay,
  canManageRooms,
  canManageReservations,
  onInspectItem,
  onPrimaryAction,
}: PriorityRoomsControlSectionProps) {
  const [selectedBucket, setSelectedBucket] = useState<FilterBucket>("all");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const counts = useMemo(() => {
    let overdue = 0;
    let urgent = 0;
    let due = 0;
    for (const item of items) {
      if (item.bucket === "overdue") overdue += 1;
      else if (item.bucket === "urgent") urgent += 1;
      else due += 1;
    }
    return { overdue, urgent, due };
  }, [items]);

  const effectiveBucket: FilterBucket =
    selectedBucket !== "all" && counts[selectedBucket] === 0 ? "all" : selectedBucket;

  const filteredItems = useMemo(() => {
    if (effectiveBucket === "all") return items;
    return items.filter((item) => item.bucket === effectiveBucket);
  }, [items, effectiveBucket]);

  if (items.length === 0) {
    return null;
  }

  const visibleItems = showAll ? filteredItems : filteredItems.slice(0, DEFAULT_VISIBLE_LIMIT);
  const hiddenCount = Math.max(0, filteredItems.length - visibleItems.length);
  const hasOverdue = counts.overdue > 0;
  const sectionTitle = isFutureDate
    ? `Kế hoạch đặt trước & Cần xử lý (${targetDateLabel})`
    : "Cần xử lý trước & Đặt trước đến ngày";

  const filterTabs: Array<{ id: FilterBucket; label: string; count: number; badgeClass: string }> = [
    {
      id: "all",
      label: "Tất cả",
      count: items.length,
      badgeClass: "bg-slate-900 text-white",
    },
    ...(counts.overdue > 0
      ? [
          {
            id: "overdue" as const,
            label: "Quá hạn",
            count: counts.overdue,
            badgeClass: "bg-rose-600 text-white",
          },
        ]
      : []),
    ...(counts.urgent > 0
      ? [
          {
            id: "urgent" as const,
            label: "Cần xử lý trước",
            count: counts.urgent,
            badgeClass: "bg-amber-600 text-white",
          },
        ]
      : []),
    ...(counts.due > 0
      ? [
          {
            id: "due" as const,
            label: "Đặt trước đến ngày",
            count: counts.due,
            badgeClass: "bg-purple-700 text-white",
          },
        ]
      : []),
  ];

  return (
    <section
      aria-label={sectionTitle}
      className={`mb-5 overflow-hidden rounded-2xl border bg-white shadow-sm ${
        hasOverdue ? "border-rose-200/90" : "border-amber-200/90"
      }`}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
          hasOverdue
            ? "border-b border-rose-100 bg-rose-50/45"
            : "border-b border-amber-100 bg-amber-50/45"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
              hasOverdue ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
            }`}
            aria-hidden="true"
          >
            <VsIcon name={hasOverdue ? "schedule" : "bolt"} className="text-base" />
          </span>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 text-balance">
            {sectionTitle}
          </h2>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-bold text-slate-700 whitespace-nowrap">
            {items.length} mục
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isCollapsed ? (
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Lọc danh sách ưu tiên">
              {filterTabs.map((tab) => {
                const active = effectiveBucket === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setSelectedBucket(tab.id);
                      setShowAll(false);
                    }}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold leading-none whitespace-nowrap ${
                        active ? "bg-white/20 text-white" : tab.badgeClass
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
          >
            <VsIcon name={isCollapsed ? "expand_more" : "expand_less"} className="text-sm" />
            <span>{isCollapsed ? "Mở danh sách" : "Thu gọn"}</span>
          </button>
        </div>
      </div>

      {!isCollapsed ? (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-bold uppercase tracking-wide text-slate-600">
                  <th className="px-4 py-2.5 whitespace-nowrap">Phòng / Mã đơn</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Khách & Nguồn</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Tình trạng kiểm soát</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Lịch lưu trú</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map((item) => {
                  const style = BUCKET_STYLES[item.bucket];
                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-amber-50/35"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${
                              item.roomNumber
                                ? "border-slate-300 bg-slate-50 text-slate-900"
                                : "border-amber-300 bg-amber-50 text-amber-900"
                            }`}
                          >
                            {item.roomNumber ? `P.${item.roomNumber}` : "Chưa gán phòng"}
                          </span>
                          {item.code ? (
                            <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                              #{item.code}
                            </span>
                          ) : null}
                        </div>
                        {item.floorLabel || item.roomTypeName ? (
                          <p className="mt-1 text-xs text-slate-600 text-pretty">
                            {[item.roomTypeName, item.floorLabel].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-900">
                            {item.guestName}
                          </span>
                          {item.groupCode ? (
                            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800 whitespace-nowrap">
                              Đoàn {item.groupCode}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          {item.guestPhone ? (
                            <span className="font-medium text-slate-700 whitespace-nowrap">
                              {item.guestPhone}
                            </span>
                          ) : null}
                          {item.sourceLabel ? (
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                              {item.sourceLabel}
                            </span>
                          ) : null}
                          {item.guestCount && item.guestCount > 1 ? (
                            <span className="whitespace-nowrap">{item.guestCount} khách</span>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${style.pillClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dotClass}`} aria-hidden="true" />
                          <VsIcon name={style.iconName} className="text-xs" />
                          <span>{item.badgeLabel}</span>
                        </span>
                        <p className="mt-1.5 text-xs font-medium text-slate-800 text-pretty">
                          {item.reasonText}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600 text-pretty">
                          {item.readinessLabel}
                        </p>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                          {item.scheduleText}
                        </span>
                      </td>

                      <td className="px-4 py-3 align-top text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <PriorityRowActions
                            item={item}
                            permissions={{ canCheckInStay, canManageRooms, canManageReservations }}
                            onInspectItem={onInspectItem}
                            onPrimaryAction={onPrimaryAction}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {visibleItems.map((item) => {
              const style = BUCKET_STYLES[item.bucket];
              return (
                <div key={item.id} className="space-y-2.5 px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${
                          item.roomNumber
                            ? "border-slate-300 bg-slate-50 text-slate-900"
                            : "border-amber-300 bg-amber-50 text-amber-900"
                        }`}
                      >
                        {item.roomNumber ? `P.${item.roomNumber}` : "Chưa gán phòng"}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${style.pillClass}`}
                      >
                        <VsIcon name={style.iconName} className="text-xs" />
                        <span>{item.badgeLabel}</span>
                      </span>
                    </div>
                    {item.code ? (
                      <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                        #{item.code}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{item.guestName}</span>
                      {item.guestPhone ? (
                        <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                          {item.guestPhone}
                        </span>
                      ) : null}
                      {item.sourceLabel ? (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                          {item.sourceLabel}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-800 text-pretty">
                      {item.reasonText}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 text-pretty">
                      {item.scheduleText} · {item.readinessLabel}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <PriorityRowActions
                      item={item}
                      permissions={{ canCheckInStay, canManageRooms, canManageReservations }}
                      fullWidthOnMobile
                      onInspectItem={onInspectItem}
                      onPrimaryAction={onPrimaryAction}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {filteredItems.length > DEFAULT_VISIBLE_LIMIT ? (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
              <span className="text-xs font-medium text-slate-600">
                Đang hiển thị {visibleItems.length}/{filteredItems.length} mục
              </span>
              <button
                type="button"
                onClick={() => setShowAll((prev) => !prev)}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-white hover:text-slate-950 transition cursor-pointer whitespace-nowrap"
              >
                <VsIcon name={showAll ? "expand_less" : "expand_more"} className="text-sm" />
                <span>
                  {showAll ? "Thu gọn bớt" : `Xem thêm ${hiddenCount} mục`}
                </span>
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
