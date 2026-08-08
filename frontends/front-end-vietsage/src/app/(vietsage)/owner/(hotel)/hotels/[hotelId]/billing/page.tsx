import { auth } from "@/auth";
import { billingService } from "@/features/billing/service/billing-service-instance";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";

import { BillingTabSwitcher } from "./billing-tab-switcher";

type PageProps = {
  params: Promise<{ hotelId: string }> | { hotelId: string };
  searchParams?: Promise<{ folioPage?: string; tab?: string }> | { folioPage?: string; tab?: string };
};

export const dynamic = "force-dynamic";

export default async function OwnerBillingPage({ params, searchParams }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : {};
  const rawPage = parseInt(resolvedSearchParams.folioPage ?? "1", 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const session = await auth();
  const callbackUrl = `/owner/hotels/${hotelId}/billing` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  const foliosPage = await authorizedApi("list billing folios", (accessToken) =>
    billingService.listFolios(hotelId, { query: { page, limit: 20 }, accessToken }),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">Billing & Revenue Protection</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Quản lý Tài chính & Phí VietSage SaaS</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Xem thông tin hóa đơn folio khách đang lưu trú và đối soát minh bạch chi phí VietSage SaaS theo lượt phòng/ngày.
        </p>
      </div>

      <BillingTabSwitcher hotelId={hotelId} foliosPage={foliosPage} />
    </div>
  );
}
