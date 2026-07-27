export function LaunchHold() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f8f4ec] px-5 py-10 text-[#123d2a] sm:px-8">
      <style>{`@keyframes vs-border-flow{to{transform:rotate(1turn)}}@keyframes vs-drift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(10px,-8px,0) scale(1.05)}}@media(prefers-reduced-motion:reduce){.vs-motion{animation:none!important}}`}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-[#d7e5d5]/60 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="vs-motion pointer-events-none absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-[#f1d58a]/30 blur-3xl"
        style={{ animation: "vs-drift 9s ease-in-out infinite" }}
      />
      <section className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] p-px shadow-[0_24px_80px_rgba(18,61,42,0.09)]">
        <span
          aria-hidden="true"
          className="vs-motion absolute -inset-[55%] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_145deg,#d6e4d8_175deg,#b9cfbd_205deg,#d6e4d8_235deg,transparent_265deg,transparent_360deg)]"
          style={{ animation: "vs-border-flow 16s linear infinite" }}
        />
        <div className="relative rounded-[calc(2rem-1px)] bg-white/80 px-6 py-12 text-center backdrop-blur sm:px-12 sm:py-16">
          <div className="mx-auto h-16 w-16 sm:h-20 sm:w-20">
            <img
              src="/brand/vietsage-icon.png"
              alt="VietSage logo"
              className="h-full w-full rounded-2xl object-cover shadow-md shadow-[#123d2a]/15"
            />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.34em] text-[#b8872f] sm:text-sm">
            VietSage
          </p>
          <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-[#eef3ee] px-3.5 py-1.5 text-xs font-semibold text-[#315746]">
            <span className="size-1.5 rounded-full bg-[#b8872f]" />A new chapter
            is taking shape
          </div>
          <h1 className="mx-auto mt-7 whitespace-nowrap text-[clamp(1.7rem,4.8vw,3.9rem)] font-semibold leading-none tracking-[-0.055em]">
            VietSage is taking shape.
          </h1>
          <p className="mx-auto mt-7 max-w-lg text-base leading-7 text-[#627064] sm:text-lg">
            We’re building something meaningful. Contact us at :{" "}
            <a
              className="font-semibold text-[#315746] underline decoration-[#b8872f] underline-offset-4"
              href="mailto:Congnghesovn247@gmail.com"
            >
              Congnghesovn247@gmail.com
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
