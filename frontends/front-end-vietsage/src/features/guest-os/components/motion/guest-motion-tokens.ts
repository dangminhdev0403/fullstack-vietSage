export const guestMotionTokens = {
  duration: {
    fast: 0.15,
    standard: 0.22,
    deliberate: 0.3,
  },
  easing: [0.22, 1, 0.36, 1] as const,
  distance: {
    subtle: 8,
    standard: 16,
  },
  stagger: {
    fast: 0.04,
    standard: 0.06,
    maximum: 0.08,
  },
} as const;

export type GuestMotionDuration = keyof typeof guestMotionTokens.duration;
