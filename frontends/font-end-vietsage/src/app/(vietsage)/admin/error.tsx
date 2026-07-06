"use client";

import { RouteBoundaryState } from "../_components/route-boundary-state";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <RouteBoundaryState
      eyebrow="Admin"
      title="Admin workspace could not load"
      message="Retry the page. If the issue continues, verify the API is reachable and the signed-in user still has admin access."
      tone="admin"
      action={{ label: "Try again", onClick: reset }}
    />
  );
}
