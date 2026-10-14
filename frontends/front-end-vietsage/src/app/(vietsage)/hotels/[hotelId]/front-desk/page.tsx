import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type {
  HotelArrival,
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  assertCanAccessHotelOps,
  canUseHotelId,
  requireHotelOpsServerTokens,
} from "@/features/hotel-ops/utils/hotel-route-auth";
import {
  getArrivalDateRange,
  type ArrivalRange,
} from "@/features/hotel-ops/utils/arrival-date-range";
import { HttpError } from "@/core/http/http-error";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

export const dynamic = "force-dynamic";

function isNextRouterError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

const PAGE_SIZE = 20;

type FrontDeskTab = "arrivals" | "in-house";
type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positivePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function frontDeskHref(
  hotelId: string,
  input: { tab: FrontDeskTab; range?: ArrivalRange; q?: string; page?: number },
): string {
  const query = new URLSearchParams({ tab: input.tab });
  if (input.range && input.tab === "arrivals") query.set("range", input.range);
  if (input.q) query.set("q", input.q);
  if (input.page && input.page > 1) query.set("page", String(input.page));
  return `/hotels/${encodeURIComponent(hotelId)}/front-desk?${query.toString()}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(value?: string | number | null): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Giá linh hoạt";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function Pagination({
  hotelId,
  tab,
  range,
  q,
  page,
  total,
}: {
  hotelId: string;
  tab: FrontDeskTab;
  range: ArrivalRange;
  q: string;
  page: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages === 1) return null;

  return (
    <nav
      className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5"
      aria-label="Phân trang"
    >
      {page > 1 ? (
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-2xs transition-all hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
          href={frontDeskHref(hotelId, { tab, range, q, page: page - 1 })}
        >
          <VsIcon name="arrow_back" className="h-4 w-4" />
          <span>Trang trước</span>
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm font-semibold text-slate-600">
        Trang {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-2xs transition-all hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
          href={frontDeskHref(hotelId, { tab, range, q, page: page + 1 })}
        >
          <span>Trang sau</span>
          <VsIcon name="arrow_forward" className="h-4 w-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export default async function FrontDeskPage({ params, searchParams }: PageProps) {
  const { hotelId } = await params;
  const query = (await searchParams) ?? {};
  const callbackUrl = `/hotels/${hotelId}/front-desk` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  const canViewArrivals = context.permissions.includes("hotel.reservations.view");
  const canViewInHouse = context.permissions.includes("hotel.rooms.view");
  if (!canUseHotelId(context, hotelId) || (!canViewArrivals && !canViewInHouse)) {
    notFound();
  }

  const requestedTab: FrontDeskTab = first(query.tab) === "arrivals" ? "arrivals" : "in-house";
  const tab: FrontDeskTab =
    requestedTab === "in-house" && canViewInHouse
      ? "in-house"
      : requestedTab === "arrivals" && canViewArrivals
        ? "arrivals"
        : canViewInHouse
          ? "in-house"
          : "arrivals";
  const rawRange = first(query.range);
  const range: ArrivalRange =
    rawRange === "tomorrow" || rawRange === "week" ? rawRange : "today";
  const q = (first(query.q) ?? "").trim().slice(0, 120);
  const page = positivePage(first(query.page));
  const renderedAt = new Date();
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(renderedAt);
  const dateRange = getArrivalDateRange(range, todayYmd);
  const currentHotel = context.accessibleHotels.find((hotel) => hotel.id === hotelId);
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  let arrivalsPage: HotelOpsPage<HotelArrival> | null = null;
  let inHousePage: HotelOpsPage<HotelRoomSummary> | null = null;
  let loadFailed = false;

  try {
    if (tab === "arrivals") {
      arrivalsPage = await authorizedApi("load front desk arrivals", (accessToken) =>
        hotelOpsService.listArrivals(hotelId, {
          query: { ...dateRange, ...(q ? { q } : {}), page, limit: PAGE_SIZE },
          accessToken,
        }),
      );
    } else {
      inHousePage = await authorizedApi("load in-house guests", (accessToken) =>
        hotelOpsService.listRooms(hotelId, {
          query: {
            status: "IN_HOUSE",
            ...(q ? { q } : {}),
            page,
            limit: PAGE_SIZE,
          },
          accessToken,
        }),
      );
    }
  } catch (error) {
    if (isNextRouterError(error)) {
      throw error;
    }
    loadFailed = true;
    console.error("[FRONT_DESK_PAGE_ERROR]", {
      hotelId,
      tab,
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStatus: error instanceof HttpError ? error.status : undefined,
      requestUrl: error instanceof HttpError ? error.requestUrl : undefined,
    });
  }

  const total = arrivalsPage?.total ?? inHousePage?.total ?? 0;
  const canOperateArrivals =
    canViewInHouse &&
    (context.permissions.includes("hotel.reservations.manage") ||
      context.permissions.includes("hotel.stays.check-in"));
  const canViewBilling =
    context.permissions.includes("hotel.billing.view") ||
    context.permissions.includes("hotel.billing.manage") ||
    context.permissions.includes("hotel.billing.checkout");
  const canViewRequests =
    context.permissions.includes("hotel.requests.view") ||
    context.permissions.includes("hotel.requests.manage") ||
    context.permissions.includes("hotel.requests.execute");

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <header className="rounded-2xl border border-slate-200/90 bg-gradient-to-r from-white via-white to-blue-50/40 p-5 shadow-2xs sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-800">
              <VsIcon name="hotel" className="h-3.5 w-3.5 text-blue-700" />
              <span>VẬN HÀNH LỄ TÂN{currentHotel?.name ? ` — ${currentHotel.name}` : ""}</span>
            </div>
            <h1 className="vs-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Khách đang lưu trú & Khách đặt trước
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
              Theo dõi chi tiết khách đang lưu trú tại khách sạn, chuẩn bị tiếp đón khách đặt trước chu đáo, và điều hướng nhanh sang sơ đồ phòng, yêu cầu dịch vụ hoặc thu ngân.
            </p>
          </div>
          {context.permissions.includes("hotel.reservations.manage") ? (
            <div className="shrink-0">
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700 hover:shadow-sm"
                href={`/hotels/${encodeURIComponent(hotelId)}/rooms?flow=reservation&businessDate=${encodeURIComponent(dateRange.from)}`}
              >
                <VsIcon name="calendar_today" className="h-4 w-4" />
                <span>Tạo đặt phòng mới</span>
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      {/* Tabs and Date Range Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav
          className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-slate-100/80 p-1 shadow-2xs"
          aria-label="Nghiệp vụ lễ tân"
        >
          {canViewInHouse ? (
            <Link
              aria-current={tab === "in-house" ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-all ${
                tab === "in-house"
                  ? "border border-slate-200 bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
              }`}
              href={frontDeskHref(hotelId, { tab: "in-house" })}
            >
              <VsIcon name="person" className="h-4 w-4" />
              <span>Khách đang lưu trú</span>
              {tab === "in-house" && !loadFailed && inHousePage?.total !== undefined ? (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                  {inHousePage.total}
                </span>
              ) : null}
            </Link>
          ) : null}
          {canViewArrivals ? (
            <Link
              aria-current={tab === "arrivals" ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-all ${
                tab === "arrivals"
                  ? "border border-slate-200 bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
              }`}
              href={frontDeskHref(hotelId, { tab: "arrivals", range: "today" })}
            >
              <VsIcon name="calendar_today" className="h-4 w-4" />
              <span>Khách đặt trước</span>
              {tab === "arrivals" && !loadFailed && arrivalsPage?.total !== undefined ? (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                  {arrivalsPage.total}
                </span>
              ) : null}
            </Link>
          ) : null}
        </nav>

        {tab === "arrivals" ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Khoảng ngày khách đặt trước">
            {([
              ["today", "Hôm nay"],
              ["tomorrow", "Ngày mai"],
              ["week", "7 ngày tới"],
            ] as const).map(([value, label]) => {
              const isActive = range === value;
              return (
                <Link
                  key={value}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition-all ${
                    isActive
                      ? "border-2 border-blue-600 bg-blue-50 text-blue-800 shadow-2xs"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  href={frontDeskHref(hotelId, { tab, arrivals: undefined, range: value, q } as Parameters<typeof frontDeskHref>[1])}
                >
                  {isActive ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                  ) : null}
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Search Bar */}
      <form className="flex flex-col gap-2.5 sm:flex-row" method="get">
        <input type="hidden" name="tab" value={tab} />
        {tab === "arrivals" ? <input type="hidden" name="range" value={range} /> : null}
        <label className="sr-only" htmlFor="front-desk-search">
          Tìm khách, số điện thoại, mã đặt phòng hoặc số phòng
        </label>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            <VsIcon name="search" className="h-4.5 w-4.5" />
          </div>
          <input
            id="front-desk-search"
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            defaultValue={q}
            maxLength={120}
            name="q"
            placeholder="Tìm theo tên khách, số điện thoại, mã đặt phòng hoặc số phòng..."
            type="search"
          />
        </div>
        <button
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700"
          type="submit"
        >
          <VsIcon name="search" className="h-4 w-4" />
          <span>Tìm kiếm</span>
        </button>
        {q ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900"
            href={frontDeskHref(hotelId, { tab, range })}
          >
            <VsIcon name="close" className="h-4 w-4" />
            <span>Xóa tìm kiếm</span>
          </Link>
        ) : null}
      </form>

      {/* Main Content Section */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-slate-900">
                {tab === "arrivals" ? "Danh sách khách đặt trước" : "Khách đang lưu trú"}
              </h2>
              {!loadFailed ? (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                  {total} kết quả
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {loadFailed
                ? "Dữ liệu chưa tải được — vui lòng kiểm tra kết nối"
                : tab === "arrivals"
                  ? `Tổng cộng ${total} lượt khách dự kiến đến trong phạm vi khách sạn`
                  : `Tổng cộng ${total} phòng đang có khách lưu trú tại khách sạn`}
            </p>
          </div>
          {tab === "arrivals" && canOperateArrivals ? (
            <Link
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-blue-600 bg-white px-4 text-sm font-bold text-blue-700 shadow-2xs transition-all hover:bg-blue-50"
              href={`/hotels/${encodeURIComponent(hotelId)}/rooms?flow=arrivals&range=${range}`}
            >
              <VsIcon name="arrow_forward" className="h-4 w-4" />
              <span>Mở thao tác khách đặt trước</span>
            </Link>
          ) : null}
        </div>

        {loadFailed ? (
          /* Error State */
          <div className="mx-auto max-w-lg px-4 py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-xs">
              <VsIcon name="refresh" className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              Không thể tải dữ liệu lễ tân
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
              Hệ thống tạm thời không thể kết nối tới máy chủ hoặc tài khoản chưa có đủ quyền xem danh sách này. Vui lòng thử tải lại hoặc liên hệ quản trị viên.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <Link
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700"
                href={frontDeskHref(hotelId, { tab, range, q, page })}
              >
                <VsIcon name="refresh" className="h-4 w-4" />
                <span>Thử lại ngay</span>
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900"
                href={`/hotels/${encodeURIComponent(hotelId)}/rooms`}
              >
                <span>Về sơ đồ phòng</span>
              </Link>
            </div>
          </div>
        ) : tab === "arrivals" ? (
          arrivalsPage?.items.length ? (
            /* Compact Table for Arrivals */
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <th scope="col" className="px-4 py-3">Khách hàng</th>
                      <th scope="col" className="px-4 py-3">Phòng</th>
                      <th scope="col" className="px-4 py-3 whitespace-nowrap">Dự kiến nhận</th>
                      <th scope="col" className="px-4 py-3 whitespace-nowrap">Dự kiến trả</th>
                      <th scope="col" className="px-4 py-3 whitespace-nowrap">Giá phòng</th>
                      <th scope="col" className="px-4 py-3 whitespace-nowrap">Trạng thái</th>
                      {canOperateArrivals ? (
                        <th scope="col" className="px-4 py-3 text-right whitespace-nowrap">Thao tác</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {arrivalsPage.items.map((arrival) => {
                      const isToday = arrival.plannedCheckInAt.slice(0, 10) === todayYmd;
                      return (
                        <tr key={arrival.id} className="transition-colors hover:bg-slate-50/80">
                          {/* Khách hàng */}
                          <td className="px-4 py-3 align-middle">
                            <div className="font-bold text-slate-900 text-base leading-tight">
                              {arrival.guestDisplayName}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500 font-medium whitespace-nowrap">
                              <span className="font-mono text-blue-700 font-semibold">{arrival.reservationCode}</span>
                              {arrival.guestPhone ? <span> · {arrival.guestPhone}</span> : null}
                            </div>
                          </td>

                          {/* Phòng */}
                          <td className="px-4 py-3 align-middle whitespace-nowrap">
                            {arrival.room?.roomNumber ? (
                              <span className="font-bold text-slate-800 text-base">
                                Phòng {arrival.room.roomNumber}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                Chưa gán phòng
                              </span>
                            )}
                          </td>

                          {/* Nhận phòng */}
                          <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700">
                            {formatDateTime(arrival.plannedCheckInAt)}
                          </td>

                          {/* Trả phòng */}
                          <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700">
                            {formatDateTime(arrival.plannedCheckOutAt)}
                          </td>

                          {/* Giá */}
                          <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-bold text-amber-700">
                            {formatMoney(arrival.rate ?? arrival.nightlyRateSnapshot)}
                          </td>

                          {/* Trạng thái */}
                          <td className="px-4 py-3 align-middle whitespace-nowrap">
                            {isToday ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                <span>Nhận phòng ngay</span>
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">
                                Đến ngày mới mở
                              </span>
                            )}
                          </td>

                          {/* Thao tác */}
                          {canOperateArrivals ? (
                            <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                              <Link
                                className="inline-flex h-8.5 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-2xs transition-all hover:bg-blue-700"
                                href={`/hotels/${encodeURIComponent(hotelId)}/rooms?flow=arrivals&range=${range}`}
                              >
                                <span>{arrival.roomId ? "Xử lý" : "Gán phòng"}</span>
                                <VsIcon name="arrow_forward" className="h-3.5 w-3.5" />
                              </Link>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Empty State for Arrivals */
            <div className="mx-auto max-w-lg px-4 py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 shadow-xs">
                <VsIcon name="calendar_today" className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                {q ? "Không tìm thấy khách đặt trước phù hợp" : "Không có khách đặt trước trong khoảng thời gian này"}
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
                {q
                  ? `Không có kết quả nào trùng khớp với từ khóa "${q}". Bạn hãy thử tìm với số điện thoại, tên khách hoặc mã khác.`
                  : range === "today"
                    ? "Hôm nay chưa có lượt khách đặt trước nào. Bạn có thể kiểm tra danh sách khách ngày mai hoặc 7 ngày tới."
                    : "Chưa ghi nhận thông tin khách đặt trước trong khoảng thời gian hoặc bộ lọc đã chọn."}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                {q ? (
                  <Link
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700"
                    href={frontDeskHref(hotelId, { tab, range })}
                  >
                    <VsIcon name="close" className="h-4 w-4" />
                    <span>Xóa bộ lọc tìm kiếm</span>
                  </Link>
                ) : (
                  <>
                    {range === "today" ? (
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border-2 border-blue-600 bg-white px-4 text-sm font-bold text-blue-700 transition-all hover:bg-blue-50"
                        href={frontDeskHref(hotelId, { tab, range: "tomorrow" })}
                      >
                        <span>Xem khách ngày mai</span>
                        <VsIcon name="arrow_forward" className="h-4 w-4" />
                      </Link>
                    ) : null}
                    {context.permissions.includes("hotel.reservations.manage") ? (
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700"
                        href={`/hotels/${encodeURIComponent(hotelId)}/rooms?flow=reservation&businessDate=${encodeURIComponent(dateRange.from)}`}
                      >
                        <VsIcon name="calendar_today" className="h-4 w-4" />
                        <span>Tạo đặt phòng mới</span>
                      </Link>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )
        ) : inHousePage?.items.length ? (
          /* Compact Table for In-House */
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th scope="col" className="px-4 py-3">Khách hàng</th>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">Phòng</th>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">Nhận phòng</th>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">Dự kiến trả</th>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">Số khách</th>
                    <th scope="col" className="px-4 py-3 text-right whitespace-nowrap">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {inHousePage.items.map((room) => {
                    const stay = room.activeStay;
                    const roomNumber = room.roomNumber || "Chưa rõ";
                    const isOverdue = Boolean(
                      stay?.plannedCheckOutAt &&
                        new Date(stay.plannedCheckOutAt).getTime() < renderedAt.getTime(),
                    );
                    return (
                      <tr key={room.id} className="transition-colors hover:bg-slate-50/80">
                        {/* Khách hàng: Name + compact code/phone */}
                        <td className="px-4 py-3 align-middle">
                          <div className="font-bold text-slate-900 text-base leading-tight">
                            {stay?.guestDisplayName || "Khách lưu trú"}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 font-medium whitespace-nowrap">
                            <span className="font-mono text-blue-700 font-semibold">{stay?.reservationCode || "Không mã"}</span>
                            {stay?.guestPhone ? <span> · {stay.guestPhone}</span> : null}
                          </div>
                        </td>

                        {/* Phòng & Trạng thái: 1 single clean line */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-base">
                              Phòng {roomNumber}
                            </span>
                            {isOverdue ? (
                              <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                                <span>Quá hạn</span>
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Nhận phòng */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-700">
                          {formatDateTime(stay?.checkedInAt ?? stay?.plannedCheckInAt)}
                        </td>

                        {/* Dự kiến trả phòng */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          <span className={`text-sm ${isOverdue ? "font-bold text-rose-600" : "font-medium text-slate-700"}`}>
                            {formatDateTime(stay?.plannedCheckOutAt)}
                          </span>
                        </td>

                        {/* Số lượng khách */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap text-sm font-medium text-slate-600">
                          {(stay?.occupants?.length ?? 0) + 1} khách
                        </td>

                        {/* Thao tác: Single line, no wrapping */}
                        <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <Link
                              className="inline-flex h-8.5 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-2xs transition-all hover:bg-blue-700"
                              href={`/hotels/${encodeURIComponent(hotelId)}/rooms?q=${encodeURIComponent(roomNumber)}`}
                            >
                              <span>Quản lý</span>
                              <VsIcon name="arrow_forward" className="h-3.5 w-3.5" />
                            </Link>
                            {canViewRequests ? (
                              <Link
                                className="inline-flex h-8.5 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900"
                                href={`/hotels/${encodeURIComponent(hotelId)}/requests?roomNumber=${encodeURIComponent(roomNumber)}`}
                              >
                                Yêu cầu
                              </Link>
                            ) : null}
                            {canViewBilling && stay?.id ? (
                              <Link
                                className="inline-flex h-8.5 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900"
                                href={`/hotels/${encodeURIComponent(hotelId)}/billing?stayId=${encodeURIComponent(stay.id)}&roomId=${encodeURIComponent(room.id)}&roomNumber=${encodeURIComponent(roomNumber)}`}
                              >
                                Thu ngân
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Empty State for In-House */
          <div className="mx-auto max-w-lg px-4 py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 shadow-xs">
              <VsIcon name="bed" className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              {q ? "Không tìm thấy khách đang lưu trú phù hợp" : "Hiện tại không có phòng nào có khách lưu trú"}
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
              {q
                ? `Không có khách lưu trú nào phù hợp với từ khóa "${q}". Bạn hãy kiểm tra lại số phòng hoặc tên khách.`
                : "Tất cả các phòng trong khách sạn hiện đang trống hoặc đang trong quy trình dọn dẹp, chưa có khách làm thủ tục nhận phòng."}
            </p>
            {q ? (
              <div className="mt-5">
                <Link
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700"
                  href={frontDeskHref(hotelId, { tab, range })}
                >
                  <VsIcon name="close" className="h-4 w-4" />
                  <span>Xóa bộ lọc tìm kiếm</span>
                </Link>
              </div>
            ) : null}
          </div>
        )}

        {!loadFailed ? (
          <Pagination
            hotelId={hotelId}
            page={page}
            q={q}
            range={range}
            tab={tab}
            total={total}
          />
        ) : null}
      </section>
    </div>
  );
}
