import type { ReactNode } from "react";

import { GuestMotionProvider } from "@/features/guest-os/components/motion/guest-motion-provider";
import { GuestPageTransition } from "@/features/guest-os/components/motion/guest-page-transition";
import { GuestSessionBootstrap } from "@/features/guest-os/components/guest-session-bootstrap";
import { GuestRequestRealtimeNotifier } from "@/features/request-realtime/guest-request-realtime-notifier";

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <GuestMotionProvider>
      <GuestSessionBootstrap>
        <GuestRequestRealtimeNotifier />
        <GuestPageTransition>{children}</GuestPageTransition>
      </GuestSessionBootstrap>
    </GuestMotionProvider>
  );
}
