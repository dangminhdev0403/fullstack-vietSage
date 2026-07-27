export function LaunchHold() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f8f4ec] px-5 py-10 text-[#123d2a] sm:px-8">
      <style>{`@keyframes vs-orbit{from{transform:rotate(0deg) translateX(7px) rotate(0deg)}to{transform:rotate(360deg) translateX(7px) rotate(-360deg)}}@keyframes vs-drift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(10px,-8px,0) scale(1.05)}}@media(prefers-reduced-motion:reduce){.vs-motion{animation:none!important}}`}</style>
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-[#d7e5d5]/60 blur-3xl" />
      <div aria-hidden="true" className="vs-motion pointer-events-none absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-[#f1d58a]/30 blur-3xl" style={{ animation: "vs-drift 9s ease-in-out infinite" }} />
      <section className="relative w-full max-w-3xl rounded-[2rem] border border-[#123d2a]/10 bg-white/65 px-6 py-12 text-center shadow-[0_24px_80px_rgba(18,61,42,0.09)] backdrop-blur sm:px-12 sm:py-16">
        <div className="relative mx-auto h-20 w-20 sm:h-24 sm:w-24">
          <span aria-hidden="true" className="vs-motion absolute inset-[-7px] rounded-[1.65rem] border border-[#d7bd61]/60 shadow-[0_0_24px_rgba(215,189,97,0.28)]" style={{ animation: "vs-orbit 8s linear infinite" }} />
          <img src="/brand/vietsage-icon.png" alt="VietSage logo" className="relative h-16 w-16 rounded-2xl object-cover shadow-md shadow-[#123d2a]/15 sm:h-20 sm:w-20" />
        </div>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.34em] text-[#b8872f] sm:text-sm">VietSage</p>
        <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-[#eef3ee] px-3.5 py-1.5 text-xs font-semibold text-[#315746]">
          <span className="size-1.5 rounded-full bg-[#b8872f]" />
          A new chapter is taking shape
        </div>
        <h1 className="mx-auto mt-7 whitespace-nowrap text-[clamp(1.8rem,7vw,5.25rem)] font-semibold leading-[0.98] tracking-[-0.065em]">VietSage is taking shape.</h1>
        <p className="mx-auto mt-7 max-w-lg text-base leading-7 text-[#627064] sm:text-lg">We’re building something meaningful. Contact us at <a className="font-semibold text-[#315746] underline decoration-[#b8872f] underline-offset-4" href="mailto:Congnghesovn247@gmail.com">Congnghesovn247@gmail.com</a>.</p>
      </section>
    </main>
  );
}
