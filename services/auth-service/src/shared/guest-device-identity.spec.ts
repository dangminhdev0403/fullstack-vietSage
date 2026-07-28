import {
  countDistinctGuestDevices,
  countDistinctGuestDevicesByStay,
} from "./guest-device-identity";

describe("guest device identity", () => {
  const session = {
    id: "session-1",
    deviceFingerprintHash: null,
    ipHash: null,
    userAgent: null,
  };

  it("deduplicates sessions with the same browser fingerprint", () => {
    expect(
      countDistinctGuestDevices([
        { ...session, id: "session-1", deviceFingerprintHash: "device-a" },
        { ...session, id: "session-2", deviceFingerprintHash: "device-a" },
        { ...session, id: "session-3", deviceFingerprintHash: "device-b" },
      ]),
    ).toBe(2);
  });

  it("keeps fallback identities isolated per stay", () => {
    const counts = countDistinctGuestDevicesByStay([
      { ...session, id: "session-1", stayId: "stay-1", ipHash: "ip", userAgent: "browser" },
      { ...session, id: "session-2", stayId: "stay-1", ipHash: "ip", userAgent: "browser" },
      { ...session, id: "session-3", stayId: "stay-2", ipHash: "ip", userAgent: "browser" },
    ]);

    expect(counts.get("stay-1")).toBe(1);
    expect(counts.get("stay-2")).toBe(1);
  });
});
