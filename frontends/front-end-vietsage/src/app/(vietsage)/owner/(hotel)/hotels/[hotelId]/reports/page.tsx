import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { ownerAccessMessage } from "@/app/(vietsage)/owner/_components/owner-auth";
import { HotelReportsWorkspaceClient } from "@/features/hotel-reports/components/hotel-reports-workspace-client";
import type { GetHotelReportsQuery } from "@/features/hotel-reports/types/hotel-reports-contract";

type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<{ range?: string; from?: string; to?: string; tab?: string }>;
};

export const dynamic = "force-dynamic";

function isNextRouterError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

export default async function OwnerHotelReportsPage({
  params,
  searchParams,
}: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : {};
  const range = (resolvedSearchParams.range as GetHotelReportsQuery["range"]) || "this_month";

  const session = await auth();
  const callbackUrl = `/owner/hotels/${hotelId}/reports` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  let reports;
  try {
    reports = await authorizedApi("load owner hotel reports", (accessToken) =>
      hotelOpsService.getReports(hotelId, {
        query: {
          range,
          from: resolvedSearchParams.from,
          to: resolvedSearchParams.to,
        },
        accessToken,
      }),
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
    <HotelReportsWorkspaceClient
      initialReports={reports}
      hotelId={hotelId}
    />
  );
}
