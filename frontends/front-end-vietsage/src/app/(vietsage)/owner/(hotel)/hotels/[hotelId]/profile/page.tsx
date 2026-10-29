import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import type { Hotel } from "@/features/admin/types/admin-contract";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { ownerAccessMessage } from "@/app/(vietsage)/owner/_components/owner-auth";

import { OwnerHotelDetailClient } from "../owner-hotel-detail-client";

type PageProps = {
  params: Promise<{ hotelId: string }>;
};

export const dynamic = "force-dynamic";

export default async function OwnerHotelProfilePage({ params }: PageProps) {
  const { hotelId } = await params;
  const session = await auth();
  const callbackUrl = `/owner/hotels/${encodeURIComponent(hotelId)}/profile` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  let hotel: Hotel | null = null;

  try {
    hotel = await authorizedApi("get owner hotel profile", (accessToken) =>
      adminService.getHotel(hotelId, accessToken),
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }

    return (
      <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-sm text-[var(--on-surface-variant)]">
        {ownerAccessMessage(error)}
      </section>
    );
  }

  if (!hotel) {
    notFound();
  }

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
          CÀI ĐẶT CHỦ KHÁCH SẠN
        </p>
        <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)] text-balance">
          Thông tin khách sạn
        </h1>
      </header>

      <OwnerHotelDetailClient hotel={hotel} />
    </div>
  );
}
