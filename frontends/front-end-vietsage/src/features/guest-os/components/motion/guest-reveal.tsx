"use client";

import type { ReactNode } from "react";
import { m } from "motion/react";

import {
  guestMotionTokens,
  type GuestMotionDuration,
} from "./guest-motion-tokens";

type GuestRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  duration?: GuestMotionDuration;
};

export function GuestReveal({
  children,
  className,
  delay = 0,
  distance = guestMotionTokens.distance.standard,
  duration = "standard",
}: GuestRevealProps) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.05 }}
      transition={{
        delay: Math.max(0, Math.min(delay, 0.3)),
        duration: guestMotionTokens.duration[duration],
      }}
    >
      {children}
    </m.div>
  );
}
