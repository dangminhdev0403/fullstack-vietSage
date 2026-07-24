import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";

import { OwnerRoomsClient } from "./owner-rooms-client";
import { OwnerStayRoomGridClient } from "../stay/owner-stay-room-grid-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export const dynamic = "force-dynamic";

export default async function OwnerHotelRoomsPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
    const callbackUrl = `/owner/hotels/${hotelId}/rooms` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
    
  const roomsPage = await authorizedApi("list owner rooms", (accessToken) =>
    hotelOpsService.listRooms(hotelId, { query: { page: 1, limit: 100 }, accessToken }),
  );

  return (
    <div className="space-y-10">
      <OwnerRoomsClient hotelId={hotelId} initialRooms={roomsPage.items} />
      <OwnerStayRoomGridClient hotelId={hotelId} rooms={roomsPage.items} />
    </div>
  );
}
