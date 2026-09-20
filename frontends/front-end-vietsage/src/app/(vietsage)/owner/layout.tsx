import { type ReactNode } from "react";

import { auth } from "@/auth";

import { AuthRefreshGate } from "../_components/auth-refresh-gate";
import { OwnerRequestRealtimeNotifier } from "./_components/owner-request-realtime-notifier";
import { assertCanAccessOwner, requireOwnerServerTokens } from "./_components/owner-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import { WorkspaceProfileProvider } from "@/features/workspace/components/workspace-profile-context";
import { OwnerShell } from "./_components/owner-shell";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  assertCanAccessOwner(session, "/owner/dashboard");
  await requireOwnerServerTokens("/owner/dashboard");

  const context = await loadServerWorkspaceContext("/owner/dashboard");
  const defaultHotelId = context.accessibleHotels[0]?.id ?? null;
  const sidebarItems = buildWorkspaceNavigationForContext({
    ...context,
    hotelId: defaultHotelId,
  });

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      <OwnerRequestRealtimeNotifier />
      <WorkspaceProfileProvider profileName={context.fullName}>
        <OwnerShell navItems={sidebarItems} subtitle={context.activeRole.name}>
          {children}
        </OwnerShell>
      </WorkspaceProfileProvider>
    </AuthRefreshGate>
  );
}
