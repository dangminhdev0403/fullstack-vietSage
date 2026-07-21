"use client";

import { ContentErrorState } from "../_components/route-boundary-state";

export default function StaffError({ reset }: { reset: () => void }) {
  return (
    <ContentErrorState
      eyebrow="Staff"
      title="Staff workspace could not load"
      message="Retry the page. If the issue continues, verify the staff account still has hotel access and the API is reachable."
      tone="staff"
      action={{ label: "Try again", onClick: reset }}
    />
  );
}
