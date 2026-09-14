import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  assertCanAccessHotelOps,
  canUseHotelId,
  requireHotelOpsServerTokens,
} from "@/features/hotel-ops/utils/hotel-route-auth";
import { KbttDeclarationsPage } from "@/features/kbtt/components/kbtt-declarations-page";
import { resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function HotelKbttOperationalPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/kbtt` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  const persona = resolveWorkspacePersona(context.activeRole.code);
  if (persona === "owner") {
    redirect(`/owner/hotels/${encodeURIComponent(hotelId)}/kbtt`);
  }

  const canViewDeclarations = context.permissions.some((permission) =>
    ["hotel.kbtt.declarations.view", "hotel.kbtt.declarations.manage"].includes(permission),
  );

  const canManageDeclarations = context.permissions.includes("hotel.kbtt.declarations.manage");

  if (!canUseHotelId(context, hotelId) || !canViewDeclarations) {
    notFound();
  }

  return (
    <KbttDeclarationsPage
      hotelId={hotelId}
      canManage={canManageDeclarations}
      canConfigure={false}
    />
  );
}
