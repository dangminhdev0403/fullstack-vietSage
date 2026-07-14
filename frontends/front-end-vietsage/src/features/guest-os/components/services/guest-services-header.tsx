import Link from "next/link";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { GuestReveal } from "../motion/guest-reveal";

type GuestServicesHeaderProps = {
  roomLabel: string;
  title: string;
  subtitle?: string;
  requestsLabel: string;
};

export function GuestServicesHeader({ roomLabel, title, subtitle, requestsLabel }: GuestServicesHeaderProps) {
  return (
    <GuestReveal className="mb-10">
      <header className="relative overflow-hidden rounded-[28px] border border-[#25483f]/10 bg-[#fffdfa] p-6 shadow-[0_24px_70px_rgba(31,61,53,0.10)] md:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#25483f,#d7bd61,#25483f)]" />
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="mb-2 text-sm font-semibold text-[#8a6a13]">{roomLabel}</p>
            <h1 className="vs-display text-[32px] font-semibold leading-[1.15] text-[#18211d] md:text-[44px]">{title}</h1>
            {subtitle ? <p className="mt-3 text-base leading-7 text-[#5e6a62]">{subtitle}</p> : null}
          </div>
          <Link href="/g/requests" className="vs-touch-button inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#25483f] px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(37,72,63,0.18)] transition-colors duration-200 hover:bg-[#19382f] active:bg-[#122b24]">
            {requestsLabel}
            <VsIcon name="chevron_right" className="text-lg" />
          </Link>
        </div>
      </header>
    </GuestReveal>
  );
}
