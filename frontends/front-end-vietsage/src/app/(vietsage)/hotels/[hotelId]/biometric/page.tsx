import { auth } from "@/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BiometricOwnerTabs } from "@/features/local-biometric/components/biometric-owner-tabs";
import {
  assertCanAccessHotelOps,
  canUseHotelId,
  requireHotelOpsServerTokens,
} from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import {
  FRONTDESK_HN2N_CCCD_SCANNER,
  hasHotelFeature,
} from "@/features/hotel-features/hotel-features";

type PageProps = { params: Promise<{ hotelId: string }> };
export const dynamic = "force-dynamic";

export default async function StaffHotelBiometricPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/biometric` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(
    callbackUrl,
    tokens.accessToken,
  );

  const canUseScanner =
    context.permissions.includes("hotel.stays.manage") ||
    context.permissions.includes("hotel.stays.check-in");
  if (!canUseHotelId(context, hotelId) || !canUseScanner) {
    notFound();
  }

  const selectedHotel = context.accessibleHotels.find(
    (hotel) => hotel.id === hotelId,
  );
  const isFeatureEnabled = hasHotelFeature(
    selectedHotel?.enabledFeatures,
    FRONTDESK_HN2N_CCCD_SCANNER,
  );

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
            Quản trị kết nối phần cứng đầu đọc HN-212 và máy quét di động. Kiểm
            thử giải mã thẻ CCCD gắn chip tức thì trước khi thực hiện check-in
            nhận phòng.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/hotels/${hotelId}/rooms`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-sm font-bold text-white shadow-2xs transition-colors hover:bg-[#000060]"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <span>Đến Quầy Check-in</span>
          </Link>
        </div>
      </header>

      {/* Main Biometric Command Center or Disabled Notice */}
      {!isFeatureEnabled ? (
        <section
          data-ui="feature-disabled-notice"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-xs"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <svg
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-bold text-amber-950">
            Tính năng chưa được kích hoạt
          </h2>
          <p className="mt-2 text-sm text-amber-800 max-w-md mx-auto">
            Tính năng trạm máy quét CCCD HN2N/HN-212 chưa được kích hoạt cho
            khách sạn này. Vui lòng liên hệ Quản trị viên để mở khoá tính năng.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/hotels/${hotelId}/rooms`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-800 px-5 py-2.5 text-sm font-bold text-white shadow-2xs transition-colors hover:bg-amber-900"
            >
              <span>Về Sơ đồ phòng & Check-in</span>
            </Link>
          </div>
        </section>
      ) : (
        <BiometricOwnerTabs hotelId={hotelId} />
      )}
    </main>
  );
}
