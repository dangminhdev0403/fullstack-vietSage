import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";

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
import { KbttDeclarationsPage } from "@/features/kbtt/components/kbtt-declarations-page";
import { FrontDeskInHouseTable } from "./front-desk-in-house-table";
import { FrontDeskArrivalsTable } from "./front-desk-arrivals-table";
import {
  FrontDeskGroupsTable,
  buildFrontDeskGroupSummaries,
} from "./front-desk-groups-table";

export const dynamic = "force-dynamic";

function isNextRouterError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

const PAGE_SIZE = 20;

type FrontDeskTab = "in-house" | "arrivals" | "groups" | "kbtt";
type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  baseRoutePrefix?: `/${string}`;
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
  baseRoutePrefix = "/hotels",
): string {
  const query = new URLSearchParams({ tab: input.tab });
  if (input.range && (input.tab === "arrivals" || input.tab === "groups")) query.set("range", input.range);
  if (input.q && input.tab !== "kbtt") query.set("q", input.q);
  if (input.page && input.page > 1 && input.tab !== "kbtt" && input.tab !== "groups") query.set("page", String(input.page));
  return `${baseRoutePrefix}/${encodeURIComponent(hotelId)}/front-desk?${query.toString()}`;
}


function Pagination({
  hotelId,
  tab,
  range,
  q,
  page,
  total,
  baseRoutePrefix = "/hotels",
}: {
  hotelId: string;
  tab: FrontDeskTab;
  range: ArrivalRange;
  q: string;
  page: number;
  total: number;
  baseRoutePrefix?: `/${string}`;
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
          href={frontDeskHref(hotelId, { tab, range, q, page: page - 1 }, baseRoutePrefix)}
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
          href={frontDeskHref(hotelId, { tab, range, q, page: page + 1 }, baseRoutePrefix)}
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

export default async function FrontDeskPage({ params, searchParams, baseRoutePrefix = "/hotels" }: PageProps) {
  const { hotelId } = await params;
  const query = (await searchParams) ?? {};
  const callbackUrl = `${baseRoutePrefix}/${hotelId}/front-desk` as `/${string}`;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  const userPersona = resolveWorkspacePersona(context.activeRole.code);
  if (userPersona === "housekeeping") {
    redirect(`${baseRoutePrefix}/${encodeURIComponent(hotelId)}/rooms?status=processing`);
  }

  const canViewArrivals = context.permissions.includes("hotel.reservations.view");
  const canViewKbtt = context.permissions.some((p) =>
    ["hotel.kbtt.declarations.view", "hotel.kbtt.declarations.manage"].includes(p),
  );
  const canManageKbttDeclarations = context.permissions.includes("hotel.kbtt.declarations.manage");
  const canConfigureKbtt = context.permissions.some((p) =>
    ["hotel.kbtt.view", "hotel.kbtt.manage"].includes(p),
  );
  const canViewInHouse = context.permissions.includes("hotel.rooms.view");
  if (!canUseHotelId(context, hotelId) || (!canViewArrivals && !canViewInHouse && !canViewKbtt)) {
    notFound();
  }

  const rawTab = first(query.tab);
  const requestedTab: FrontDeskTab =
    rawTab === "kbtt"
      ? "kbtt"
      : rawTab === "groups"
        ? "groups"
        : rawTab === "arrivals"
          ? "arrivals"
          : "in-house";
  const tab: FrontDeskTab =
    requestedTab === "kbtt" && canViewKbtt
      ? "kbtt"
      : requestedTab === "groups" && canViewArrivals
        ? "groups"
        : requestedTab === "in-house" && canViewInHouse
          ? "in-house"
          : requestedTab === "arrivals" && canViewArrivals
            ? "arrivals"
            : canViewInHouse
              ? "in-house"
              : canViewArrivals
                ? "arrivals"
                : "kbtt";
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
    } else if (tab === "groups") {
      arrivalsPage = await authorizedApi("load front desk arrivals for groups", (accessToken) =>
        hotelOpsService.listArrivals(hotelId, {
          query: { ...dateRange, ...(q ? { q } : {}), page: 1, limit: 100 },
          accessToken,
        }),
      );
    } else if (tab === "in-house") {
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

  const groups =
    tab === "groups" && arrivalsPage
      ? buildFrontDeskGroupSummaries(arrivalsPage.items)
      : [];
  const filteredGroups =
    tab === "groups" && q
      ? groups.filter((g) => {
          const lowerQ = q.toLowerCase();
          return (
            g.groupCode.toLowerCase().includes(lowerQ) ||
            g.leadGuestName.toLowerCase().includes(lowerQ) ||
            Boolean(g.leadGuestPhone?.includes(q)) ||
            g.assignedRoomNumbers.some((num) => num.includes(q))
          );
        })
      : groups;

  const total =
    tab === "groups"
      ? filteredGroups.length
      : (arrivalsPage?.total ?? inHousePage?.total ?? 0);
  const canOperateArrivals =
    canViewInHouse &&
    (context.permissions.includes("hotel.reservations.manage") ||
      context.permissions.includes("hotel.stays.check-in"));
  const canViewBilling =
    context.permissions.includes("hotel.billing.view") ||
    context.permissions.includes("hotel.billing.manage") ||
    context.permissions.includes("hotel.billing.checkout");
  const canCheckoutBilling =
    context.permissions.includes("hotel.billing.checkout") ||
    context.permissions.includes("hotel.billing.manage");
  const canManageStays =
    context.permissions.includes("hotel.stays.manage") ||
    context.permissions.includes("hotel.stays.check-in");
  const canCheckOutStay =
    context.permissions.includes("hotel.stays.checkout") ||
    context.permissions.includes("hotel.stays.manage");
  const canCheckInStay =
    context.permissions.includes("hotel.stays.check-in") ||
    context.permissions.includes("hotel.reservations.manage");
  const canManageReservations = context.permissions.includes("hotel.reservations.manage");
  const canViewRequests =
    context.permissions.includes("hotel.requests.view") ||
    context.permissions.includes("hotel.requests.manage") ||
    context.permissions.includes("hotel.requests.execute");

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--secondary)]">
            VẬN HÀNH LỄ TÂN{currentHotel?.name ? ` — ${currentHotel.name}` : ""}
          </p>
          <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)] text-balance">
            Quản lý khách lưu trú
          </h1>
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
              href={frontDeskHref(hotelId, { tab: "in-house" }, baseRoutePrefix)}
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
              href={frontDeskHref(hotelId, { tab: "arrivals", range: "today" }, baseRoutePrefix)}
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
          {canViewArrivals ? (
            <Link
              aria-current={tab === "groups" ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-all ${
                tab === "groups"
                  ? "border border-purple-200 bg-white text-purple-700 shadow-xs"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
              }`}
              href={frontDeskHref(hotelId, { tab: "groups", range }, baseRoutePrefix)}
            >
              <VsIcon name="groups" className="h-4 w-4 text-purple-600" />
              <span>Quản lý đoàn</span>
              {tab === "groups" && !loadFailed ? (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
                  {filteredGroups.length}
                </span>
              ) : null}
            </Link>
          ) : null}
          {canViewKbtt ? (
            <Link
              aria-current={tab === "kbtt" ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-all ${
                tab === "kbtt"
                  ? "border border-slate-200 bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
              }`}
              href={frontDeskHref(hotelId, { tab: "kbtt" }, baseRoutePrefix)}
            >
              <VsIcon name="verified_user" className="h-4 w-4" />
              <span>Khai báo tạm trú</span>
            </Link>
          ) : null}
        </nav>

        {tab === "arrivals" || tab === "groups" ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Khoảng ngày lọc">
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
                  href={frontDeskHref(hotelId, { tab, range: value, q }, baseRoutePrefix)}
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

      {tab === "kbtt" ? (
        <KbttDeclarationsPage
          hotelId={hotelId}
          canManage={canManageKbttDeclarations}
          canConfigure={canConfigureKbtt}
        />
      ) : (
        <>
          {/* Search Bar */}
      <form className="flex flex-col gap-2.5 sm:flex-row" method="get">
        <input type="hidden" name="tab" value={tab} />
        {tab === "arrivals" || tab === "groups" ? <input type="hidden" name="range" value={range} /> : null}
        <label className="sr-only" htmlFor="front-desk-search">
          {tab === "groups"
            ? "Tìm theo mã đoàn, tên đoàn, người đại diện hoặc số điện thoại"
            : "Tìm khách, số điện thoại, mã đặt phòng hoặc số phòng"}
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
            placeholder={
              tab === "groups"
                ? "Tìm theo mã đoàn, tên đoàn, người đại diện hoặc số điện thoại..."
                : "Tìm theo tên khách, số điện thoại, mã đặt phòng hoặc số phòng..."
            }
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
            href={frontDeskHref(hotelId, { tab, range }, baseRoutePrefix)}
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
                {tab === "groups"
                  ? "Danh sách đặt phòng theo đoàn"
                  : tab === "arrivals"
                    ? "Danh sách khách đặt trước"
                    : "Khách đang lưu trú"}
              </h2>
              {!loadFailed ? (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                  {total} {tab === "groups" ? "đoàn" : "kết quả"}
                </span>
              ) : null}
            </div>
            {loadFailed ? (
              <p className="mt-1 text-xs text-red-600">Dữ liệu chưa tải được — vui lòng kiểm tra kết nối</p>
            ) : null}
          </div>
          {tab === "arrivals" && canOperateArrivals ? (
            <Link
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:text-slate-900"
              href={`${baseRoutePrefix}/${encodeURIComponent(hotelId)}/rooms?flow=arrivals&range=${range}`}
            >
              <VsIcon name="grid_view" className="h-4 w-4 text-slate-500" />
              <span>Xem trên sơ đồ phòng</span>
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
                href={frontDeskHref(hotelId, { tab, range, q, page }, baseRoutePrefix)}
              >
                <VsIcon name="refresh" className="h-4 w-4" />
                <span>Thử lại ngay</span>
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900"
                href={`${baseRoutePrefix}/${encodeURIComponent(hotelId)}/rooms`}
              >
                <span>Về sơ đồ phòng</span>
              </Link>
            </div>
          </div>
        ) : tab === "groups" ? (
          filteredGroups.length ? (
            <FrontDeskGroupsTable
              hotelId={hotelId}
              arrivals={arrivalsPage?.items ?? []}
              groups={filteredGroups}
              todayYmd={todayYmd}
              canOperateArrivals={canOperateArrivals}
              canCheckInStay={canCheckInStay}
              canManageReservations={canManageReservations}
            />
          ) : (
            /* Empty State for Groups */
            <div className="mx-auto max-w-lg px-4 py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-200 bg-purple-50 text-purple-600 shadow-xs">
                <VsIcon name="groups" className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 text-balance">
                {q ? "Không tìm thấy đoàn khách phù hợp" : "Không có đoàn khách nào trong khoảng thời gian này"}
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600 text-pretty">
                {q
                  ? `Không có kết quả nào trùng khớp với từ khóa "${q}". Bạn hãy thử tìm với mã đoàn, số điện thoại hoặc tên khác.`
                  : range === "today"
                    ? "Hôm nay chưa có đoàn khách nào đến nhận phòng. Bạn có thể kiểm tra danh sách đoàn ngày mai hoặc 7 ngày tới."
                    : "Chưa ghi nhận thông tin đặt phòng theo đoàn trong khoảng thời gian đã chọn."}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                {q ? (
                  <Link
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700"
                    href={frontDeskHref(hotelId, { tab, range }, baseRoutePrefix)}
                  >
                    <VsIcon name="close" className="h-4 w-4" />
                    <span>Xóa bộ lọc tìm kiếm</span>
                  </Link>
                ) : (
                  <>
                    {range === "today" ? (
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border-2 border-purple-600 bg-white px-4 text-sm font-bold text-purple-700 transition-all hover:bg-purple-50"
                        href={frontDeskHref(hotelId, { tab, range: "tomorrow" }, baseRoutePrefix)}
                      >
                        <span>Xem đoàn ngày mai</span>
                        <VsIcon name="arrow_forward" className="h-4 w-4" />
                      </Link>
                    ) : null}
                    {context.permissions.includes("hotel.reservations.manage") ? (
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-purple-700"
                        href={`${baseRoutePrefix}/${encodeURIComponent(hotelId)}/rooms?flow=reservation&businessDate=${encodeURIComponent(dateRange.from)}`}
                      >
                        <VsIcon name="groups" className="h-4 w-4" />
                        <span>Tạo đặt phòng mới</span>
                      </Link>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )
        ) : tab === "arrivals" ? (
          arrivalsPage?.items.length ? (
            <FrontDeskArrivalsTable
              hotelId={hotelId}
              arrivals={arrivalsPage.items}
              range={range}
              todayYmd={todayYmd}
              canOperateArrivals={canOperateArrivals}
              canCheckInStay={canCheckInStay}
              canManageReservations={canManageReservations}
            />
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
                    href={frontDeskHref(hotelId, { tab, range }, baseRoutePrefix)}
                  >
                    <VsIcon name="close" className="h-4 w-4" />
                    <span>Xóa bộ lọc tìm kiếm</span>
                  </Link>
                ) : (
                  <>
                    {range === "today" ? (
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border-2 border-blue-600 bg-white px-4 text-sm font-bold text-blue-700 transition-all hover:bg-blue-50"
                        href={frontDeskHref(hotelId, { tab, range: "tomorrow" }, baseRoutePrefix)}
                      >
                        <span>Xem khách ngày mai</span>
                        <VsIcon name="arrow_forward" className="h-4 w-4" />
                      </Link>
                    ) : null}
                    {context.permissions.includes("hotel.reservations.manage") ? (
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700"
                        href={`${baseRoutePrefix}/${encodeURIComponent(hotelId)}/rooms?flow=reservation&businessDate=${encodeURIComponent(dateRange.from)}`}
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
          <FrontDeskInHouseTable
            hotelId={hotelId}
            rooms={inHousePage.items}
            renderedAtIso={renderedAt.toISOString()}
            canViewBilling={canViewBilling}
            canCheckoutBilling={canCheckoutBilling}
            canManageStays={canManageStays}
            canCheckOutStay={canCheckOutStay}
            canCheckInStay={canCheckInStay}
            canViewRequests={canViewRequests}
          />
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
                  href={frontDeskHref(hotelId, { tab, range }, baseRoutePrefix)}
                >
                  <VsIcon name="close" className="h-4 w-4" />
                  <span>Xóa bộ lọc tìm kiếm</span>
                </Link>
              </div>
            ) : null}
          </div>
        )}

        {!loadFailed && tab !== "groups" ? (
          <Pagination
            hotelId={hotelId}
            page={page}
            q={q}
            range={range}
            tab={tab}
            total={total}
            baseRoutePrefix={baseRoutePrefix}
          />
        ) : null}
      </section>
        </>
      )}
    </div>
  );
}
