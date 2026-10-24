import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  assertCanAccessHotelOps,
  canUseHotelId,
  requireHotelOpsServerTokens,
} from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
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

export default async function StaffReportsPage({
  params,
  searchParams,
}: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : {};
  const range = (resolvedSearchParams.range as GetHotelReportsQuery["range"]) || "30d";
  const callbackUrl = `/hotels/${hotelId}/reports` as const;

  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  if (!canUseHotelId(context, hotelId)) {
    notFound();
  }

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  let reports;
  try {
    reports = await authorizedApi("load hotel reports", (accessToken) =>
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
      <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-base text-[var(--on-surface-variant)]">
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
