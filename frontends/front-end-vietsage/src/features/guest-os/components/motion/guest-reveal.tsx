"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
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

const subscribeToHydration = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function GuestReveal({
  children,
  className,
  delay = 0,
  distance = guestMotionTokens.distance.standard,
  duration = "standard",
}: GuestRevealProps) {
  const motionReady = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );

  return (
    <m.div
      className={className}
      initial={false}
      animate={motionReady ? "hidden" : "visible"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={{
        hidden: { opacity: 0, y: distance },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{
        delay: Math.max(0, Math.min(delay, 0.3)),
        duration: guestMotionTokens.duration[duration],
      }}
    >
      {children}
    </m.div>
  );
}
