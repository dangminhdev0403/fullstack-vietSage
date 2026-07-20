import Link from "next/link";

import { auth } from "@/auth";
import {
  DataTable,
  type DataTableColumn,
  type DataTableSortDirection,
} from "@/components/ui/data-table";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import { readServerSessionTokens } from "@/lib/server-session-tokens";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

import { VsIcon } from "../../../../_components/vs-icon";
import { OwnerShell } from "../../../_components/owner-shell";
import { OwnerStayQrButton } from "./owner-stay-qr-button";
import { OwnerStayRoomGridClient } from "./owner-stay-room-grid-client";

type PageProps = {
  params: Promise<{ hotelId: string }> | { hotelId: string };
  searchParams?:
    | Promise<{
        status?: string;
        page?: string;
        pageSize?: string;
        sort?: string;
        dir?: string;
      }>
    | {
        status?: string;
        page?: string;
        pageSize?: string;
        sort?: string;
        dir?: string;
      };
};

type StayRow = {
  id: string;
  room: string;
  roomType: string;
  guest: string;
  initials: string;
  phone: string;
  status: "active" | "reserved" | "checkedOut";
  qr: "active" | "pending" | "disabled";
  qrCode: string | null;
  checkIn: string;
  checkOut: string;
};

type StayFilter = "all" | StayRow["status"];
type StaySortKey =
  | "room"
  | "guest"
  | "phone"
  | "status"
  | "qr"
  | "checkIn"
  | "checkOut";

const stayFilters: { value: StayFilter; label: string }[] = [
  { value: "all", label: "T\u1ea5t c\u1ea3" },
  { value: "active", label: "\u0110ang l\u01b0u tr\u00fa" },
  { value: "reserved", label: "Ch\u1edd check-in" },
  { value: "checkedOut", label: "\u0110\u00e3 check-out" },
];

const stayPageSizeOptions = [10, 25, 50];
const staySortKeys: StaySortKey[] = [
  "room",
  "guest",
  "phone",
  "status",
  "qr",
  "checkIn",
  "checkOut",
];

export const dynamic = "force-dynamic";

function roomNumber(room: HotelRoomSummary): string {
  return room.roomNumber?.trim() || "--";
}

function roomType(room: HotelRoomSummary): string {
  return room.type?.trim() || "Standard";
}

function hasActiveStay(room: HotelRoomSummary): boolean {
  return room.activeStay?.status?.toUpperCase() === "ACTIVE";
}

function isQrActive(room: HotelRoomSummary): boolean {
  return (room.qr?.status ?? room.qrStatus)?.toUpperCase() === "ACTIVE";
}

function getRoomQrCode(room: HotelRoomSummary): string | null {
  return room.qr?.publicCode ?? room.qr?.qrCode ?? room.qr?.code ?? null;
}

