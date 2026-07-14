"use client";

import Link from "next/link";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { GuestReveal } from "../motion/guest-reveal";

export function GuestHomeCta({ roomLabel, title, description, actionLabel }: { roomLabel: string; title: string; description: string; actionLabel: string }) {
  return (
    <section className="vs-container px-4 pb-32">
      <GuestReveal>
        <div className="rounded-lg bg-[#25483f] p-6 text-white shadow-[0_24px_58px_rgba(31,61,53,0.18)] md:flex md:items-center md:justify-between md:gap-8 md:p-8">
          <div><p className="text-sm font-semibold text-[#f4d36f]">{roomLabel}</p><h2 className="mt-2 text-3xl font-semibold leading-tight">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/76">{description}</p></div>
          <Link href="/g/services" className="vs-touch-button mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#f4d36f] px-7 text-sm font-bold text-[#18211d] transition-colors hover:bg-[#f7dc84] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:mt-0 md:w-auto">
            {actionLabel}<VsIcon name="arrow_forward" className="text-base" />
          </Link>
        </div>
      </GuestReveal>
    </section>
  );
}
