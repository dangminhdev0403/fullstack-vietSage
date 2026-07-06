"use client";

import { RouteBoundaryState } from "../_components/route-boundary-state";

export default function GuestError({ reset }: { reset: () => void }) {
  return (
    <RouteBoundaryState
      eyebrow="Guest"
      title="Guest experience could not load"
      message="Retry the page. If the issue continues, scan the room QR again or ask staff to check the guest session."
      tone="guest"
      action={{ label: "Try again", onClick: reset }}
    />
  );
}
