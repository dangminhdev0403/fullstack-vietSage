export type GuestDeviceIdentity = Readonly<{
  id: string;
  deviceFingerprintHash: string | null;
  ipHash: string | null;
  userAgent: string | null;
}>;

export function getGuestDeviceIdentityKey(session: GuestDeviceIdentity): string {
  if (session.deviceFingerprintHash) {
    return `fingerprint:${session.deviceFingerprintHash}`;
  }

  if (session.ipHash && session.userAgent) {
    return `network:${session.ipHash}:${session.userAgent}`;
  }

  return `session:${session.id}`;
}

export function countDistinctGuestDevices(sessions: readonly GuestDeviceIdentity[]): number {
  return new Set(sessions.map(getGuestDeviceIdentityKey)).size;
}

export function countDistinctGuestDevicesByStay(
  sessions: readonly (GuestDeviceIdentity & Readonly<{ stayId: string }>)[],
): ReadonlyMap<string, number> {
  const deviceKeysByStay = new Map<string, Set<string>>();

  for (const session of sessions) {
    const deviceKeys = deviceKeysByStay.get(session.stayId) ?? new Set<string>();
    deviceKeys.add(getGuestDeviceIdentityKey(session));
    deviceKeysByStay.set(session.stayId, deviceKeys);
  }

  return new Map([...deviceKeysByStay].map(([stayId, deviceKeys]) => [stayId, deviceKeys.size]));
}
