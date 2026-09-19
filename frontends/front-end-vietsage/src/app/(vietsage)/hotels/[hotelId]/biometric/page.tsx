import { auth } from "@/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BiometricOwnerTabs } from "@/features/local-biometric/components/biometric-owner-tabs";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

type PageProps = { params: Promise<{ hotelId: string }> };
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
    <main className="space-y-8 pb-12">
      {/* Elevated Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-stone-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-xs font-bold uppercase tracking-[0.14em] text-stone-600">
              BỘ PHẬN LỄ TÂN
            </span>
            <span className="text-stone-300">/</span>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--secondary)]">
              THIẾT BỊ SINH TRẮC HỌC
            </span>
          </div>
          <h1 className="vs-display mt-2 text-3xl font-extrabold text-[var(--primary)] sm:text-4xl">
            Trạm Máy Quét CCCD & Thiết Bị
          </h1>
          <p className="mt-1 text-sm text-stone-600 max-w-2xl">
            Quản trị kết nối phần cứng đầu đọc HN-212 và máy quét di động. Kiểm thử giải mã thẻ CCCD gắn chip tức thì trước khi thực hiện check-in nhận phòng.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/hotels/${hotelId}/rooms`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-sm font-bold text-white shadow-2xs transition-colors hover:bg-[#000060]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span>Đến Quầy Check-in</span>
          </Link>
        </div>
      </header>

      {/* Main Biometric Command Center */}
      <BiometricOwnerTabs hotelId={hotelId} />
    </main>
  );
}
