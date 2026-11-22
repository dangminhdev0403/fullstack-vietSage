"use client";

import { useEffect } from "react";
import { RouteBoundaryState } from "../_components/route-boundary-state";

export default function OwnerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[OWNER_WORKSPACE_ERROR]", {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
    });
  }, [error]);

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
