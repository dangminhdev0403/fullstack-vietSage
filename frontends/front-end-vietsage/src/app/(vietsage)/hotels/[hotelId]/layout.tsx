import { type ReactNode } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";

import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { buildWorkspaceNavigationForContext, getWorkspaceDefinition, resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";
import { WorkspaceProfileProvider } from "@/features/workspace/components/workspace-profile-context";
import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";

export default async function HotelOpsLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ hotelId: string }>;
}>) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
  
  const callbackUrl = `/hotels/${hotelId}/requests` as const;
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  if (!canUseHotelId(context, hotelId)) {
    notFound();
  }

  const persona = resolveWorkspacePersona(context.activeRole.code);
  if (!persona) {
    notFound();
  }

  const sidebarItems = buildWorkspaceNavigationForContext({
    ...context,
    hotelId,
  });

  return (
    <WorkspaceProfileProvider profileName={context.fullName}>
      <WorkspaceShell
        definition={getWorkspaceDefinition(persona)}
        navItems={sidebarItems}
        contextLabel={context.activeRole.name}
        profileName={context.fullName}
      >
        {children}
      </WorkspaceShell>
    </WorkspaceProfileProvider>
  );
}
