import { VietSageBrand } from "@/components/brand/vietsage-brand";

export function LaunchHold() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f8f5ef] px-5 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-28 -top-32 size-96 rounded-full bg-[#dfe9e1]/65 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 size-112 rounded-full bg-[#eee3ca]/70 blur-3xl"
      />

      <section className="launch-border relative w-full max-w-3xl overflow-hidden rounded-4xl bg-white/90 px-6 py-12 text-center shadow-[0_24px_70px_rgba(20,61,43,0.12)] backdrop-blur-sm sm:px-12 sm:py-14">
        <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center">
          <VietSageBrand
            variant="mark"
            priority
            className="size-24 rounded-[1.4rem] border border-[#d8c07c]/45 p-2 shadow-[0_12px_30px_rgba(20,61,43,0.12)]"
            markClassName="h-full w-full"
          />
          <VietSageBrand
            variant="wordmark"
            priority
            className="mt-5 rounded-xl px-4 py-2"
            wordmarkClassName="h-7 w-auto sm:h-8"
          />
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#edf3ee] px-4 py-2 text-xs font-semibold text-[#365846]">
            <span
              className="size-1.5 rounded-full bg-[#bc8b31]"
              aria-hidden="true"
            />
            <span>A thoughtful new experience is in development</span>
          </p>

          <h1 className="mt-8 whitespace-normal text-[clamp(2rem,5vw,3.65rem)] font-black leading-[1.02] tracking-[-0.055em] text-[#123d2a] md:whitespace-nowrap">
            VietSage is taking shape.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-[#67736a] sm:text-lg">
            We&apos;re building something meaningful. Contact us at{" "}
            <a
              href="mailto:Congnghesovn247@gmail.com"
              className="font-semibold text-[#285e47] underline decoration-[#c69a45]/70 underline-offset-4 transition-colors hover:text-[#123d2a]"
            >
              Congnghesovn247@gmail.com
            </a>
            {"."}
          </p>
        </div>
      </section>

      <style>{`
        .launch-border {
          isolation: isolate;
        }

        .launch-border::before {
          position: absolute;
          inset: 0;
          z-index: 0;
          padding: 1px;
          border-radius: inherit;
          background: linear-gradient(
            115deg,
            rgba(18, 61, 42, 0.18),
            rgba(184, 135, 47, 0.58),
            rgba(57, 103, 78, 0.45),
            rgba(18, 61, 42, 0.18)
          );
          background-size: 280% 280%;
          content: "";
          animation: launch-border-flow 8s ease-in-out infinite;
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }

        @keyframes launch-border-flow {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .launch-border::before {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
