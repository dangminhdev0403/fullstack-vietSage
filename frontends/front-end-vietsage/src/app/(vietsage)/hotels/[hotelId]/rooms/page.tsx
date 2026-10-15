import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  assertCanAccessHotelOps,
  canUseHotelId,
  requireHotelOpsServerTokens,
} from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";
import { StaffRoomsClient } from "./staff-rooms-client";

type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
export const dynamic = "force-dynamic";

function getFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StaffRoomsPage({
  params,
  searchParams,
}: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialFlow = getFirst(resolvedSearchParams.flow);
  const initialBusinessDate = getFirst(resolvedSearchParams.businessDate);
  const initialArrivalRange = getFirst(resolvedSearchParams.range);
  const initialQuery = getFirst(resolvedSearchParams.q);
  const initialStatus = getFirst(resolvedSearchParams.status);
  const callbackUrl = `/hotels/${hotelId}/rooms` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(
    callbackUrl,
    tokens.accessToken,
  );
  const userPersona = resolveWorkspacePersona(context.activeRole.code);
  const isHousekeeping = userPersona === "housekeeping";
  const canViewRooms =
    context.permissions.includes("hotel.rooms.view") ||
    context.permissions.includes("hotel.rooms.status.manage");
  const canViewReservations =
    context.permissions.includes("hotel.reservations.view") ||
    context.permissions.includes("hotel.reservations.manage");
  if (
    !canUseHotelId(context, hotelId) ||
    (!canViewRooms && !canViewReservations)
  ) {
    notFound();
  }

  let roomsPage: Awaited<ReturnType<typeof hotelOpsService.listRooms>>;
  let dashboard: Awaited<ReturnType<typeof hotelOpsService.getDashboard>> | undefined;

  try {
    const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
    const effectiveInitialStatus = initialStatus ?? (isHousekeeping ? "processing" : undefined);
    roomsPage = await authorizedApi("list staff rooms", (accessToken) =>
      hotelOpsService.listRooms(hotelId, {
        query: {
          page: 1,
          limit: 100,
          ...(effectiveInitialStatus
            ? { status: effectiveInitialStatus.toUpperCase() }
            : {}),
          ...(!isHousekeeping && initialBusinessDate
            ? { businessDate: initialBusinessDate }
            : {}),
        },
        accessToken,
      }),
    );
    dashboard = isHousekeeping
      ? undefined
      : await authorizedApi("load room dashboard", (accessToken) =>
          hotelOpsService.getDashboard(hotelId, { accessToken }),
        );
  } catch (error) {
    console.error("[STAFF_ROOMS_PAGE_ERROR]", {
      hotelId,
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isUnassigned =
      errorMessage.includes("chưa được gán phòng") ||
      errorMessage.includes("Chưa gán phòng") ||
      (error as { status?: number })?.status === 403;

    if (isUnassigned) {
      return (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <span className="material-symbols-outlined text-3xl">warning</span>
          </div>
          <h2 className="mt-4 text-xl font-bold text-amber-950">
            Chưa gán phòng — tài khoản chưa thể thao tác vận hành
          </h2>
          <p className="mt-2 text-sm text-amber-800 max-w-md mx-auto">
            Khách sạn này áp dụng mô hình phân quyền độc quyền phòng. Vui lòng
            liên hệ Chủ khách sạn (Owner) để được gán phòng phụ trách trước khi
            thao tác sơ đồ phòng và lưu trú.
          </p>
        </section>
      );
    }

    return (
      <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-sm text-[var(--on-surface-variant)]">
        <p className="font-semibold text-[var(--primary)]">
          Không thể tải dữ liệu sơ đồ phòng
        </p>
        <p className="mt-1">
          Hệ thống dữ liệu đang phản hồi chậm. Vui lòng thử tải lại trang sau ít
          phút.
        </p>
      </section>
    );
  }

  const currentHotel = context.accessibleHotels.find((h) => h.id === hotelId);

  return (
    <>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--secondary)]">
            {isHousekeeping ? "VẬN HÀNH BUỒNG PHÒNG" : "SƠ ĐỒ PHÒNG"}
            {currentHotel?.name ? ` — ${currentHotel.name}` : ""}
          </p>
          <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)]">
            {isHousekeeping ? "Buồng phòng & Sơ đồ dọn dẹp" : "Mở phòng và lưu trú"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-variant)]">
            {isHousekeeping
              ? "Theo dõi trạng thái buồng phòng và xác nhận phòng đã dọn dẹp sạch sẽ, sẵn sàng đón khách mới."
              : "Chọn phòng sẵn sàng để check-in khách vãng lai hoặc đặt trước theo ngày. Sau khi mở phòng, QR GuestOS và mã truy cập được kích hoạt ngay."}
          </p>
        </div>
      </header>

      <section>
        <StaffRoomsClient
          hotelId={hotelId}
          initialRoomsPage={roomsPage}
          initialByStatus={dashboard?.rooms.byStatus}
          canManageRooms={!isHousekeeping && context.permissions.includes("hotel.rooms.manage")}
          canManageReservations={
            !isHousekeeping && context.permissions.includes("hotel.reservations.manage")
          }
          canManageStays={
            !isHousekeeping &&
            (context.permissions.includes("hotel.stays.manage") ||
              context.permissions.includes("hotel.stays.check-in"))
          }
          canViewBilling={
            !isHousekeeping &&
            (context.permissions.includes("hotel.billing.view") ||
              context.permissions.includes("hotel.billing.manage"))
          }
          canCheckoutBilling={
            !isHousekeeping &&
            (context.permissions.includes("hotel.billing.manage") ||
              context.permissions.includes("hotel.billing.checkout"))
          }
          canCheckOutStay={
            !isHousekeeping &&
            (context.permissions.includes("hotel.stays.manage") ||
              context.permissions.includes("hotel.stays.check-out"))
          }
          canCheckInStay={
            !isHousekeeping && context.permissions.includes("hotel.stays.check-in")
          }
          initialFlow={initialFlow}
          initialBusinessDate={initialBusinessDate}
          initialArrivalRange={initialArrivalRange}
          initialQuery={initialQuery}
          initialStatus={initialStatus}
          isHousekeeping={isHousekeeping}
          enabledFeatures={
            context.accessibleHotels.find((hotel) => hotel.id === hotelId)
              ?.enabledFeatures ?? []
          }
        />
      </section>
    </>
  );
}
