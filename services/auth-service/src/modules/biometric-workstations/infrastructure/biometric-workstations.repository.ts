import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class BiometricWorkstationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPairing(input: {
    codeHash: string;
    hotelId: string;
    operatorId: string;
    expiresAt: Date;
  }) {
    await this.prisma.biometricWorkstationPairing.create({ data: input });
  }

  async consumePairing(codeHash: string, consumedAt: Date) {
    return this.prisma.$transaction(async (prisma) => {
      const pairing = await prisma.biometricWorkstationPairing.findFirst({
        where: { codeHash, consumedAt: null, expiresAt: { gt: consumedAt } },
        select: { id: true, hotelId: true },
      });
      if (!pairing) return null;
      const consumed = await prisma.biometricWorkstationPairing.updateMany({
        where: { id: pairing.id, consumedAt: null },
        data: { consumedAt },
      });
      return consumed.count === 1 ? { hotelId: pairing.hotelId } : null;
    });
  }

  async createWorkstation(input: {
    tokenHash: string;
    hotelId: string;
    lastSeenAt: Date;
    expiresAt: Date;
  }) {
    await this.prisma.biometricWorkstation.create({ data: input });
  }

  async authenticate(tokenHash: string, seenAt: Date, renewUntil: Date) {
    const authenticated = await this.prisma.biometricWorkstation.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: seenAt } },
      data: { lastSeenAt: seenAt, expiresAt: renewUntil },
    });
    if (authenticated.count !== 1) return null;
    return this.prisma.biometricWorkstation.findUnique({
      where: { tokenHash },
      select: { id: true, hotelId: true },
    });
  }

  async hasOnlineWorkstation(hotelId: string, cutoff: Date, at: Date) {
    return (
      (await this.prisma.biometricWorkstation.count({
        where: { hotelId, revokedAt: null, expiresAt: { gt: at }, lastSeenAt: { gte: cutoff } },
      })) > 0
    );
  }

  async revokeHotel(hotelId: string, revokedAt: Date) {
    const [workstations] = await this.prisma.$transaction([
      this.prisma.biometricWorkstation.updateMany({
        where: { hotelId, revokedAt: null },
        data: { revokedAt },
      }),
      this.prisma.biometricWorkstationPairing.deleteMany({ where: { hotelId, consumedAt: null } }),
    ]);
    return workstations.count;
  }
}
