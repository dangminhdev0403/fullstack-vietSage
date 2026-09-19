"use client";

import { RouteBoundaryState } from "../_components/route-boundary-state";

export default function HotelsError({ reset }: { reset: () => void }) {
  return (
    <RouteBoundaryState
      eyebrow="Hotel operations"
      title="Hotel operations could not load"
      message="The service is responding slowly. Try again in a moment."
      tone="hotel"
      action={{ label: "Try again", onClick: reset }}
    />
  );
}
