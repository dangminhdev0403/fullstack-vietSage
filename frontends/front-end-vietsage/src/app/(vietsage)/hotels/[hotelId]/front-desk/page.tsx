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
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

export const dynamic = "force-dynamic";

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
    <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Phân trang">
      {page > 1 ? (
        <Link
          className="inline-flex min-h-11 items-center rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--surface-container-low)]"
          href={frontDeskHref(hotelId, { tab, range, q, page: page - 1 })}
        >
          Trang trước
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-[var(--on-surface-variant)]">
        Trang {page}/{totalPages}
      </span>
      {page < totalPages ? (
        <Link
          className="inline-flex min-h-11 items-center rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--surface-container-low)]"
          href={frontDeskHref(hotelId, { tab, range, q, page: page + 1 })}
        >
          Trang sau
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

  const canViewArrivals =
    context.permissions.includes("hotel.reservations.view") ||
    context.permissions.includes("hotel.reservations.manage");
  const canViewInHouse = context.permissions.includes("hotel.rooms.view");
  if (!canUseHotelId(context, hotelId) || (!canViewArrivals && !canViewInHouse)) {
    notFound();
  }

  const requestedTab: FrontDeskTab = first(query.tab) === "in-house" ? "in-house" : "arrivals";
  const tab: FrontDeskTab =
    requestedTab === "arrivals" && canViewArrivals
      ? "arrivals"
      : requestedTab === "in-house" && canViewInHouse
        ? "in-house"
        : canViewArrivals
          ? "arrivals"
          : "in-house";
  const rawRange = first(query.range);
  const range: ArrivalRange =
    rawRange === "today" || rawRange === "week" ? rawRange : "tomorrow";
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
    loadFailed = true;
    console.error("[FRONT_DESK_PAGE_ERROR]", {
      hotelId,
      tab,
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--secondary)]">
            VẬN HÀNH LỄ TÂN{currentHotel?.name ? ` — ${currentHotel.name}` : ""}
          </p>
          <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)]">
            Khách đến và đang lưu trú
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-variant)]">
            Chuẩn bị lượt đến, theo dõi khách trong nhà, rồi chuyển sang đúng luồng phòng,
            yêu cầu hoặc thanh toán để thao tác an toàn.
          </p>
        </div>
        {context.permissions.includes("hotel.reservations.manage") ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:opacity-90"
            href={`/hotels/${encodeURIComponent(hotelId)}/rooms?flow=reservation&businessDate=${encodeURIComponent(dateRange.from)}`}
          >
            Tạo đặt phòng
          </Link>
        ) : null}
      </header>

      <nav className="flex gap-2 border-b border-[var(--outline-variant)]" aria-label="Nghiệp vụ lễ tân">
        {canViewArrivals ? (
          <Link
            aria-current={tab === "arrivals" ? "page" : undefined}
            className={`inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold ${
              tab === "arrivals"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
            }`}
            href={frontDeskHref(hotelId, { tab: "arrivals", range: "tomorrow" })}
          >
            Khách đến
          </Link>
        ) : null}
        {canViewInHouse ? (
          <Link
            aria-current={tab === "in-house" ? "page" : undefined}
            className={`inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold ${
              tab === "in-house"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
            }`}
            href={frontDeskHref(hotelId, { tab: "in-house" })}
          >
            Đang lưu trú
          </Link>
        ) : null}
      </nav>

      {tab === "arrivals" ? (
        <div className="flex flex-wrap gap-2" aria-label="Khoảng ngày khách đến">
          {([
            ["today", "Hôm nay"],
            ["tomorrow", "Ngày mai"],
            ["week", "7 ngày tới"],
          ] as const).map(([value, label]) => (
            <Link
              key={value}
              aria-current={range === value ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold ${
                range === value
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--outline-variant)] bg-white text-[var(--primary)] hover:bg-[var(--surface-container-low)]"
              }`}
              href={frontDeskHref(hotelId, { tab: "arrivals", range: value, q })}
            >
              {label}
            </Link>
          ))}
        </div>
      ) : null}

      <form className="flex flex-col gap-3 sm:flex-row" method="get">
        <input type="hidden" name="tab" value={tab} />
        {tab === "arrivals" ? <input type="hidden" name="range" value={range} /> : null}
        <label className="sr-only" htmlFor="front-desk-search">
          Tìm khách, số điện thoại, mã đặt phòng hoặc số phòng
        </label>
        <input
          id="front-desk-search"
          className="min-h-11 flex-1 rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/15"
          defaultValue={q}
          maxLength={120}
          name="q"
          placeholder="Tên khách, SĐT, mã đặt phòng hoặc số phòng"
          type="search"
        />
        <button
          className="min-h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:opacity-90"
          type="submit"
        >
          Tìm kiếm
        </button>
        {q ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--outline-variant)] px-4 text-sm font-semibold text-[var(--primary)]"
            href={frontDeskHref(hotelId, { tab, range })}
          >
            Xóa lọc
          </Link>
        ) : null}
      </form>

      <section className="rounded-2xl border border-[var(--outline-variant)] bg-white p-4 shadow-xs sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--outline-variant)] pb-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--primary)]">
              {tab === "arrivals" ? "Danh sách khách dự kiến đến" : "Khách đang lưu trú"}
            </h2>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              {loadFailed ? "Dữ liệu chưa tải được" : `${total} kết quả trong phạm vi khách sạn`}
            </p>
          </div>
          {tab === "arrivals" && canOperateArrivals ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-xl border border-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--surface-container-low)]"
              href={`/hotels/${encodeURIComponent(hotelId)}/rooms?flow=arrivals&range=${range}`}
            >
              Mở thao tác khách đến
            </Link>
          ) : null}
        </div>

        {loadFailed ? (
          <div className="py-12 text-center">
            <p className="font-semibold text-[var(--error)]">Không thể tải dữ liệu lễ tân.</p>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Vui lòng kiểm tra kết nối hoặc quyền vai trò rồi thử lại.
            </p>
            <Link
              className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[var(--outline-variant)] px-4 text-sm font-semibold text-[var(--primary)]"
              href={frontDeskHref(hotelId, { tab, range, q, page })}
            >
              Thử lại
            </Link>
          </div>
        ) : tab === "arrivals" ? (
          arrivalsPage?.items.length ? (
            <div className="divide-y divide-[var(--outline-variant)]">
              {arrivalsPage.items.map((arrival) => {
                const isToday = arrival.plannedCheckInAt.slice(0, 10) === todayYmd;
                return (
                  <article className="grid gap-4 py-5 lg:grid-cols-[1fr_auto] lg:items-center" key={arrival.id}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-[var(--on-surface)]">
                          {arrival.guestDisplayName}
                        </h3>
                        <span className="rounded-full bg-[var(--surface-container)] px-2.5 py-1 text-xs font-semibold text-[var(--on-surface-variant)]">
                          {arrival.room?.roomNumber ? `Phòng ${arrival.room.roomNumber}` : "Chưa gán phòng"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                        {arrival.reservationCode} · {arrival.guestPhone || "Chưa có SĐT"}
                      </p>
                      <div className="mt-2 grid gap-1 text-sm text-[var(--on-surface-variant)] sm:grid-cols-3">
                        <span>Đến: {formatDateTime(arrival.plannedCheckInAt)}</span>
                        <span>Đi: {formatDateTime(arrival.plannedCheckOutAt)}</span>
                        <span>{formatMoney(arrival.rate ?? arrival.nightlyRateSnapshot)}</span>
                      </div>
                      <p className="mt-2 text-xs font-medium text-[var(--secondary)]">
                        {isToday
                          ? "Có thể nhận phòng khi đã gán phòng và đủ quyền."
                          : "Nhận phòng chỉ mở vào đúng ngày khách đến."}
                      </p>
                    </div>
                    {canOperateArrivals ? (
                      <Link
                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:opacity-90"
                        href={`/hotels/${encodeURIComponent(hotelId)}/rooms?flow=arrivals&range=${range}`}
                      >
                        {arrival.roomId ? "Xử lý đặt phòng" : "Gán phòng"}
                      </Link>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-[var(--on-surface-variant)]">
              Không có khách đến trong khoảng thời gian hoặc bộ lọc đã chọn.
            </p>
          )
        ) : inHousePage?.items.length ? (
          <div className="divide-y divide-[var(--outline-variant)]">
            {inHousePage.items.map((room) => {
              const stay = room.activeStay;
              const roomNumber = room.roomNumber || "Chưa rõ";
              const isOverdue = Boolean(
                stay?.plannedCheckOutAt &&
                  new Date(stay.plannedCheckOutAt).getTime() < renderedAt.getTime(),
              );
              return (
                <article className="grid gap-4 py-5 lg:grid-cols-[1fr_auto] lg:items-center" key={room.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-[var(--on-surface)]">
                        {stay?.guestDisplayName || "Khách lưu trú"}
                      </h3>
                      <span className="rounded-full bg-[var(--surface-container)] px-2.5 py-1 text-xs font-semibold text-[var(--on-surface-variant)]">
                        Phòng {roomNumber}
                      </span>
                      {isOverdue ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">
                          Quá hạn trả phòng
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                      {stay?.reservationCode || "Không có mã đặt phòng"} · {stay?.guestPhone || "Chưa có SĐT"}
                    </p>
                    <div className="mt-2 grid gap-1 text-sm text-[var(--on-surface-variant)] sm:grid-cols-3">
                      <span>Nhận: {formatDateTime(stay?.checkedInAt ?? stay?.plannedCheckInAt)}</span>
                      <span>Dự kiến trả: {formatDateTime(stay?.plannedCheckOutAt)}</span>
                      <span>{(stay?.occupants?.length ?? 0) + 1} khách khai báo</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:opacity-90"
                      href={`/hotels/${encodeURIComponent(hotelId)}/rooms?q=${encodeURIComponent(roomNumber)}`}
                    >
                      Quản lý lưu trú
                    </Link>
                    {canViewRequests ? (
                      <Link
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--outline-variant)] px-4 text-sm font-semibold text-[var(--primary)]"
                        href={`/hotels/${encodeURIComponent(hotelId)}/requests?roomNumber=${encodeURIComponent(roomNumber)}`}
                      >
                        Yêu cầu
                      </Link>
                    ) : null}
                    {canViewBilling && stay?.id ? (
                      <Link
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--outline-variant)] px-4 text-sm font-semibold text-[var(--primary)]"
                        href={`/hotels/${encodeURIComponent(hotelId)}/billing?stayId=${encodeURIComponent(stay.id)}&roomId=${encodeURIComponent(room.id)}&roomNumber=${encodeURIComponent(roomNumber)}`}
                      >
                        Thu ngân
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-[var(--on-surface-variant)]">
            Không có khách đang lưu trú trong bộ lọc đã chọn.
          </p>
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
