"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      theme="light"
      closeButton
      expand={false}
      visibleToasts={4}
      duration={2200}
      toastOptions={{
        className: "!font-sans !rounded-2xl text-sm",
        duration: 2200,
      }}
    />
  );
}
