import type { ReactNode } from "react";

import { GuestMotionProvider } from "@/features/guest-os/components/motion/guest-motion-provider";
import { GuestPageTransition } from "@/features/guest-os/components/motion/guest-page-transition";

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <GuestMotionProvider>
      <GuestPageTransition>{children}</GuestPageTransition>
    </GuestMotionProvider>
  );
}