function initialsFrom(value: string): string {
  const initials = value
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return initials || "VS";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildStayRows(rooms: readonly HotelRoomSummary[]): StayRow[] {
  return rooms
    .filter(hasActiveStay)
    .map((room): StayRow => {
      const stay = room.activeStay;
      const guest =
        stay?.guestDisplayName?.trim() ||
        stay?.reservationCode?.trim() ||
        (stay?.id
          ? "Stay " + stay.id.slice(0, 8)
          : "Kh\u00e1ch l\u01b0u tr\u00fa");

      return {
        id: stay?.id || room.id,
        room: roomNumber(room),
        roomType: roomType(room),
        guest,
        initials: initialsFrom(guest),
        phone: stay?.guestPhone?.trim() || "--",
        status: "active",
        qr: isQrActive(room) ? "active" : "disabled",
        qrCode: getRoomQrCode(room),
        checkIn: formatDateTime(
          stay?.checkedInAt ?? stay?.plannedCheckInAt ?? stay?.createdAt,
        ),
        checkOut: formatDateTime(stay?.plannedCheckOutAt ?? stay?.checkedOutAt),
      };
    })
    .sort((left, right) =>
      left.room.localeCompare(right.room, "vi", { numeric: true }),
    );
}

function compareStayRows(
  left: StayRow,
  right: StayRow,
  key: StaySortKey,
  direction: DataTableSortDirection,
): number {
  const leftValue = left[key];
  const rightValue = right[key];
  const result = String(leftValue).localeCompare(String(rightValue), "vi", {
    numeric: true,
    sensitivity: "base",
  });

  return direction === "asc" ? result : -result;
}

function statusMeta(status: StayRow["status"]): {
  label: string;
  className: string;
} {
  if (status === "active")
    return { label: "Đang lưu trú", className: "bg-blue-100 text-blue-700" };
  if (status === "reserved")
    return {
      label: "Chờ check-in",
      className: "bg-yellow-100 text-yellow-800",
    };
  return { label: "Đã check-out", className: "bg-gray-100 text-gray-600" };
}

function qrMeta(qr: StayRow["qr"]): { label: string; dot: string } {
  if (qr === "active") return { label: "Hoạt động", dot: "bg-green-500" };
  if (qr === "pending") return { label: "Chưa bật", dot: "bg-gray-400" };
  return { label: "Đã tắt", dot: "bg-gray-400" };
}

export default async function OwnerHotelStayPage({
  params,
  searchParams,
}: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const selectedStatus = stayFilters.some(
    (filter) => filter.value === resolvedSearchParams.status,
  )
    ? (resolvedSearchParams.status as StayFilter)
    : "all";
  const selectedSortKey = staySortKeys.includes(
    resolvedSearchParams.sort as StaySortKey,
  )
    ? (resolvedSearchParams.sort as StaySortKey)
    : "room";
  const selectedSortDirection: DataTableSortDirection =
    resolvedSearchParams.dir === "desc" ? "desc" : "asc";
  const requestedPage = Number(resolvedSearchParams.page ?? 1);
  const selectedPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedPageSize = Number(
    resolvedSearchParams.pageSize ?? stayPageSizeOptions[0],
  );
  const selectedPageSize = stayPageSizeOptions.includes(requestedPageSize)
    ? requestedPageSize
    : stayPageSizeOptions[0];
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const callbackUrl = `/owner/hotels/${hotelId}/stay` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  const sidebarItems = buildWorkspaceNavigationForContext({ ...workspaceContext, hotelId });

  const roomsPage = await authorizedApi("list owner rooms for stay manager", (accessToken) =>
    hotelOpsService.listRooms(hotelId, {
        query: { page: 1, limit: 100 },
        accessToken,
      }),
  );

  const rooms = roomsPage.items;
  const activeStayCount = rooms.filter(hasActiveStay).length;
  const emptyRoomCount = Math.max(rooms.length - activeStayCount, 0);
  const stays = buildStayRows(rooms);
  const filteredStays =
    selectedStatus === "all"
      ? stays
      : stays.filter((stay) => stay.status === selectedStatus);
  const sortedStays = [...filteredStays].sort((left, right) =>
    compareStayRows(left, right, selectedSortKey, selectedSortDirection),
  );
  const stayPageCount = Math.max(
    1,
    Math.ceil(filteredStays.length / selectedPageSize),
  );
  const currentPage = Math.min(selectedPage, stayPageCount);
  const getStayTableHref = (next: {
    page?: number;
    pageSize?: number;
    status?: StayFilter;
    sort?: StaySortKey;
    dir?: DataTableSortDirection;
  }) => {
    const status = next.status ?? selectedStatus;
    const page = next.page ?? currentPage;
    const pageSize = next.pageSize ?? selectedPageSize;
    const sort = next.sort ?? selectedSortKey;
    const dir = next.dir ?? selectedSortDirection;
    const params = new URLSearchParams();

    if (status !== "all") params.set("status", status);
    if (page > 1) params.set("page", String(page));
    if (pageSize !== stayPageSizeOptions[0])
      params.set("pageSize", String(pageSize));
    if (sort !== "room") params.set("sort", sort);
    if (dir !== "asc") params.set("dir", dir);

    const query = params.toString();
    return "/owner/hotels/" + hotelId + "/stay" + (query ? "?" + query : "");
  };
  const metrics = [
    {
      label: "Đang lưu trú",
      value: activeStayCount,
      detail: "Theo active stay của phòng",
      icon: "group",
      className: "border-[var(--primary)]",
    },
    {
      label: "Chờ check-in",
      value: stays.filter((stay) => stay.status === "reserved").length,
      detail: "Lịch đến hôm nay",
      icon: "calendar",
      className: "border-[var(--secondary-fixed-dim)]",
    },
    {
      label: "Đã check-out",
      value: stays.filter((stay) => stay.status === "checkedOut").length,
      detail: "Theo danh sách vận hành",
      icon: "log_out",
      className: "border-[var(--surface-dim)]",
    },
    {
      label: "Phòng trống",
      value: emptyRoomCount,
      detail: `Tổng phòng: ${rooms.length}`,
      icon: "meeting_room",
      className: "border-green-600",
    },
  ];

  const stayColumns: DataTableColumn<StayRow>[] = [
    {
      key: "room",
      sortable: true,
      header: "Ph\u00f2ng",
      className: "px-5 py-4",
      headerClassName: "px-5 py-4",
      cell: (stay) => (
        <div>
          <p className="font-bold text-[var(--primary)]">{stay.room}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
            {stay.roomType}
          </p>
        </div>
      ),
    },
    {
      key: "guest",
      sortable: true,
      header: "Kh\u00e1ch",
      className: "px-5 py-4",
      headerClassName: "px-5 py-4",
      cell: (stay) => (
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-fixed)] text-xs font-bold text-[var(--primary)]">
            {stay.initials}
          </span>
          <span className="font-semibold">{stay.guest}</span>
        </div>
      ),
    },
    {
      key: "phone",
      sortable: true,
      header: "S\u1ed1 \u0111i\u1ec7n tho\u1ea1i",
      className: "px-5 py-4 font-mono text-[var(--on-surface-variant)]",
      headerClassName: "px-5 py-4",
      cell: (stay) => stay.phone,
    },
    {
      key: "status",
      sortable: true,
      header: "Tr\u1ea1ng th\u00e1i",
      className: "px-5 py-4",
      headerClassName: "px-5 py-4",
      cell: (stay) => {
        const status = statusMeta(stay.status);
        return (
          <span
            className={[
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
              status.className,
            ].join(" ")}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status.label}
          </span>
        );
      },
    },
    {
      key: "qr",
      sortable: true,
      header: "QR",
      className: "px-5 py-4",
      headerClassName: "px-5 py-4",
      cell: (stay) => {
        const qr = qrMeta(stay.qr);
        return (
          <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--on-surface-variant)]">
            <span className={["h-2 w-2 rounded-full", qr.dot].join(" ")} />
            {qr.label}
          </span>
        );
      },
    },
    {
      key: "checkIn",
      sortable: true,
      header: "Check-in",
      className: "px-5 py-4 text-xs text-[var(--on-surface-variant)]",
      headerClassName: "px-5 py-4",
      cell: (stay) => stay.checkIn,
    },
    {
      key: "checkOut",
      sortable: true,
      header: "Check-out",
      className: "px-5 py-4 text-xs text-[var(--on-surface-variant)]",
      headerClassName: "px-5 py-4",
      cell: (stay) => stay.checkOut,
    },
    {
      key: "actions",
      header: "Thao t\u00e1c",
      className: "px-5 py-4 text-right",
      headerClassName: "px-5 py-4 text-right",
      cell: (stay) => (
        <div className="flex justify-end gap-1">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--primary)] hover:bg-white"
            title="Chi ti\u1ebft"
          >
            <VsIcon name="visibility" className="text-[18px]" />
          </button>
          <OwnerStayQrButton qrCode={stay.qrCode} roomNumber={stay.room} />
        </div>
      ),
    },
  ];

  const tableHeader = (
    <div className="flex flex-col gap-4 border-b border-[var(--outline-variant)] p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {stayFilters.map((filter) => {
          const href = getStayTableHref({ status: filter.value, page: 1 });
          const active = selectedStatus === filter.value;

          return (
            <Link
              key={filter.value}
              href={href}
              className={[
                "whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition",
                active
                  ? "bg-[var(--primary-fixed)] text-[var(--primary)]"
                  : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]",
              ].join(" ")}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="inline-flex items-center gap-2 rounded-xl border border-[var(--outline-variant)] px-4 py-2 text-sm font-semibold text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]">
          <VsIcon name="filter_list" className="text-[18px]" />
          {"B\u1ed9 l\u1ecdc n\u00e2ng cao"}
        </button>
        <button className="inline-flex items-center gap-2 rounded-xl border border-[var(--outline-variant)] px-4 py-2 text-sm font-semibold text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]">
          <VsIcon name="download" className="text-[18px]" />
          {"Xu\u1ea5t b\u00e1o c\u00e1o"}
        </button>
      </div>
    </div>
  );

  return (
    <OwnerShell
      activePath={callbackUrl}
      navItems={sidebarItems}
      subtitle="Quản lý lưu trú"
    >
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
            LƯU TRÚ
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">
            Quản lý lưu trú
          </h1>
          <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
            Theo dõi khách đang ở, lịch check-in/check-out và trạng thái QR
            trong khách sạn này.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className={`rounded-xl border-l-4 bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] ${metric.className}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  {metric.label}
                </p>
                <p className="mt-2 text-4xl font-semibold text-[var(--primary)]">
                  {metric.value}
                </p>
              </div>
              <VsIcon
                name={metric.icon}
                className="text-[34px] text-[var(--primary)] opacity-40"
              />
            </div>
            <p className="mt-4 text-sm font-medium text-[var(--on-surface-variant)]">
              {metric.detail}
            </p>
          </article>
        ))}
      </section>

      <DataTable
        columns={stayColumns}
        data={sortedStays}
        getRowKey={(stay) => stay.id}
        emptyMessage="Chưa có lượt lưu trú phù hợp với bộ lọc hiện tại."
        minWidth="980px"
        header={tableHeader}
        sort={{
          key: selectedSortKey,
          direction: selectedSortDirection,
          getSortHref: (key, direction) =>
            getStayTableHref({
              page: 1,
              sort: key as StaySortKey,
              dir: direction,
            }),
        }}
        pagination={{
          page: currentPage,
          pageSize: selectedPageSize,
          pageSizeOptions: stayPageSizeOptions,
          totalItems: sortedStays.length,
          getPageHref: (page) => getStayTableHref({ page }),
          getPageSizeHref: (pageSize) =>
            getStayTableHref({ page: 1, pageSize }),
        }}
      />

      <OwnerStayRoomGridClient hotelId={hotelId} rooms={rooms} />
    </OwnerShell>
  );
}
