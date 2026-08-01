import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";

import { OwnerRoomsClient } from "./owner-rooms-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export const dynamic = "force-dynamic";

export default async function OwnerHotelRoomsPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
  const callbackUrl = `/owner/hotels/${hotelId}/rooms` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  try {
    const roomsPage = await authorizedApi("list owner rooms", (accessToken) =>
      hotelOpsService.listRooms(hotelId, { query: { page: 1, limit: 100 }, accessToken }),
    );

    return (
      <OwnerRoomsClient hotelId={hotelId} initialRooms={roomsPage.items} />
    );
  } catch (error) {
    console.error("[OWNER_ROOMS_PAGE_ERROR]", {
      hotelId,
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
      ...(error instanceof HttpError
        ? { status: error.status, requestUrl: error.requestUrl, data: error.data }
        : {}),
    });

    if (error instanceof HttpError && error.status === 404) {
      return (
        <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-sm text-[var(--on-surface-variant)]">
          <p>Không tìm thấy dữ liệu phòng cho khách sạn này.</p>
        </section>
      );
    }

    // Re-throw to let createAuthorizedApiExecutor handle 401/403
    throw error;
  }
}
