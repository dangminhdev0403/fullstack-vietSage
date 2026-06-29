import { type ReactNode } from "react";

import { auth } from "@/auth";

import { AuthRefreshGate } from "../_components/auth-refresh-gate";
import { assertCanAccessOwner } from "./_components/owner-auth";
import { OwnerRequestRealtimeNotifier } from "./_components/owner-request-realtime-notifier";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  assertCanAccessOwner(session, "/owner/dashboard");

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      <OwnerRequestRealtimeNotifier accessToken={session.accessToken} />
      {children}
    </AuthRefreshGate>
  );
}
