"use client";

import type { ReactNode } from "react";
import { m } from "motion/react";

import { guestMotionTokens } from "../motion/guest-motion-tokens";

type GuestStateCardProps = {
  title: string;
  message: string;
  icon: ReactNode;
  action?: ReactNode;
  live?: "polite" | "assertive";
};

export function GuestStateCard({ title, message, icon, action, live }: GuestStateCardProps) {
  return (
    <main className="vs-guest-readable grid min-h-screen place-items-center overflow-hidden bg-[#f8f4ea] px-5 py-20 text-center text-[#18211d]">
      <m.section
        initial={{ opacity: 0, y: guestMotionTokens.distance.standard }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -guestMotionTokens.distance.subtle }}
        transition={{ duration: guestMotionTokens.duration.deliberate }}
        className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-[#25483f]/10 bg-[#fffdfa] p-8 shadow-[0_24px_70px_rgba(31,61,53,0.14)]"
        aria-live={live}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#25483f,#d7bd61,#25483f)]" />
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[#25483f] text-[#f4d36f] shadow-[0_12px_28px_rgba(31,61,53,0.18)]">
          {icon}
        </div>
        <h1 className="vs-display text-3xl font-semibold text-[#18211d]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#5e6a62]">{message}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </m.section>
    </main>
  );
}

