"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "motion/react";

import { guestMotionTokens } from "./guest-motion-tokens";

export function GuestPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence initial={false} mode="wait">
      <m.div
        key={pathname}
        initial={{ opacity: 0, y: guestMotionTokens.distance.subtle }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -guestMotionTokens.distance.subtle }}
        transition={{ duration: guestMotionTokens.duration.standard }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
