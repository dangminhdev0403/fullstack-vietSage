export default function OwnerHotelLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-24 rounded-md bg-[#24473d]/10" />
        <div className="h-9 w-64 rounded-xl bg-[#24473d]/15" />
        <div className="h-4 w-80 rounded-md bg-[#24473d]/10" />
      </div>

      {/* Content panel skeleton */}
      <div className="h-80 rounded-2xl border border-[#24473d]/10 bg-white/70 p-6 shadow-xs" />
    </div>
  );
}
