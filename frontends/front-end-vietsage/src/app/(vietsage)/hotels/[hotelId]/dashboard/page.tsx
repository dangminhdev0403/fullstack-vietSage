import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { formatMoney } from "@/features/billing/utils/money";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { HotelArrival } from "@/features/hotel-ops/types/hotel-ops-contract";
import { formatDayMonth, formatDashboardCount } from "./dashboard-presentation";
import { getArrivalDateRange } from "@/features/hotel-ops/utils/arrival-date-range";

type PageProps = { params: Promise<{ hotelId: string }> };
export const dynamic = "force-dynamic";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function percent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function attentionRoute(
  hotelId: string,
  item: { type: string; id: string; action: { route: string } },
  basePrefix: string = "/hotels",
): string {
  if (item.type.includes("request")) return `${basePrefix}/${hotelId}/requests?requestId=${encodeURIComponent(item.id)}`;
  if (item.type.includes("checkout")) return `${basePrefix}/${hotelId}/billing`;
  if (item.type.includes("room")) return `${basePrefix}/${hotelId}/rooms`;
  if (item.action.route.startsWith(`${basePrefix}/${hotelId}/`)) return item.action.route;
  return `${basePrefix}/${hotelId}/dashboard`;
}

export default async function StaffHotelDashboardPage({
  params,
  baseRoutePrefix = "/hotels",
}: PageProps & { baseRoutePrefix?: string }) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `${baseRoutePrefix}/${hotelId}/dashboard` as `/${string}`;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  if (!canUseHotelId(context, hotelId) || !context.permissions.includes("hotel.dashboard.view")) notFound();

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const dashboard = await authorizedApi("load staff hotel dashboard", (accessToken) =>
    hotelOpsService.getDashboard(hotelId, { accessToken }),
  );

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrowDate);

  let tomorrowArrivals: HotelArrival[] = [];
  try {
    const tomorrowRange = getArrivalDateRange("tomorrow", new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()));
    const arrivalsPage = await authorizedApi("load tomorrow arrivals", (accessToken) =>
      hotelOpsService.listArrivals(hotelId, {
        query: { ...tomorrowRange, limit: 10 },
        accessToken,
      }),
    );
    tomorrowArrivals = arrivalsPage?.items ?? [];
  } catch (_e) {
    tomorrowArrivals = [];
  }

  const guests = dashboard.guests ?? {
    inHouse: dashboard.stays.activeStays ?? dashboard.rooms.byStatus.occupied,
    advanceReservations: 0,
    arrivalsToday: dashboard.stays.todayCheckIns,
    arrivalsTomorrow: tomorrowArrivals.length,
  };

  const roomCards = [
    { label: "Đang ở", value: dashboard.rooms.byStatus.occupied, icon: "hotel", tone: "text-[var(--primary)]", progress: dashboard.rooms.occupancyRate },
    { label: "Sẵn sàng", value: dashboard.rooms.byStatus.available, icon: "check_circle", tone: "text-[var(--secondary)]", progress: dashboard.rooms.total ? (dashboard.rooms.byStatus.available / dashboard.rooms.total) * 100 : 0 },
    { label: "Khách đặt trước hôm nay", value: dashboard.stays.todayCheckIns, icon: "event_available", tone: "text-[var(--on-tertiary-container)]", progress: undefined },
    { label: "Đang dọn", value: dashboard.rooms.byStatus.processing, icon: "cleaning_services", tone: "text-[var(--primary)]", progress: undefined },
    { label: "Bảo trì", value: dashboard.rooms.byStatus.maintenance, icon: "build", tone: "text-[var(--error)]", progress: undefined },
  ] as const;

  const operations = [
    { label: "Nhận phòng", value: dashboard.stays.todayCheckIns, icon: "login", tone: "border-[var(--primary)]", iconTone: "bg-[var(--primary-fixed)] text-[var(--on-primary-fixed)]" },
    { label: "Trả phòng", value: dashboard.stays.todayCheckOuts, icon: "logout", tone: "border-[var(--secondary)]", iconTone: "bg-[var(--secondary-fixed)] text-[var(--on-secondary-fixed)]" },
    { label: "Thanh toán chờ", value: dashboard.stays.pendingCheckOuts, icon: "payments", tone: "border-[var(--error)]", iconTone: "bg-[var(--error-container)] text-[var(--on-error-container)]" },
    { label: "Yêu cầu mới", value: dashboard.requests.byStatus.sent, icon: "notifications_active", tone: "border-[var(--primary-fixed-dim)]", iconTone: "bg-[var(--surface-container-highest)] text-[var(--primary)]" },
  ] as const;

  const currentHotel = context.accessibleHotels.find((h) => h.id === hotelId);
  const hotelDisplayName = currentHotel?.name ?? "Khách sạn";
  const roleDisplayName = context.activeRole.name || "Lễ tân";

  return (
    <main className="space-y-8">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="vs-display text-4xl font-bold text-[var(--primary)]">Tổng quan điều hành &amp; Tài chính</h1>
          <p className="mt-2 text-base italic text-[var(--on-surface-variant)]">
            Kính chào {roleDisplayName}. Báo cáo doanh thu và giám sát vận hành cơ sở lưu trú thời gian thực tại {hotelDisplayName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/hotels/${hotelId}/billing`}
            prefetch={true}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-90 active:scale-95"
          >
            <VsIcon name="payments" className="text-base" />
            <span>Sổ thu ngân &amp; Hóa đơn</span>
          </Link>
          <div className="text-left md:text-right">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--primary)]/60">Ngày hôm nay</p>
            <p className="vs-display mt-0.5 text-xl font-semibold text-[var(--primary)]">{formatDayMonth(dashboard.generatedAt)}</p>
          </div>
        </div>
      </header>

      {/* Trung tâm Tài chính & Doanh thu Khách sạn */}
      <section className="rounded-xl border border-[var(--outline-variant)]/30 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-[var(--outline-variant)]/20 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-[#e6efe9] text-[var(--primary)]">
              <VsIcon name="account_balance_wallet" className="text-xl" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[var(--primary)]">Các khoản tiền &amp; Doanh thu vận hành</h2>
              <p className="text-xs text-[var(--on-surface-variant)]">Ghi nhận doanh thu từ tiền phòng, dịch vụ đã thanh toán và các khoản chờ thu.</p>
            </div>
          </div>
          <Link
            href={`/hotels/${hotelId}/billing`}
            prefetch={true}
            className="text-xs font-bold text-[var(--primary)] hover:underline flex items-center gap-1 shrink-0"
          >
            <span>Chi tiết thu ngân</span>
            <VsIcon name="arrow_forward" className="text-xs" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-[#166534]">Doanh thu hôm nay</p>
              <span className="grid size-7 place-items-center rounded-md bg-white text-[#15803d] shadow-2xs">
                <VsIcon name="payments" className="text-base" />
              </span>
            </div>
            <p className="vs-display mt-2 text-2xl lg:text-3xl font-bold text-[#14532d]">
              {formatMoney(dashboard.revenue.today, dashboard.revenue.currency)}
            </p>
            <p className="mt-1 text-xs text-[#166534] font-medium">Phát sinh thực thu trong ngày</p>
          </div>

          <div className="rounded-xl border border-[var(--outline-variant)]/40 bg-[var(--surface-container-low)] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">7 ngày gần nhất</p>
              <span className="grid size-7 place-items-center rounded-md bg-white text-[var(--primary)] shadow-2xs">
                <VsIcon name="trending_up" className="text-base" />
              </span>
            </div>
            <p className="vs-display mt-2 text-2xl lg:text-3xl font-bold text-[var(--primary)]">
              {formatMoney(dashboard.revenue.last7Days, dashboard.revenue.currency)}
            </p>
            <p className="mt-1 text-xs text-[var(--on-surface-variant)] font-medium">Xu hướng tuần hiện tại</p>
          </div>

          <div className="rounded-xl border border-[#fed7aa] bg-[#fffaf5] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-[#9a3412]">Doanh thu tháng này</p>
              <span className="grid size-7 place-items-center rounded-md bg-white text-[#c2410c] shadow-2xs">
                <VsIcon name="calendar_month" className="text-base" />
              </span>
            </div>
            <p className="vs-display mt-2 text-2xl lg:text-3xl font-bold text-[#9a3412]">
              {formatMoney(dashboard.revenue.currentMonth, dashboard.revenue.currency)}
            </p>
            <p className="mt-1 text-xs text-[#9a3412] font-medium">Lũy kế tháng hiện hành</p>
          </div>

          <div className="rounded-xl border border-[#fecaca] bg-[#fff5f5] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-[#991b1b]">Chờ thanh toán / Trả phòng</p>
              <span className="grid size-7 place-items-center rounded-md bg-white text-[#b91c1c] shadow-2xs">
                <VsIcon name="logout" className="text-base" />
              </span>
            </div>
            <p className="vs-display mt-2 text-2xl lg:text-3xl font-bold text-[#991b1b]">
              {formatDashboardCount(dashboard.stays.pendingCheckOuts)} <span className="text-sm font-normal">lượt</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-[#991b1b] font-medium">Chưa chốt hóa đơn</span>
              <Link
                href={`${baseRoutePrefix}/${hotelId}/billing`}
                prefetch={true}
                className="font-bold text-[#b91c1c] hover:underline"
              >
                Thu tiền &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Chỉ số Điều hành Trọng tâm: Lưu trú, Đặt trước, Phòng trống, Đến ngày mai */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <article className="flex flex-col justify-between rounded-xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-900">Khách đang lưu trú</span>
            <span className="grid size-8 place-items-center rounded-lg bg-blue-100 text-blue-800 shadow-2xs">
              <VsIcon name="group" className="text-lg" />
            </span>
          </div>
          <p className="vs-display mt-2 text-2xl lg:text-3xl font-extrabold text-blue-950">
            {formatDashboardCount(guests.inHouse)} <span className="text-sm font-normal text-blue-800">khách</span>
          </p>
          <p className="mt-1 text-xs text-blue-800 font-medium">Đang có mặt tại khách sạn</p>
        </article>

        <article className="flex flex-col justify-between rounded-xl border border-purple-200 bg-purple-50/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-900">Đặt phòng trước</span>
            <span className="grid size-8 place-items-center rounded-lg bg-purple-100 text-purple-800 shadow-2xs">
              <VsIcon name="calendar_month" className="text-lg" />
            </span>
          </div>
          <p className="vs-display mt-2 text-2xl lg:text-3xl font-extrabold text-purple-950">
            {formatDashboardCount(guests.advanceReservations)} <span className="text-sm font-normal text-purple-800">lượt</span>
          </p>
          <p className="mt-1 text-xs text-purple-800 font-medium">Đặt trước các ngày tới</p>
        </article>

        <article className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">Phòng còn trống</span>
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-100 text-emerald-800 shadow-2xs">
              <VsIcon name="check_circle" className="text-lg" />
            </span>
          </div>
          <p className="vs-display mt-2 text-2xl lg:text-3xl font-extrabold text-emerald-950">
            {formatDashboardCount(dashboard.rooms.byStatus.available)} <span className="text-sm font-normal text-emerald-800">phòng</span>
          </p>
          <p className="mt-1 text-xs text-emerald-800 font-medium">Sẵn sàng đón khách mới</p>
        </article>

        <article className="flex flex-col justify-between rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900">Khách đặt trước ngày mai</span>
            <span className="grid size-8 place-items-center rounded-lg bg-amber-100 text-amber-800 shadow-2xs">
              <VsIcon name="next_plan" className="text-lg" />
            </span>
          </div>
          <p className="vs-display mt-2 text-2xl lg:text-3xl font-extrabold text-amber-950">
            {formatDashboardCount(guests.arrivalsTomorrow)} <span className="text-sm font-normal text-amber-800">lượt</span>
          </p>
          <p className="mt-1 text-xs text-amber-800 font-medium">Cần chuẩn bị phòng trước</p>
        </article>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {roomCards.map((card) => (
          <article key={card.label} className="group flex min-h-40 flex-col justify-between rounded-xl border border-[var(--outline-variant)]/30 bg-[var(--surface-container-low)] p-5 transition hover:-translate-y-1 hover:shadow-lg">
            <div className="flex items-start justify-between">
              <VsIcon name={card.icon} className={`text-3xl ${card.tone}`} />
              {card.progress !== undefined ? (
                <span className="relative flex size-12 items-center justify-center rounded-full border-4 border-[var(--outline-variant)]/25 text-xs font-semibold text-[var(--on-surface-variant)]">
                  <span className={`absolute inset-[-4px] rounded-full border-4 border-transparent border-t-current ${card.tone}`} style={{ transform: `rotate(${percent(card.progress) * 3.6 - 45}deg)` }} />
                  {percent(card.progress)}%
                </span>
              ) : null}
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">{card.label}</p>
              <p className={`vs-display mt-1 text-4xl font-bold ${card.tone}`}>{formatDashboardCount(card.value)}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {operations.map((operation) => (
          <article key={operation.label} className={`flex items-center gap-4 rounded-xl border-l-4 bg-white p-5 shadow-sm ${operation.tone}`}>
            <span className={`flex size-12 items-center justify-center rounded-lg ${operation.iconTone}`}><VsIcon name={operation.icon} className="text-2xl" /></span>
            <div>
              <p className="text-sm font-semibold text-[var(--on-surface-variant)]">{operation.label}</p>
              <p className="vs-display mt-1 text-2xl font-semibold text-[var(--primary)]">{formatDashboardCount(operation.value)}</p>
            </div>
          </article>
        ))}
      </section>

      {/* Kế hoạch Chuẩn bị đón tiếp ngày mai (Không nhận phòng sớm) */}
      <section className="rounded-2xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 p-6 sm:p-7 md:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-amber-200/60 pb-5">
          <div className="flex items-start sm:items-center gap-3.5 sm:gap-4">
            <span className="grid size-12 sm:size-14 shrink-0 place-items-center rounded-xl bg-amber-100/90 text-amber-900 shadow-xs">
              <VsIcon name="assignment_turned_in" className="text-2xl sm:text-3xl" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-amber-950">Công tác chuẩn bị đón khách ngày mai</h2>
              <p className="mt-1 text-sm sm:text-base text-amber-900/85 leading-relaxed">
                Kiểm tra sơ đồ buồng phòng dự kiến và xếp trước phòng cho khách đặt trước ngày mai. Không thực hiện nhận phòng sớm trước ngày nhận phòng.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 self-start sm:self-center text-sm sm:text-base font-bold text-amber-900 bg-amber-100 border border-amber-300 px-4 py-2 rounded-xl shadow-2xs shrink-0">
            <VsIcon name="event" className="text-base sm:text-lg" />
            <span>Ngày mai: {tomorrowYmd}</span>
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href={`${baseRoutePrefix}/${hotelId}/rooms?businessDate=${tomorrowYmd}`}
            prefetch={true}
            className="group flex min-h-[96px] items-center gap-4 rounded-xl border-2 border-amber-200/80 bg-white p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md active:scale-[0.98]"
          >
            <span className="grid size-12 sm:size-14 shrink-0 place-items-center rounded-xl bg-amber-100/80 text-amber-900 transition-colors group-hover:bg-amber-200/90">
              <VsIcon name="meeting_room" className="text-2xl sm:text-3xl" />
            </span>
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-bold text-amber-950 group-hover:text-amber-900">Sơ đồ phòng ngày mai</p>
              <p className="mt-1 text-xs sm:text-sm text-amber-800/85 leading-snug">Xem trạng thái dự kiến &amp; gán phòng trước</p>
            </div>
          </Link>

          <Link
            href={`${baseRoutePrefix}/${hotelId}/rooms?status=processing`}
            prefetch={true}
            className="group flex min-h-[96px] items-center gap-4 rounded-xl border-2 border-amber-200/80 bg-white p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md active:scale-[0.98]"
          >
            <span className="grid size-12 sm:size-14 shrink-0 place-items-center rounded-xl bg-amber-100/80 text-amber-900 transition-colors group-hover:bg-amber-200/90">
              <VsIcon name="cleaning_services" className="text-2xl sm:text-3xl" />
            </span>
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-bold text-amber-950 group-hover:text-amber-900">Phòng chờ dọn ({dashboard.rooms.byStatus.processing})</p>
              <p className="mt-1 text-xs sm:text-sm text-amber-800/85 leading-snug">Đôn đốc buồng phòng hoàn tất sẵn sàng</p>
            </div>
          </Link>

          <Link
            href={`${baseRoutePrefix}/${hotelId}/rooms?flow=reservation`}
            prefetch={true}
            className="group flex min-h-[96px] items-center gap-4 rounded-xl border-2 border-amber-200/80 bg-white p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md active:scale-[0.98]"
          >
            <span className="grid size-12 sm:size-14 shrink-0 place-items-center rounded-xl bg-amber-100/80 text-amber-900 transition-colors group-hover:bg-amber-200/90">
              <VsIcon name="edit_calendar" className="text-2xl sm:text-3xl" />
            </span>
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-bold text-amber-950 group-hover:text-amber-900">Đặt phòng tương lai</p>
              <p className="mt-1 text-xs sm:text-sm text-amber-800/85 leading-snug">Tạo đặt trước có chọn phòng &amp; giá đêm</p>
            </div>
          </Link>
        </div>

        {tomorrowArrivals.length > 0 ? (
          <div className="mt-6 rounded-xl border border-amber-200/80 bg-white/95 p-4 sm:p-5 shadow-2xs">
            <p className="text-sm sm:text-base font-bold uppercase tracking-wider text-amber-950 mb-3 flex items-center gap-2">
              <VsIcon name="list_alt" className="text-lg text-amber-800" />
              <span>Danh sách khách đặt trước ngày mai ({tomorrowArrivals.length} lượt)</span>
            </p>
            <div className="space-y-2.5">
              {tomorrowArrivals.slice(0, 5).map((arrival) => (
                <div
                  key={arrival.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3 sm:p-3.5 text-amber-950"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-base font-bold text-amber-950">{arrival.guestDisplayName}</p>
                    <p className="mt-0.5 text-xs sm:text-sm text-amber-800/85">
                      Mã: <span className="font-semibold text-amber-900">{arrival.reservationCode}</span> · {arrival.room?.roomNumber ? `Phòng ${arrival.room.roomNumber}` : arrival.roomId ? `Phòng ${arrival.roomId}` : "Chưa gán phòng"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs sm:text-sm font-semibold text-amber-900 border border-amber-200/70">
                      Không nhận phòng sớm
                    </span>
                    <Link
                      href={`${baseRoutePrefix}/${hotelId}/rooms?businessDate=${tomorrowYmd}`}
                      className="inline-flex min-h-[44px] items-center rounded-xl bg-amber-800 px-4 py-2 text-sm font-bold text-white shadow-2xs transition-colors hover:bg-amber-900"
                    >
                      Xem &amp; Gán phòng
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
        <article>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="vs-display text-2xl font-semibold text-[var(--primary)]">Yêu cầu của khách <span className="text-[var(--error)]">•</span></h2>
            <Link href={`${baseRoutePrefix}/${hotelId}/requests`} prefetch={true} className="text-sm font-bold text-[var(--primary)]">Xem tất cả</Link>
          </div>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="grid grid-cols-[0.5fr_1.5fr_0.8fr_0.8fr] border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-5 py-4 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]"><span>Phòng</span><span>Loại yêu cầu</span><span>Thời gian</span><span>Trạng thái</span></div>
            {dashboard.attention.slice(0, 5).map((item) => (
              <Link key={`${item.type}-${item.id}`} href={attentionRoute(hotelId, item, baseRoutePrefix)} prefetch={true} className="grid grid-cols-[0.5fr_1.5fr_0.8fr_0.8fr] items-center border-b border-[var(--outline-variant)]/50 px-5 py-4 text-sm transition hover:bg-[var(--surface-container-low)]">
                <span className="font-bold text-[var(--primary)]">{item.title.match(/\d+/)?.[0] ?? "-"}</span><span className="font-semibold text-[var(--on-surface)]">{item.title}</span><span className="text-sm text-[var(--on-surface-variant)]">{formatTime(item.createdAt)}</span><span className="w-fit rounded-full bg-[var(--primary-fixed)] px-2.5 py-1 text-xs font-bold uppercase text-[var(--on-primary-fixed-variant)]">{item.priority}</span>
              </Link>
            ))}
            {dashboard.attention.length === 0 ? <p className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Chưa có yêu cầu cần chú ý.</p> : null}
          </div>
        </article>

        <aside>
          <h2 className="vs-display mb-4 text-2xl font-semibold text-[var(--primary)]">Nhật ký hoạt động</h2>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="space-y-5">
              {dashboard.activities.slice(0, 6).map((activity) => (
                <div key={activity.id} className="relative flex gap-3 border-l border-[var(--outline-variant)] pl-5 last:border-transparent">
                  <span className="absolute -left-2 top-0 flex size-4 items-center justify-center rounded-full bg-[var(--primary)] text-white"><VsIcon name="arrow_forward" className="text-xs" /></span>
                  <div><p className="text-sm font-bold text-[var(--primary)]">{activity.title}</p><p className="mt-1 text-sm text-[var(--on-surface-variant)]">{activity.description} · {formatTime(activity.createdAt)}</p></div>
                </div>
              ))}
              {dashboard.activities.length === 0 ? <p className="text-sm text-[var(--on-surface-variant)]">Chưa có hoạt động trong ca.</p> : null}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
