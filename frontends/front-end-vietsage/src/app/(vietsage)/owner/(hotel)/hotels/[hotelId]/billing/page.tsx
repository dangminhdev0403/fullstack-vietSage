import { auth } from "@/auth";
import { billingService } from "@/features/billing/service/billing-service-instance";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { BillingFolioTableClient } from "./billing-folio-table-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export const dynamic = "force-dynamic";

export default async function OwnerBillingPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
    const callbackUrl = `/owner/hotels/${hotelId}/billing` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
    
  const folios = await authorizedApi("list billing folios", (accessToken) =>
    billingService.listFolios(hotelId, { query: { page: 1, limit: 50 }, accessToken }),
  );

  return (
    <>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--primary)]">Billing</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--on-surface)]">Folio khách đang lưu trú</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-variant)]">
            Màn hình chỉ hiển thị tổng tiền từ backend. Folio chỉ có hai trạng thái: đang mở hoặc đã đóng.
          </p>
        </div>

        <BillingFolioTableClient hotelId={hotelId} folios={folios.items} />
      </div>
    </>
  );
}
