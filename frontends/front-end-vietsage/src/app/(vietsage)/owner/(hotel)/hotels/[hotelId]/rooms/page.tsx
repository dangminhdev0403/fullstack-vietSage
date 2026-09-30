import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { ownerAccessMessage } from "@/app/(vietsage)/owner/_components/owner-auth";

import { OwnerRoomsClient } from "./owner-rooms-client";

type PageProps = { params: Promise<{ hotelId: string }> };

export const dynamic = "force-dynamic";

function isNextRouterError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

export default async function OwnerHotelRoomsPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
  const callbackUrl = `/owner/hotels/${hotelId}/rooms` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  let roomsPage;

  try {
    roomsPage = await authorizedApi("list owner rooms", (accessToken) =>
      hotelOpsService.listRooms(hotelId, { query: { page: 1, limit: 100 }, accessToken }),
    );
  } catch (error) {
    if (isNextRouterError(error)) {
      throw error;
    }

    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }

    return (
      <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-sm text-[var(--on-surface-variant)]">
        {ownerAccessMessage(error)}
      </section>
    );
  }

  return (
    <OwnerRoomsClient
      hotelId={hotelId}
      initialRooms={roomsPage.items}
      initialTypes={roomsPage.types}
      initialFloors={roomsPage.floors}
    />
  );
}
