export default function OwnerDashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="h-72 animate-pulse rounded-[2rem] bg-[#17201b]/80" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-[1.4rem] bg-white/70" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-[1.75rem] bg-white/70" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-[1.75rem] bg-white/70" />
        <div className="h-72 animate-pulse rounded-[1.75rem] bg-white/70" />
      </div>
    </div>
  );
}
