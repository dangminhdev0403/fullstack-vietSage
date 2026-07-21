import { type ReactNode } from "react";
import { auth } from "@/auth";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";
import { WorkspaceProfileProvider } from "@/features/workspace/components/workspace-profile-context";
import { OwnerShell } from "../../../_components/owner-shell";

export default async function OwnerHotelLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ hotelId: string }>;
}>) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
  const callbackUrl = `/owner/hotels/${hotelId}` as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  const sidebarItems = buildWorkspaceNavigationForContext({ ...context, hotelId });

  return (
    <WorkspaceProfileProvider profileName={context.fullName}>
      <OwnerShell activePath={callbackUrl} navItems={sidebarItems} subtitle={context.activeRole.name}>
        {children}
      </OwnerShell>
    </WorkspaceProfileProvider>
  );
}
