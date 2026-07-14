import { GuestReveal } from "../motion/guest-reveal";

export function GuestRequestHero({ roomLabel, title, subtitle }: { roomLabel: string; title: string; subtitle: string }) {
  return (
    <GuestReveal className="mb-10">
      <section className="overflow-hidden rounded-[28px] bg-[#25483f] p-6 text-white shadow-[0_22px_54px_rgba(31,61,53,0.18)] md:p-8">
        <p className="mb-2 text-sm font-semibold text-[#f4d36f]">{roomLabel}</p>
        <h1 className="vs-display mb-2 text-[30px] font-semibold leading-[1.15] md:text-[42px]">{title}</h1>
        <p className="max-w-2xl text-base leading-7 text-white/80">{subtitle}</p>
      </section>
    </GuestReveal>
  );
}
