"use client";

import { useEffect, useRef } from "react";

import { toast } from "sonner";

type PermissionsWarningsAlertProps = {
  warnings: string[];
};

export function PermissionsWarningsAlert({ warnings }: PermissionsWarningsAlertProps) {
  const lastWarningsKeyRef = useRef<string>("");

  useEffect(() => {
    if (warnings.length === 0) {
      return;
    }

    const currentWarningsKey = warnings.join("\n");
    if (lastWarningsKeyRef.current === currentWarningsKey) {
      return;
    }

    lastWarningsKeyRef.current = currentWarningsKey;

    warnings.forEach((warning) => {
      toast.error("Canh bao API RBAC", {
        description: warning,
        duration: 7000,
      });
    });
  }, [warnings]);

  return null;
}

