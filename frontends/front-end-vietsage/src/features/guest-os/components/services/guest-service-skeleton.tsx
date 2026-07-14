export function GuestServiceSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="min-h-64 animate-pulse rounded-[24px] border border-[#25483f]/5 bg-[#fffdfa] p-5 shadow-[0_12px_36px_rgba(31,61,53,0.06)]">
          <div className="h-6 w-2/3 rounded-full bg-[#e8e5dc]" />
          <div className="mt-4 h-4 w-full rounded-full bg-[#eeece5]" />
          <div className="mt-2 h-4 w-4/5 rounded-full bg-[#eeece5]" />
          <div className="mt-7 h-8 w-1/3 rounded-full bg-[#e8e5dc]" />
          <div className="mt-10 h-12 w-full rounded-full bg-[#dfe5df]" />
        </div>
      ))}
    </div>
  );
}
