import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { BiometricOwnerTabs } from "@/features/local-biometric/components/biometric-owner-tabs";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
export const dynamic = "force-dynamic";

export default async function StaffHotelBiometricPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/biometric` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  if (!canUseHotelId(context, hotelId) || !context.permissions.includes("hotel.stays.manage")) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--secondary)]">BỘ PHẬN LỄ TÂN</p>
        <h1 className="vs-display mt-1 text-3xl font-extrabold text-[var(--primary)] sm:text-4xl">Máy quét CCCD</h1>
      </header>
      <BiometricOwnerTabs hotelId={hotelId} />
    </main>
  );
}
