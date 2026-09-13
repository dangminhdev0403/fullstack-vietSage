import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  type CitizenshipKind,
  type KbttDeclarationStatus,
  type KbttGuestDeclaration,
  type KbttHotelConnection,
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

  async prepareStaySubmissionBatch(params: {
    hotelId: string;
    stayId: string;
    expectedOccupantIds: string[];
    declarations: Array<{
      id: string;
      expectedVersion: number;
      allowedStatuses: KbttDeclarationStatus[];
      submittedPayloadJson: Prisma.InputJsonValue;
      submittedPayloadFingerprint: string;
    }>;
  }): Promise<KbttGuestDeclaration[]> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const stay = await tx.guestStay.findFirst({
            where: {
              id: params.stayId,
              hotelId: params.hotelId,
              status: { in: ["ACTIVE", "CHECKED_IN"] },
            },
            select: { occupants: { select: { id: true } } },
          });
          const actualIds = (stay?.occupants ?? []).map((item) => item.id).sort();
          const expectedIds = [...params.expectedOccupantIds].sort();
          if (!stay || actualIds.join("\0") !== expectedIds.join("\0")) {
            throw new ConflictException({
              code: "DECLARATION_BATCH_CHANGED",
              message: "Danh sách khách trong phòng đã thay đổi. Vui lòng tải lại trước khi gửi.",
            });
          }

          for (const declaration of params.declarations) {
            const result = await tx.kbttGuestDeclaration.updateMany({
              where: {
                id: declaration.id,
                hotelId: params.hotelId,
                stayId: params.stayId,
                version: declaration.expectedVersion,
                status: { in: declaration.allowedStatuses },
              },
              data: {
                status: "SENDING",
                submittedPayloadJson: declaration.submittedPayloadJson,
                submittedPayloadFingerprint: declaration.submittedPayloadFingerprint,
                version: declaration.expectedVersion + 1,
              },
            });
            if (result.count !== 1) {
              throw new ConflictException({
                code: "DECLARATION_CONFLICT",
                message: "Một hồ sơ đã thay đổi. Không có dữ liệu nào được gửi.",
              });
            }
          }

          return tx.kbttGuestDeclaration.findMany({
            where: { id: { in: params.declarations.map((item) => item.id) } },
            orderBy: { occupantId: "asc" },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw kbttUnavailable();
    }
  }

  async finalizeSubmissionBatch(params: {
    hotelId: string;
    declarations: Array<{ id: string; expectedVersion: number }>;
    data: Prisma.KbttGuestDeclarationUpdateManyMutationInput;
  }): Promise<KbttGuestDeclaration[]> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        for (const declaration of params.declarations) {
          const result = await tx.kbttGuestDeclaration.updateMany({
            where: {
              id: declaration.id,
              hotelId: params.hotelId,
              version: declaration.expectedVersion,
              status: "SENDING",
            },
            data: { ...params.data, version: declaration.expectedVersion + 1 },
          });
          if (result.count !== 1) {
            throw new ConflictException({
              code: "DECLARATION_CONFLICT",
              message: "Không thể ghi nhận đồng bộ kết quả gửi khai báo.",
            });
          }
        }
        return tx.kbttGuestDeclaration.findMany({
          where: { id: { in: params.declarations.map((item) => item.id) } },
          orderBy: { occupantId: "asc" },
        });
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
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
    allowedStatuses: KbttDeclarationStatus[];
    data: Prisma.KbttGuestDeclarationUpdateManyMutationInput;
  }): Promise<KbttGuestDeclaration> {
    try {
      const { version: _, ...restData } = (params.data ?? {}) as any;
      const result = await this.prisma.kbttGuestDeclaration.updateMany({
        where: {
          id: params.id,
          hotelId: params.hotelId,
          version: params.expectedVersion,
          status: { in: params.allowedStatuses },
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
}
