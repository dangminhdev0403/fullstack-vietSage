type BoundaryTone = "admin" | "guest" | "hotel" | "owner" | "staff";

const toneClassMap: Record<BoundaryTone, string> = {
  admin: "border-[var(--outline-variant)] bg-white text-[var(--on-surface)]",
  guest: "border-[#25483f]/15 bg-white text-[#18211d]",
  hotel: "border-[var(--outline-variant)] bg-white text-[var(--on-surface)]",
  owner: "border-[#24473d]/15 bg-white text-[#17201b]",
  staff: "border-[var(--outline-variant)] bg-white text-[var(--on-surface)]",
};

type RouteBoundaryStateProps = {
  action?: {
    label: string;
    onClick: () => void;
  };
  eyebrow: string;
  message: string;
  title: string;
  tone?: BoundaryTone;
};

export function RouteBoundaryState({
  action,
  eyebrow,
  message,
  title,
  tone = "hotel",
}: RouteBoundaryStateProps) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-20">
      <section
        className={`w-full max-w-2xl rounded-xl border p-6 shadow-[0_18px_50px_rgba(31,61,53,0.10)] ${toneClassMap[tone]}`}
        role={action ? "alert" : "status"}
        aria-live={action ? "assertive" : "polite"}
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--secondary)]">{eyebrow}</p>
        <h2 className="mt-3 text-2xl font-semibold leading-tight md:text-3xl">{title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--on-surface-variant)]">{message}</p>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-5 text-sm font-bold text-[var(--on-primary)]"
          >
            {action.label}
          </button>
        ) : null}
      </section>
    </main>
  );
}

type RouteLoadingStateProps = {
  label: string;
  tone?: BoundaryTone;
};

export function RouteLoadingState({ label, tone = "hotel" }: RouteLoadingStateProps) {
  return (
    <main className="px-4 py-24" aria-busy="true" aria-live="polite">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <div className={`rounded-xl border p-6 ${toneClassMap[tone]}`}>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--secondary)]">{label}</p>
          <div className="mt-4 h-8 w-2/3 animate-pulse rounded-lg bg-[var(--surface-container-high)]" />
          <div className="mt-3 h-4 w-1/2 animate-pulse rounded-lg bg-[var(--surface-container)]" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-white/80 shadow-[0_12px_35px_rgba(31,61,53,0.08)]" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-white/80 shadow-[0_12px_35px_rgba(31,61,53,0.08)]" />
      </div>
    </main>
  );
}
