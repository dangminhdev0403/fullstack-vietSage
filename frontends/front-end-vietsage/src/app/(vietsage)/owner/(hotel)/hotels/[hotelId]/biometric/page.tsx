import { BiometricOwnerTabs } from "@/features/local-biometric/components/biometric-owner-tabs";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export default async function OwnerHotelBiometricPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  return (
    <main className="space-y-6">
      <header>
        <h1 className="vs-display text-3xl font-bold text-[var(--primary)]">Thiết bị nhận diện</h1>
        <p className="mt-2 text-sm text-[var(--on-surface-variant)]">Quản lý và kiểm tra CCCD, FaceID theo khách sạn.</p>
      </header>
      <BiometricOwnerTabs hotelId={hotelId} />
    </main>
  );
}
