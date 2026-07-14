"use client";

import type { ReactNode } from "react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

import { guestMotionTokens } from "./guest-motion-tokens";

export function GuestMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{
          duration: guestMotionTokens.duration.standard,
          ease: guestMotionTokens.easing,
        }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
