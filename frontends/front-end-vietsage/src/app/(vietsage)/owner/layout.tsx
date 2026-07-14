import { type ReactNode } from "react";

import { auth } from "@/auth";

import { AuthRefreshGate } from "../_components/auth-refresh-gate";
import { OwnerRequestRealtimeNotifier } from "./_components/owner-request-realtime-notifier";
import { assertCanAccessOwner, requireOwnerServerTokens } from "./_components/owner-auth";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  assertCanAccessOwner(session, "/owner/dashboard");
  await requireOwnerServerTokens("/owner/dashboard");

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      <OwnerRequestRealtimeNotifier />
      {children}
    </AuthRefreshGate>
  );
}
