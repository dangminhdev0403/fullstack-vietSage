"use client";

import type { ReactNode } from "react";
import { m } from "motion/react";

import { guestMotionTokens } from "./guest-motion-tokens";

type GuestStaggerProps = {
  children: ReactNode;
  className?: string;
  interval?: number;
};

export function GuestStagger({
  children,
  className,
  interval = guestMotionTokens.stagger.standard,
}: GuestStaggerProps) {
  return (
    <m.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: Math.min(
              Math.max(interval, 0),
              guestMotionTokens.stagger.maximum,
            ),
          },
        },
      }}
    >
      {children}
    </m.div>
  );
}

export function GuestStaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: guestMotionTokens.distance.subtle },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: guestMotionTokens.duration.standard }}
    >
      {children}
    </m.div>
  );
}
