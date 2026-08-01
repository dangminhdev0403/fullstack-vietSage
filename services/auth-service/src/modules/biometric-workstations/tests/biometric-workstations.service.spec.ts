import { UnauthorizedException } from "@nestjs/common";
import { BiometricWorkstationsService } from "../application/biometric-workstations.service";
import type { BiometricWorkstationsRepository } from "../infrastructure/biometric-workstations.repository";

describe("BiometricWorkstationsService", () => {
  let now: Date;
  let pairings: Map<string, { hotelId: string; operatorId: string; expiresAt: Date; consumedAt: Date | null }>;
  let workstations: Map<string, { hotelId: string; expiresAt: Date; revokedAt: Date | null; lastSeenAt: Date }>;
  let repository: jest.Mocked<BiometricWorkstationsRepository>;

  beforeEach(() => {
    now = new Date("2026-08-02T00:00:00.000Z");
    pairings = new Map();
    workstations = new Map();
    repository = {
      createPairing: jest.fn(async (input) => {
        pairings.set(input.codeHash, { ...input, consumedAt: null });
      }),
      consumePairing: jest.fn(async (codeHash, consumedAt) => {
        const pairing = pairings.get(codeHash);
        if (!pairing || pairing.consumedAt || consumedAt >= pairing.expiresAt) return null;
        pairing.consumedAt = consumedAt;
        return { hotelId: pairing.hotelId };
      }),
      createWorkstation: jest.fn(async (input) => {
        workstations.set(input.tokenHash, {
          hotelId: input.hotelId,
          expiresAt: input.expiresAt,
          revokedAt: null,
          lastSeenAt: input.lastSeenAt,
        });
      }),
      authenticate: jest.fn(async (tokenHash, seenAt) => {
        const workstation = workstations.get(tokenHash);
        if (!workstation || workstation.revokedAt || seenAt >= workstation.expiresAt) return null;
        workstation.lastSeenAt = seenAt;
        return { id: tokenHash, hotelId: workstation.hotelId };
      }),
      hasOnlineWorkstation: jest.fn(async (hotelId, cutoff, at) =>
        [...workstations.values()].some(
          (item) => item.hotelId === hotelId && !item.revokedAt && item.expiresAt > at && item.lastSeenAt >= cutoff,
        ),
      ),
      revokeHotel: jest.fn(async (hotelId, revokedAt) => {
        let count = 0;
        for (const item of workstations.values()) {
          if (item.hotelId === hotelId && !item.revokedAt) {
            item.revokedAt = revokedAt;
            count++;
          }
        }
        return count;
      }),
    } as unknown as jest.Mocked<BiometricWorkstationsRepository>;
  });

  it("keeps a paired workstation valid across service restarts and stores only hashes", async () => {
    const secrets = ["pairing-secret", "workstation-secret"];
    const first = new BiometricWorkstationsService(repository, () => now, () => secrets.shift()!);
    const pairing = await first.issuePairing("hotel-1", "operator-1");
    const workstation = await first.pair(pairing.code);

    const restarted = new BiometricWorkstationsService(repository, () => now, () => "unused");
    await expect(restarted.authenticate(workstation.token)).resolves.toEqual({
      id: expect.any(String),
      hotelId: "hotel-1",
    });

    expect(repository.createPairing.mock.calls[0]?.[0].codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.createPairing.mock.calls[0]?.[0].codeHash).not.toContain(pairing.code);
    expect(repository.createWorkstation.mock.calls[0]?.[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.createWorkstation.mock.calls[0]?.[0].tokenHash).not.toContain(workstation.token);
  });

  it("rejects unknown workstation credentials instead of reporting an empty command", async () => {
    const service = new BiometricWorkstationsService(repository, () => now, () => "unused");
    await expect(service.authenticate("unknown-token")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("revokes only the selected hotel", async () => {
    const secrets = ["pair-a", "token-a", "pair-b", "token-b"];
    const service = new BiometricWorkstationsService(repository, () => now, () => secrets.shift()!);
    const a = await service.pair((await service.issuePairing("hotel-a", "operator-a")).code);
    const b = await service.pair((await service.issuePairing("hotel-b", "operator-b")).code);

    await expect(service.disconnectHotel("hotel-a")).resolves.toBe(1);
    await expect(service.authenticate(a.token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authenticate(b.token)).resolves.toEqual({
      id: expect.any(String),
      hotelId: "hotel-b",
    });
  });
});
