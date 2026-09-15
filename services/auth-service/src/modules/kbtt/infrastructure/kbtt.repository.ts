import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  type CitizenshipKind,
  type KbttDeclarationStatus,
  type KbttGuestDeclaration,
  type KbttHotelConnection,
  type KbttAutoSubmitRun,
  type KbttAutoSubmitRunStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import type { KbttCatalogKind } from "../domain/schemas/kbtt.schema";
import { kbttUnavailable } from "./kbtt.config";

@Injectable()
export class KbttRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(hotelId: string) {
    try {
      return await this.prisma.kbttHotelConnection.findUnique({ where: { hotelId } });
    } catch {
      throw kbttUnavailable();
    }
  }

  async save(connection: KbttHotelConnection) {
    try {
      return await this.prisma.kbttHotelConnection.upsert({
        where: { hotelId: connection.hotelId },
        create: connection,
        update: connection,
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async update(
    connection: KbttHotelConnection,
    data: Partial<
      Omit<KbttHotelConnection, "hotelId" | "ciphertext" | "iv" | "authTag" | "keyVersion">
    >,
  ) {
    try {
      const result = await this.prisma.kbttHotelConnection.updateMany({
        where: { hotelId: connection.hotelId, ciphertext: connection.ciphertext },
        data,
      });
      if (result.count !== 1) throw kbttUnavailable();
      return { ...connection, ...data };
    } catch {
      throw kbttUnavailable();
    }
  }

  async remove(hotelId: string) {
    try {
      await this.prisma.kbttHotelConnection.deleteMany({ where: { hotelId } });
    } catch {
      throw kbttUnavailable();
    }
  }

  async findDeclarationsByHotel(
    hotelId: string,
    occupantIds?: string[],
  ): Promise<KbttGuestDeclaration[]> {
    if (occupantIds && occupantIds.length === 0) {
      return [];
    }
    try {
      return await this.prisma.kbttGuestDeclaration.findMany({
        where: {
          hotelId,
          ...(occupantIds ? { occupantId: { in: occupantIds } } : {}),
        },
        orderBy: [{ occupantId: "asc" }, { revision: "desc" }, { createdAt: "desc" }],
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async findLatestDeclaration(
    hotelId: string,
    occupantId: string,
  ): Promise<KbttGuestDeclaration | null> {
    try {
      return await this.prisma.kbttGuestDeclaration.findFirst({
        where: { hotelId, occupantId },
        orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async findOccupant(hotelId: string, occupantId: string) {
    try {
      return await this.prisma.guestStayOccupant.findFirst({
        where: { id: occupantId, hotelId },
        include: {
          stay: {
            include: {
              room: true,
            },
          },
        },
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async findActiveSubmittedOccupantByIdentity(
    hotelId: string,
    identityNumber: string,
    excludeOccupantId: string,
  ) {
    try {
      return await this.prisma.guestStayOccupant.findFirst({
        where: {
          hotelId,
          identityNumber,
          id: { not: excludeOccupantId },
          stay: {
            status: { in: ["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"] },
            checkedOutAt: null,
          },
          kbttGuestDeclarations: { some: { status: "SUBMITTED" } },
        },
        select: {
          stay: { select: { room: { select: { roomNumber: true } } } },
        },
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async createDeclaration(data: {
    hotelId: string;
    stayId: string;
    occupantId: string;
    declarationKind: CitizenshipKind;
    revision?: number;
    status?: KbttDeclarationStatus;
    draftPayloadJson: Prisma.InputJsonValue;
  }): Promise<KbttGuestDeclaration> {
    try {
      return await this.prisma.kbttGuestDeclaration.create({
        data: {
          hotelId: data.hotelId,
          stayId: data.stayId,
          occupantId: data.occupantId,
          declarationKind: data.declarationKind,
          revision: data.revision ?? 1,
          status: data.status ?? "DRAFT",
          draftPayloadJson: data.draftPayloadJson,
          version: 1,
        },
      });
    } catch (error: any) {
      if (
        error instanceof ConflictException ||
        error?.code === "P2002" ||
        error?.message?.includes("Unique constraint")
      ) {
        throw new ConflictException({
          code: "DECLARATION_CONFLICT",
          message: "Hồ sơ khai báo đã tồn tại hoặc đang có thao tác tạo đồng thời.",
        });
      }
      throw kbttUnavailable();
    }
  }

  async updateDeclaration(params: {
    id: string;
    hotelId: string;
    expectedVersion: number;
    data: Prisma.KbttGuestDeclarationUpdateManyMutationInput;
  }): Promise<KbttGuestDeclaration> {
    try {
      const { version: _, ...restData } = (params.data ?? {}) as any;
      const result = await this.prisma.kbttGuestDeclaration.updateMany({
        where: {
          id: params.id,
          hotelId: params.hotelId,
          version: params.expectedVersion,
        },
        data: {
          ...restData,
          version: params.expectedVersion + 1,
        },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: "DECLARATION_CONFLICT",
          message: "Xung đột phiên bản hoặc trạng thái hồ sơ khai báo (CAS conflict).",
        });
      }
      const updated = await this.prisma.kbttGuestDeclaration.findFirst({
        where: { id: params.id, hotelId: params.hotelId },
      });
      if (!updated) {
        throw new NotFoundException("Hồ sơ khai báo không tồn tại.");
      }
      return updated;
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) {
        throw error;
      }
      throw kbttUnavailable();
    }
  }

  async updateOccupantCitizenship(
    occupantId: string,
    hotelId: string,
    citizenshipKind: CitizenshipKind,
  ): Promise<void> {
    try {
      await this.prisma.guestStayOccupant.updateMany({
        where: { id: occupantId, hotelId },
        data: { citizenshipKind },
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async listCatalogItems(params: {
    kind: KbttCatalogKind;
    parentCodeNormalized?: string;
    includeInactive?: boolean;
    limit?: number;
  }) {
    try {
      const where: any = {
        kind: params.kind,
      };
      if (params.parentCodeNormalized !== undefined) {
        where.parentCodeNormalized = params.parentCodeNormalized;
      }
      if (!params.includeInactive) {
        where.isActive = true;
      }
      const limit = Math.min(1000, Math.max(1, params.limit ?? 500));
      return await (this.prisma as any).kbttCatalogItem.findMany({
        where,
        take: limit,
        orderBy: [{ nameVi: "asc" }, { code: "asc" }],
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async syncCatalogItems(
    kind: KbttCatalogKind,
    parentCodeNormalized: string,
    candidateItems: Array<{
      code: string;
      nameVi: string;
      nameEn: string | null;
      parentCodeNormalized: string;
    }>,
  ) {
    try {
      const now = new Date();
      const candidateCodes = candidateItems.map((i) => i.code);
      return await this.prisma.$transaction(async (tx) => {
        const client = (tx as any).kbttCatalogItem ?? (this.prisma as any).kbttCatalogItem;
        for (const item of candidateItems) {
          await client.upsert({
            where: {
              kind_code_parentCodeNormalized: {
                kind,
                code: item.code,
                parentCodeNormalized: item.parentCodeNormalized,
              },
            },
            create: {
              kind,
              code: item.code,
              parentCodeNormalized: item.parentCodeNormalized,
              nameVi: item.nameVi,
              nameEn: item.nameEn,
              isActive: true,
              fetchedAt: now,
            },
            update: {
              nameVi: item.nameVi,
              nameEn: item.nameEn,
              isActive: true,
              fetchedAt: now,
            },
          });
        }
        await client.updateMany({
          where: {
            kind,
            parentCodeNormalized,
            code: { notIn: candidateCodes },
            isActive: true,
          },
          data: {
            isActive: false,
            fetchedAt: now,
          },
        });
        return {
          kind,
          parentCodeNormalized,
          total: candidateItems.length,
          syncedAt: now,
        };
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async findDueHotelsForAutoSubmit(currentHHmm: string) {
    try {
      return await this.prisma.kbttHotelConnection.findMany({
        where: {
          autoSubmitEnabled: true,
          autoSubmitTime: currentHHmm,
        },
        select: {
          hotelId: true,
          autoSubmitTime: true,
          hotel: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async claimAutoSubmitRunLease(
    hotelId: string,
    scheduledForDate: Date,
    leaseTimeoutMinutes = 10,
  ): Promise<KbttAutoSubmitRun | null> {
    try {
      const existing = await this.prisma.kbttAutoSubmitRun.findUnique({
        where: {
          hotelId_scheduledFor: {
            hotelId,
            scheduledFor: scheduledForDate,
          },
        },
      });

      if (existing) {
        if (existing.status !== "RUNNING") {
          return null;
        }
        const leaseThreshold = new Date(Date.now() - leaseTimeoutMinutes * 60 * 1000);
        if (existing.startedAt > leaseThreshold) {
          return null;
        }
        return await this.prisma.kbttAutoSubmitRun.update({
          where: { id: existing.id },
          data: {
            startedAt: new Date(),
            errorMessage: "Lease reclaimed after timeout",
          },
        });
      }

      return await this.prisma.kbttAutoSubmitRun.create({
        data: {
          hotelId,
          scheduledFor: scheduledForDate,
          status: "RUNNING",
          startedAt: new Date(),
        },
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return null;
      }
      throw kbttUnavailable();
    }
  }

  async finalizeAutoSubmitRun(
    runId: string,
    data: {
      status: KbttAutoSubmitRunStatus;
      totalEligible: number;
      successCount: number;
      failureCount: number;
      unknownCount: number;
      errorMessage?: string | null;
    },
  ): Promise<KbttAutoSubmitRun> {
    try {
      return await this.prisma.kbttAutoSubmitRun.update({
        where: { id: runId },
        data: {
          status: data.status,
          totalEligible: data.totalEligible,
          successCount: data.successCount,
          failureCount: data.failureCount,
          unknownCount: data.unknownCount,
          errorMessage: data.errorMessage ?? null,
          finishedAt: new Date(),
        },
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async getAutoSubmitRunHistory(hotelId: string, limit = 20): Promise<KbttAutoSubmitRun[]> {
    try {
      return await this.prisma.kbttAutoSubmitRun.findMany({
        where: { hotelId },
        orderBy: { scheduledFor: "desc" },
        take: Math.min(100, Math.max(1, limit)),
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async findReadyDeclarationsForHotel(hotelId: string): Promise<KbttGuestDeclaration[]> {
    try {
      return await this.prisma.kbttGuestDeclaration.findMany({
        where: {
          hotelId,
          status: "READY",
        },
        orderBy: { createdAt: "asc" },
      });
    } catch {
      throw kbttUnavailable();
    }
  }
}

