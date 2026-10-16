import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

export type ChannexMappingBlocker =
  | "PROPERTY_MAPPING_MISSING"
  | "ROOM_TYPE_MAPPING_MISSING"
  | "RATE_PLAN_MAPPING_MISSING"
  | "MAPPING_CONFLICT";

export interface BlockedRoomTypeTarget {
  roomType: string;
  blockers: ChannexMappingBlocker[];
}

export interface RoomTypeMappingReadiness {
  roomType: string;
  roomTypeId?: string;
  channexRoomTypeId?: string;
  channexRatePlanId?: string;
  blockers: ChannexMappingBlocker[];
  isReady: boolean;
}

export interface HotelMappingReadinessResult {
  hotelId: string;
  propertyChannexId?: string;
  propertyReady: boolean;
  propertyBlockers: ChannexMappingBlocker[];
  roomTypes: RoomTypeMappingReadiness[];
  allReady: boolean;
}

export function normalizeRoomTypeName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

@Injectable()
export class ChannexMappingReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveReadiness(
    hotelId: string,
    targetRoomTypes?: string[],
    options?: {
      ratePlanCode?: string;
    },
  ): Promise<HotelMappingReadinessResult> {
    const [allMappings, catalog, rooms] = await Promise.all([
      this.prisma.channexMapping.findMany({
        where: { hotelId },
      }),
      this.prisma.roomType.findMany({
        where: { hotelId },
        select: { id: true, name: true, normalizedKey: true, basePrice: true },
      }),
      this.prisma.room.findMany({
        where: { hotelId },
        select: { id: true, type: true, roomTypeId: true },
      }),
    ]);

    // 1. Resolve Property Mapping
    let propertyMappings = allMappings.filter((m) => m.kind === "property");
    if (propertyMappings.length === 0) {
      const uniqueProp = await this.prisma.channexMapping.findUnique({
        where: {
          hotelId_kind_localId: {
            hotelId,
            kind: "property",
            localId: hotelId,
          },
        },
      });
      if (uniqueProp) {
        propertyMappings = [uniqueProp];
      }
    }

    const propertyRemoteIds = Array.from(new Set(propertyMappings.map((m) => m.channexId)));
    const propertyBlockers: ChannexMappingBlocker[] = [];
    let propertyChannexId: string | undefined;

    if (propertyRemoteIds.length === 0) {
      propertyBlockers.push("PROPERTY_MAPPING_MISSING");
    } else if (propertyRemoteIds.length > 1) {
      propertyBlockers.push("MAPPING_CONFLICT");
    } else {
      propertyChannexId = propertyRemoteIds[0];
    }
    const propertyReady = propertyBlockers.length === 0 && Boolean(propertyChannexId);

    // 2. Determine target room types to resolve
    let targets: string[];
    if (targetRoomTypes && targetRoomTypes.length > 0) {
      targets = Array.from(new Set(targetRoomTypes.map((t) => t.trim()).filter(Boolean)));
    } else {
      const fromCatalog = catalog.map((c) => c.name.trim());
      const fromRooms = rooms.map((r) => r.type?.trim()).filter((t): t is string => Boolean(t));
      targets = Array.from(new Set([...fromCatalog, ...fromRooms]));
    }

    const rateCode = options?.ratePlanCode || "STANDARD";
    const roomTypeResults: RoomTypeMappingReadiness[] = [];

    for (const target of targets) {
      const targetNorm = normalizeRoomTypeName(target);

      // Prefer RoomType.id match, then normalized name from catalog or rooms
      const matchedById = catalog.find((c) => c.id === target);
      const matchedByNorm = catalog.find(
        (c) =>
          (c.normalizedKey && c.normalizedKey === targetNorm) ||
          normalizeRoomTypeName(c.name) === targetNorm,
      );
      const matchedInRooms = rooms.find(
        (r) => r.type && (normalizeRoomTypeName(r.type) === targetNorm || r.type === target),
      );

      const roomTypeEntity = matchedById ?? matchedByNorm;
      const resolvedRoomTypeId =
        roomTypeEntity?.id ?? matchedInRooms?.roomTypeId ?? (matchedById ? target : undefined);
      const canonicalNorm =
        roomTypeEntity?.normalizedKey ||
        (roomTypeEntity ? normalizeRoomTypeName(roomTypeEntity.name) : targetNorm);

      // Resolve ID and legacy-name aliases together so disagreement fails closed.
      const rtCandidates = allMappings.filter(
        (m) =>
          m.kind === "room_type" &&
          ((resolvedRoomTypeId !== undefined && m.localId === resolvedRoomTypeId) ||
            normalizeRoomTypeName(m.localId) === canonicalNorm ||
            normalizeRoomTypeName(m.localId) === targetNorm),
      );

      const rtRemoteIds = Array.from(new Set(rtCandidates.map((m) => m.channexId)));
      let rtMissing = false;
      let rtConflict = false;
      let channexRoomTypeId: string | undefined;

      if (rtRemoteIds.length === 0) {
        rtMissing = true;
      } else if (rtRemoteIds.length > 1) {
        rtConflict = true;
      } else {
        channexRoomTypeId = rtRemoteIds[0];
      }

      const rpCandidates = allMappings.filter((m) => {
        if (m.kind !== "rate_plan") return false;
        const localId = m.localId;
        const matchesRateCode =
          localId.endsWith(`:${rateCode}`) ||
          (rateCode !== "STANDARD" && localId.endsWith(":STANDARD"));
        if (!matchesRateCode) return false;

        const separatorIdx = localId.lastIndexOf(":");
        const prefix = separatorIdx > 0 ? localId.slice(0, separatorIdx) : localId;
        const prefixNorm = normalizeRoomTypeName(prefix);
        return (
          (resolvedRoomTypeId !== undefined && prefix === resolvedRoomTypeId) ||
          prefixNorm === canonicalNorm ||
          prefixNorm === targetNorm
        );
      });

      const rpRemoteIds = Array.from(new Set(rpCandidates.map((m) => m.channexId)));
      let rpMissing = false;
      let rpConflict = false;
      let channexRatePlanId: string | undefined;

      if (rpRemoteIds.length > 1) {
        rpConflict = true;
      } else if (rpRemoteIds.length === 1) {
        channexRatePlanId = rpRemoteIds[0];
      } else {
        rpMissing = true;
      }

      // Aggregate blockers strictly using allowed blockers only
      const blockers: ChannexMappingBlocker[] = [];

      if (propertyBlockers.includes("PROPERTY_MAPPING_MISSING")) {
        blockers.push("PROPERTY_MAPPING_MISSING");
      }
      if (rtMissing) {
        blockers.push("ROOM_TYPE_MAPPING_MISSING");
      }
      if (rpMissing) {
        blockers.push("RATE_PLAN_MAPPING_MISSING");
      }
      if (propertyBlockers.includes("MAPPING_CONFLICT") || rtConflict || rpConflict) {
        blockers.push("MAPPING_CONFLICT");
      }

      const isReady = blockers.length === 0;

      roomTypeResults.push({
        roomType: target,
        roomTypeId: resolvedRoomTypeId,
        channexRoomTypeId: isReady || channexRoomTypeId ? channexRoomTypeId : undefined,
        channexRatePlanId: isReady || channexRatePlanId ? channexRatePlanId : undefined,
        blockers,
        isReady,
      });
    }

    // Fail closed if conflicting remote IDs are found across distinct room types
    const remoteIdToTypes = new Map<string, string[]>();
    for (const rt of roomTypeResults) {
      if (rt.channexRoomTypeId) {
        const list = remoteIdToTypes.get(rt.channexRoomTypeId) ?? [];
        list.push(rt.roomType);
        remoteIdToTypes.set(rt.channexRoomTypeId, list);
      }
    }
    for (const rt of roomTypeResults) {
      if (rt.channexRoomTypeId) {
        const collisions = remoteIdToTypes.get(rt.channexRoomTypeId);
        if (collisions && collisions.length > 1) {
          if (!rt.blockers.includes("MAPPING_CONFLICT")) {
            rt.blockers.push("MAPPING_CONFLICT");
            rt.isReady = false;
            rt.channexRoomTypeId = undefined;
            rt.channexRatePlanId = undefined;
          }
        }
      }
    }

    const allReady = propertyReady && roomTypeResults.every((r) => r.isReady);

    return {
      hotelId,
      propertyChannexId,
      propertyReady,
      propertyBlockers,
      roomTypes: roomTypeResults,
      allReady,
    };
  }

  async assertReady(
    hotelId: string,
    targetRoomTypes: string[],
    options?: {
      ratePlanCode?: string;
    },
  ): Promise<HotelMappingReadinessResult> {
    const result = await this.resolveReadiness(hotelId, targetRoomTypes, options);

    const blockedTargets = result.roomTypes.filter((r) => r.blockers.length > 0);
    if (!result.propertyReady || blockedTargets.length > 0) {
      const allBlocked: BlockedRoomTypeTarget[] =
        blockedTargets.length > 0
          ? blockedTargets.map((b) => ({
              roomType: b.roomType,
              blockers: b.blockers,
            }))
          : targetRoomTypes.map((t) => ({
              roomType: t,
              blockers: result.propertyBlockers,
            }));

      const hasMissingRatePlan = allBlocked.some((b) =>
        b.blockers.includes("RATE_PLAN_MAPPING_MISSING"),
      );
      const hasConflict = allBlocked.some((b) => b.blockers.includes("MAPPING_CONFLICT"));
      const hasPropertyMissing = allBlocked.some((b) =>
        b.blockers.includes("PROPERTY_MAPPING_MISSING"),
      );

      let detailMessage: string;
      if (hasConflict) {
        detailMessage = `Mapping Channex hạng phòng "${allBlocked.map((b) => b.roomType).join(", ")}" bị xung đột. Đối soát trước khi thực hiện`;
      } else if (hasMissingRatePlan) {
        detailMessage = `Hạng phòng ${allBlocked.map((b) => b.roomType).join(", ")} chưa có mapping gói giá Channex. Đồng bộ nội dung trước`;
      } else if (hasPropertyMissing) {
        detailMessage =
          "Khách sạn chưa được đồng bộ thông tin sang Channex. Hãy thực hiện Content Sync trước.";
      } else {
        detailMessage = `Hạng phòng ${allBlocked.map((b) => b.roomType).join(", ")} chưa có mapping Channex. Đồng bộ nội dung trước`;
      }

      throw new ConflictException({
        code: "CHANNEX_MAPPING_REQUIRED",
        message: detailMessage,
        detail: detailMessage,
        blockedRoomTypes: allBlocked,
      });
    }

    return result;
  }
}
