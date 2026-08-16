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
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.2em] text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
          Billing &amp; Revenue Protection
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Quản lý tài chính &amp; phí VietSage SaaS
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Xem thông tin hóa đơn folio khách đang lưu trú và đối soát minh bạch chi phí VietSage SaaS theo lượt phòng/ngày.
        </p>
      </div>

      <BillingTabSwitcher hotelId={hotelId} foliosPage={foliosPage} />
    </div>
  );
}
