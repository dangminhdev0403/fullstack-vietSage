"use client";

import { RouteBoundaryState } from "../_components/route-boundary-state";

export default function HotelsError({ reset }: { reset: () => void }) {
  return (
    <RouteBoundaryState
      eyebrow="Hotel operations"
      title="Hotel operations could not load"
      message="Retry the page. If the issue continues, verify the selected hotel, staff permissions, and API availability."
      tone="hotel"
      action={{ label: "Try again", onClick: reset }}
    />
  );
}
