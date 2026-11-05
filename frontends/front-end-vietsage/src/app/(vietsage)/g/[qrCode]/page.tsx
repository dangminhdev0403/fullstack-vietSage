import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import GuestQrEntryClient from "./guest-qr-entry-client";

type PageProps = {
  params: Promise<{ qrCode: string }>;
};

const RESERVED_GUEST_ROUTES = new Set(["home", "language", "requests", "services"]);

export default async function GuestQrEntryPage({ params }: PageProps) {
  const { qrCode: rawQrCode } = await params;
  const qrCode = rawQrCode.trim();
  const reservedRoute = qrCode.toLowerCase();
  if (RESERVED_GUEST_ROUTES.has(reservedRoute)) {
    redirect(`/g/${reservedRoute}`);
  }

  const session = await auth();
  if (!session?.user) {
    return <GuestQrEntryClient />;
  }

  const callbackUrl: `/${string}` = `/g/${encodeURIComponent(qrCode)}`;
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  const effectiveRoleCode = context.activeRole.baseRoleCode ?? context.activeRole.code;
  if (effectiveRoleCode !== "HOTEL_HOUSEKEEPING") {
    return <GuestQrEntryClient />;
  }

  if (!qrCode) {
    notFound();
  }

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  let room: Awaited<ReturnType<typeof hotelOpsService.getHousekeepingRoomByQr>>;
  try {
    room = await authorizedApi("resolve housekeeping room QR", (accessToken) =>
      hotelOpsService.getHousekeepingRoomByQr(qrCode, { accessToken }),
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  redirect(`/hotels/${room.hotelId}/rooms/${room.id}`);
}
