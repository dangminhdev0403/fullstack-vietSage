"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      expand={false}
      visibleToasts={4}
      toastOptions={{
        className: "!font-sans !rounded-2xl text-sm",
      }}
    />
  );
}
