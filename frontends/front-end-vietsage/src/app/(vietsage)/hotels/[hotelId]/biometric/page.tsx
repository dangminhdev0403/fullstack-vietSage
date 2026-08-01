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
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--secondary)]">BỘ PHẬN LỄ TÂN</p>
        <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)]">Máy quét CCCD</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-variant)]">Quản lý kết nối thiết bị đọc chip CCCD và kiểm tra nhận diện tại quầy lễ tân.</p>
      </header>
      <BiometricOwnerTabs hotelId={hotelId} />
    </main>
  );
}
