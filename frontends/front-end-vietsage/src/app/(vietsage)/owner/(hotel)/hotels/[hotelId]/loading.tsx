export default function OwnerHotelLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-24 rounded-md bg-[#24473d]/10" />
        <div className="h-9 w-64 rounded-xl bg-[#24473d]/15" />
        <div className="h-4 w-96 rounded-md bg-[#24473d]/10" />
      </div>

      {/* Metric Cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-2xl border border-[#24473d]/10 bg-white/60 p-5 shadow-xs"
          >
            <div className="flex justify-between">
              <div className="h-3 w-20 rounded-md bg-[#24473d]/10" />
              <div className="h-7 w-7 rounded-lg bg-[#24473d]/10" />
            </div>
            <div className="mt-3 h-8 w-16 rounded-lg bg-[#24473d]/15" />
          </div>
        ))}
      </div>

      {/* Main Table / Grid Skeleton */}
      <div className="h-96 rounded-2xl border border-[#24473d]/10 bg-white/80 p-6 shadow-xs" />
    </div>
  );
}
