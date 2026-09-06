import { BiometricOwnerTabs } from "@/features/local-biometric/components/biometric-owner-tabs";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export default async function OwnerHotelBiometricPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
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
