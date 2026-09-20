import type { ReactNode } from "react";

export default function OwnerGlobalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
