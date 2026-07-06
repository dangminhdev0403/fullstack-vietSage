"use client";

import { RouteBoundaryState } from "../_components/route-boundary-state";

export default function OwnerError({ reset }: { reset: () => void }) {
  return (
    <RouteBoundaryState
      eyebrow="Owner"
      title="Owner workspace could not load"
      message="Retry the page. If the issue continues, verify hotel access, session freshness, and API availability."
      tone="owner"
      action={{ label: "Try again", onClick: reset }}
    />
  );
}
