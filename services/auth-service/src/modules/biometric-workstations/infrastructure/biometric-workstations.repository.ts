import { Injectable } from "@nestjs/common";
import { HotelFeatureStatus, Prisma } from "@prisma/client";
import { FRONTDESK_HN2N_CCCD_SCANNER } from "../../../common/config/hotel-features.registry";
import { PrismaService } from "../../../prisma/prisma.service";

const enabledScannerFeature = {
  some: {
    featureKey: FRONTDESK_HN2N_CCCD_SCANNER,
    status: HotelFeatureStatus.ENABLED,
  },
} as const;

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

  async consumePairing(input: {
    codeHash: string;
    consumedAt: Date;
    workstationTokenHash: string;
    workstationExpiresAt: Date;
  }) {
    const { codeHash, consumedAt, workstationTokenHash, workstationExpiresAt } = input;

    try {
      return await this.prisma.$transaction(
        async (prisma) => {
          const pairing = await prisma.biometricWorkstationPairing.findFirst({
            where: {
              codeHash,
              consumedAt: null,
              expiresAt: { gt: consumedAt },
              hotel: { featureEntitlements: enabledScannerFeature },
            },
            select: { id: true, hotelId: true },
          });
          if (!pairing) return null;

          const consumed = await prisma.biometricWorkstationPairing.updateMany({
            where: {
              id: pairing.id,
              consumedAt: null,
              hotel: { featureEntitlements: enabledScannerFeature },
            },
            data: { consumedAt },
          });
          if (consumed.count !== 1) return null;

          await prisma.biometricWorkstation.create({
            data: {
              tokenHash: workstationTokenHash,
              hotelId: pairing.hotelId,
              lastSeenAt: consumedAt,
              expiresAt: workstationExpiresAt,
            },
          });
          return { hotelId: pairing.hotelId };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        return null;
      }
      throw error;
    }
  }

  async authenticate(tokenHash: string, seenAt: Date, renewUntil: Date) {
    return this.prisma.$transaction(async (prisma) => {
      const workstation = await prisma.biometricWorkstation.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: seenAt },
          hotel: { featureEntitlements: enabledScannerFeature },
        },
        select: { id: true, hotelId: true },
      });
      if (!workstation) return null;

      const authenticated = await prisma.biometricWorkstation.updateMany({
        where: {
          id: workstation.id,
          revokedAt: null,
          expiresAt: { gt: seenAt },
          hotel: { featureEntitlements: enabledScannerFeature },
        },
        data: { lastSeenAt: seenAt, expiresAt: renewUntil },
      });
      return authenticated.count === 1 ? workstation : null;
    });
  }

  async hasOnlineWorkstation(hotelId: string, cutoff: Date, at: Date) {
    return (
      (await this.prisma.biometricWorkstation.count({
        where: {
          hotelId,
          revokedAt: null,
          expiresAt: { gt: at },
          lastSeenAt: { gte: cutoff },
          hotel: { featureEntitlements: enabledScannerFeature },
        },
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
