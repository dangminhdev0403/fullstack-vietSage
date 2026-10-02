import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  ChannexApiClient,
  ChannexPropertyPayload,
  ChannexRatePlanPayload,
  ChannexRoomTypePayload,
} from "./channex-api-client.service";
import { resolveChannexRateMultiplier } from "./channex-currency";

export interface SyncContentResult {
  success: boolean;
  hotelId: string;
  channexPropertyId: string;
  roomTypesSynced: Array<{
    localRoomType: string;
    channexRoomTypeId: string;
    roomsCount: number;
    action: "CREATED" | "UPDATED";
  }>;
  ratePlansSynced: Array<{
    ratePlanCode: string;
    channexRatePlanId: string;
    action: "CREATED" | "UPDATED";
  }>;
  verified: {
    roomTypesInChannex: number;
    ratePlansInChannex: number;
  };
}

@Injectable()
export class ChannexSyncService {
  private readonly logger = new Logger(ChannexSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channexClient: ChannexApiClient,
  ) {}

  /**
   * Đồng bộ toàn bộ thông tin Khách sạn (Property), Hạng phòng (Room Types) và Gói giá (Rate Plans)
   * sang Channex theo cơ chế Idempotent (chạy bao nhiêu lần cũng an toàn).
   */
  async syncContent(
    hotelId: string,
    options?: { currency?: string },
    apiKey?: string,
  ): Promise<SyncContentResult> {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        rooms: { include: { roomType: true } },
        roomTypes: true,
      },
    });

    if (!hotel) {
      throw new NotFoundException(`Không tìm thấy khách sạn với ID: ${hotelId}`);
    }
    if (hotel.rooms.length === 0) {
      throw new BadRequestException("Khách sạn chưa có phòng để đồng bộ sang Channex");
    }
    for (const room of hotel.rooms) {
      if (!room.type?.trim()) {
        throw new BadRequestException(`Phòng ${room.roomNumber} chưa có hạng phòng trong DB`);
      }
    }
    const roomTypeMap = new Map<
      string,
      { id: string; count: number; defaultPrice: number; name: string }
    >();
    const seenNames = new Map<string, string>();
    for (const room of hotel.rooms) {
      const type =
        room.roomType ??
        hotel.roomTypes.find(
          (candidate) =>
            candidate.normalizedKey ===
            room.type!.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
        );
      if (type && type.hotelId !== hotelId) {
        throw new BadRequestException(
          `Phòng ${room.roomNumber} liên kết loại phòng từ khách sạn khác. Đối soát trước khi đồng bộ`,
        );
      }
      if (
        type &&
        room.roomTypeId &&
        room.type?.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() !==
          type.normalizedKey
      ) {
        throw new BadRequestException(
          `Phòng ${room.roomNumber} có tên và ID loại phòng không khớp. Đối soát trước khi đồng bộ`,
        );
      }
      if (
        !type ||
        type.basePrice === null ||
        !Number.isFinite(Number(type.basePrice)) ||
        Number(type.basePrice) <= 0
      ) {
        throw new BadRequestException(
          `Hạng phòng "${room.type}" chưa có giá gốc rõ ràng. Cập nhật danh mục loại phòng trước khi đồng bộ Channex`,
        );
      }
      if (seenNames.has(type.id) && seenNames.get(type.id) !== room.type!.trim()) {
        throw new BadRequestException(
          `Hạng phòng "${type.name}" có nhiều cách viết trong phòng cũ. Chuẩn hóa sau khi đối soát trước khi đồng bộ`,
        );
      }
      seenNames.set(type.id, room.type!.trim());
      const current = roomTypeMap.get(type.id);
      roomTypeMap.set(type.id, {
        id: type.id,
        name: type.name,
        count: (current?.count ?? 0) + 1,
        defaultPrice: Number(type.basePrice),
      });
    }
    const legacyMappings = await this.prisma.channexMapping.findMany({
      where: { hotelId, kind: { in: ["room_type", "rate_plan"] } },
    });
    const mappingKeys = new Map<string, string>();
    const ratePlanKeys = new Map<string, string>();
    for (const stats of roomTypeMap.values()) {
      const oldMappings = legacyMappings.filter(
        (m) =>
          m.kind === "room_type" &&
          m.localId.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() ===
            stats.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
      );
      const oldKey = oldMappings[0]?.localId;
      if (oldMappings.length > 1)
        throw new BadRequestException(
          `Mapping Channex của "${stats.name}" bị trùng tên. Đối soát trước khi đồng bộ`,
        );
      mappingKeys.set(stats.id, oldKey ?? stats.id);
      const existingRatePlans = legacyMappings.filter(
        (m) =>
          m.kind === "rate_plan" &&
          m.localId.endsWith(":STANDARD") &&
          (m.localId === `${stats.id}:STANDARD` ||
            m.localId.slice(0, -9).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() ===
              stats.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()),
      );
      if (
        existingRatePlans.length > 1 &&
        new Set(existingRatePlans.map((item) => item.localId)).size > 1
      ) {
        throw new BadRequestException(
          `Mapping gói giá của "${stats.name}" bị trùng khóa. Đối soát trước khi đồng bộ`,
        );
      }
      if (
        existingRatePlans.length > 1 &&
        new Set(existingRatePlans.map((item) => item.channexId)).size > 1
      ) {
        throw new BadRequestException(
          `Mapping gói giá của "${stats.name}" bị xung đột. Đối soát trước khi đồng bộ`,
        );
      }
      if (!oldKey && existingRatePlans.some((item) => item.localId !== `${stats.id}:STANDARD`)) {
        throw new BadRequestException(
          `Mapping hạng phòng của "${stats.name}" bị thiếu nhưng gói giá cũ còn tồn tại. Đối soát trước khi đồng bộ`,
        );
      }
      ratePlanKeys.set(stats.id, existingRatePlans[0]?.localId ?? `${oldKey ?? stats.id}:STANDARD`);
      for (const kind of ["room_type", "rate_plan"] as const) {
        const suffix = kind === "rate_plan" ? ":STANDARD" : "";
        const old = legacyMappings.find(
          (m) => m.kind === kind && m.localId === `${oldKey ?? stats.name}${suffix}`,
        );
        const next = legacyMappings.find(
          (m) => m.kind === kind && m.localId === `${stats.id}${suffix}`,
        );
        if (old && next && old.channexId !== next.channexId) {
          throw new BadRequestException(
            `Mapping Channex của "${stats.name}" bị xung đột. Đối soát trước khi đồng bộ`,
          );
        }
      }
    }

    // 2. BƯỚC 1: ĐỒNG BỘ PROPERTY (KHÁCH SẠN)
    const propertyMapping = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: {
          hotelId,
          kind: "property",
          localId: hotel.id,
        },
      },
    });

    let effectiveCurrency = options?.currency || "VND";
    if (propertyMapping) {
      try {
        const existingProperty = await this.channexClient.getProperty(
          propertyMapping.channexId,
          apiKey,
        );
        effectiveCurrency =
          existingProperty.data?.attributes?.currency ??
          existingProperty.data?.currency ??
          effectiveCurrency;
      } catch (err) {
        if (!(err instanceof NotFoundException)) throw err;
      }
    }

    // Validate currency before creating local mappings or changing the provider.
    const rateConversionMultiplier = resolveChannexRateMultiplier(
      this.channexClient.getBaseUrl(),
      effectiveCurrency,
    );
    let channelConnection = await this.prisma.channelConnection.findFirst({
      where: { hotelId, channelCode: "CHANNEX" },
    });
    if (!channelConnection) {
      channelConnection = await this.prisma.channelConnection.create({
        data: {
          hotelId,
          channelCode: "CHANNEX",
          title: `Channex - ${hotel.name}`,
          status: "ACTIVE",
          outboundToken: `channex_${hotelId}_${Date.now()}`,
          priceMultiplier: 1.0,
        },
      });
    }

    const propertyPayload: ChannexPropertyPayload = {
      title: hotel.name,
      currency: effectiveCurrency,
      country: "VN",
      city: hotel.province || undefined,
      address: hotel.area || undefined,
      timezone: hotel.timezone || "Asia/Ho_Chi_Minh",
      content: {
        description: `VietSage PMS Managed Hotel: ${hotel.name}`,
      },
    };

    let channexPropertyId: string;

    if (propertyMapping) {
      channexPropertyId = propertyMapping.channexId;
      try {
        await this.channexClient.updateProperty(channexPropertyId, propertyPayload, apiKey);
        this.logger.log(`[ChannexSync] Cập nhật Property thành công: ${channexPropertyId}`);
      } catch (err: any) {
        if (!(err instanceof NotFoundException)) throw err;
        // Nếu trên Staging bị xóa mất property, tạo mới lại
        this.logger.warn(
          `[ChannexSync] Property ${channexPropertyId} không tồn tại trên Channex, tiến hành tạo mới: ${err.message}`,
        );
        const created = await this.channexClient.createProperty(propertyPayload, apiKey);
        channexPropertyId = created.data.id;
        await this.prisma.channexMapping.update({
          where: { id: propertyMapping.id },
          data: { channexId: channexPropertyId },
        });
      }
    } else {
      const created = await this.channexClient.createProperty(propertyPayload, apiKey);
      channexPropertyId = created.data.id;
      await this.prisma.channexMapping.create({
        data: {
          hotelId,
          channelConnectionId: channelConnection.id,
          kind: "property",
          localId: hotel.id,
          channexId: channexPropertyId,
          metadata: { title: hotel.name },
        },
      });
      this.logger.log(`[ChannexSync] Tạo mới Property thành công: ${channexPropertyId}`);
    }

    const roomTypesSynced: SyncContentResult["roomTypesSynced"] = [];
    const ratePlansSynced: SyncContentResult["ratePlansSynced"] = [];

    // 4. BƯỚC 3: ĐỒNG BỘ TỪNG ROOM TYPE & RATE PLAN
    for (const stats of roomTypeMap.values()) {
      const roomType = stats.name;
      const roomTypeKey = mappingKeys.get(stats.id)!;
      // Room Type Sync
      const rtMapping = await this.prisma.channexMapping.findUnique({
        where: {
          hotelId_kind_localId: {
            hotelId,
            kind: "room_type",
            localId: roomTypeKey,
          },
        },
      });

      const rtTitle = roomType.trim();
      const rtPayload: ChannexRoomTypePayload = {
        property_id: channexPropertyId,
        title: rtTitle,
        count_of_rooms: stats.count,
        occ_adults: 2,
        occ_children: 1,
        occ_infants: 1,
        default_occupancy: 2,
        room_kind: "room",
        content: {
          description: `Hạng phòng ${rtTitle} tại ${hotel.name}`,
        },
      };

      let channexRtId: string;
      let rtAction: "CREATED" | "UPDATED" = "CREATED";

      if (rtMapping) {
        channexRtId = rtMapping.channexId;
        try {
          await this.channexClient.updateRoomType(channexRtId, rtPayload, apiKey);
          rtAction = "UPDATED";
        } catch (err) {
          if (!(err instanceof NotFoundException)) throw err;
          const res = await this.channexClient.createRoomType(rtPayload, apiKey);
          channexRtId = res.data.id;
          await this.prisma.channexMapping.update({
            where: { id: rtMapping.id },
            data: { channexId: channexRtId },
          });
        }
      } else {
        const res = await this.channexClient.createRoomType(rtPayload, apiKey);
        channexRtId = res.data.id;
        await this.prisma.channexMapping.create({
          data: {
            hotelId,
            channelConnectionId: channelConnection.id,
            kind: "room_type",
            localId: roomTypeKey,
            channexId: channexRtId,
            metadata: { title: rtTitle, countOfRooms: stats.count },
          },
        });
      }

      roomTypesSynced.push({
        localRoomType: roomType,
        channexRoomTypeId: channexRtId,
        roomsCount: stats.count,
        action: rtAction,
      });

      // Rate Plan Sync (Tuân thủ triết lý Channex Skill: 1 Standard Rate Plan / Room Type ban đầu)
      const ratePlanCode = ratePlanKeys.get(stats.id)!;
      const rpMapping = await this.prisma.channexMapping.findUnique({
        where: {
          hotelId_kind_localId: {
            hotelId,
            kind: "rate_plan",
            localId: ratePlanCode,
          },
        },
      });

      const rpPayload: ChannexRatePlanPayload = {
        property_id: channexPropertyId,
        room_type_id: channexRtId,
        title: `${roomType} - Standard Rate`,
        currency: effectiveCurrency,
        sell_mode: "per_room",
        rate_mode: "manual",
        options: [
          {
            occupancy: 2,
            is_primary: true,
            rate: Math.round(stats.defaultPrice * rateConversionMultiplier),
          },
        ],
      };

      let channexRpId: string;
      let rpAction: "CREATED" | "UPDATED" = "CREATED";

      if (rpMapping) {
        channexRpId = rpMapping.channexId;
        try {
          await this.channexClient.updateRatePlan(channexRpId, rpPayload, apiKey);
          rpAction = "UPDATED";
        } catch (err) {
          if (!(err instanceof NotFoundException)) throw err;
          const res = await this.channexClient.createRatePlan(rpPayload, apiKey);
          channexRpId = res.data.id;
          await this.prisma.channexMapping.update({
            where: { id: rpMapping.id },
            data: { channexId: channexRpId },
          });
        }
      } else {
        const res = await this.channexClient.createRatePlan(rpPayload, apiKey);
        channexRpId = res.data.id;
        await this.prisma.channexMapping.create({
          data: {
            hotelId,
            channelConnectionId: channelConnection.id,
            kind: "rate_plan",
            localId: ratePlanCode,
            channexId: channexRpId,
            metadata: { title: `${roomType} - Standard Rate`, sellMode: "per_room" },
          },
        });
      }

      ratePlansSynced.push({
        ratePlanCode,
        channexRatePlanId: channexRpId,
        action: rpAction,
      });
    }

    // 5. BƯỚC 4: VERIFICATION READBACK TỪ CHANNEX ĐỂ ĐẢM BẢO DỮ LIỆU ĐÃ VÀO
    const readbackRoomTypes = await this.channexClient.getRoomTypes(channexPropertyId, apiKey);
    const readbackRatePlans = await this.channexClient.getRatePlans(channexPropertyId, apiKey);
    await this.ensureBookingWebhook(channexPropertyId, apiKey);

    // Ghi log đồng bộ
    await this.prisma.channelSyncLog.create({
      data: {
        hotelId,
        channelConnectionId: channelConnection.id,
        syncType: "CHANNEX_CONTENT_SYNC",
        status: "SUCCESS",
        eventsCount: roomTypesSynced.length + ratePlansSynced.length,
        details: JSON.stringify({
          channexPropertyId,
          roomTypesSynced: roomTypesSynced.length,
          ratePlansSynced: ratePlansSynced.length,
          verifiedRoomTypes: (readbackRoomTypes.data || []).length,
          verifiedRatePlans: (readbackRatePlans.data || []).length,
        }),
      },
    });

    return {
      success: true,
      hotelId,
      channexPropertyId,
      roomTypesSynced,
      ratePlansSynced,
      verified: {
        roomTypesInChannex: (readbackRoomTypes.data || []).length,
        ratePlansInChannex: (readbackRatePlans.data || []).length,
      },
    };
  }

  /**
   * Lấy thông tin ID mapping Channex cho khách sạn
   */
  async getMappings(hotelId: string) {
    return this.prisma.channexMapping.findMany({
      where: { hotelId },
      orderBy: { kind: "asc" },
    });
  }

  private async ensureBookingWebhook(propertyId: string, apiKey?: string): Promise<void> {
    const callbackUrl = process.env.CHANNEX_WEBHOOK_URL?.trim();
    const secret = process.env.CHANNEX_WEBHOOK_SECRET?.trim();
    if (!callbackUrl) return;
    if (!secret || secret.length < 32) {
      throw new Error(
        "Cấu hình Channex webhook chưa đầy đủ: thiếu CHANNEX_WEBHOOK_SECRET (tối thiểu 32 ký tự)",
      );
    }

    const parsedUrl = new URL(callbackUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
      throw new Error("CHANNEX_WEBHOOK_URL phải là HTTPS URL công khai");
    }
    const existing = await this.channexClient.getWebhooks(apiKey);
    const alreadyRegistered = (existing?.data ?? []).some(
      (webhook: any) =>
        webhook?.attributes?.callback_url === callbackUrl &&
        (webhook?.attributes?.is_global === true ||
          webhook?.relationships?.property?.data?.id === propertyId),
    );
    if (alreadyRegistered) return;

    await this.channexClient.registerWebhook({
      callbackUrl,
      propertyId,
      headers: { "X-Channex-Webhook-Secret": secret },
    });
  }

  /**
   * Cấu hình liên kết thủ công Channex Property ID cho một khách sạn VietSage
   */
  async configureProperty(hotelId: string, channexPropertyId: string, apiKey?: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
    });
    if (!hotel) {
      throw new NotFoundException(`Không tìm thấy khách sạn với ID: ${hotelId}`);
    }

    // Xác thực property có tồn tại trên Channex không
    let propertyTitle = hotel.name;
    try {
      const channexRes = await this.channexClient.getProperty(channexPropertyId, apiKey);
      propertyTitle = channexRes.data?.attributes?.title || channexRes.data?.title || hotel.name;
    } catch (err: any) {
      throw new BadRequestException(
        `Không thể xác thực Channex Property ID (${channexPropertyId}) trên Channex: ${err.message}`,
      );
    }

    // Đảm bảo ChannelConnection CHANNEX tồn tại
    let channelConnection = await this.prisma.channelConnection.findFirst({
      where: { hotelId, channelCode: "CHANNEX" },
    });
    if (!channelConnection) {
      channelConnection = await this.prisma.channelConnection.create({
        data: {
          hotelId,
          channelCode: "CHANNEX",
          title: `Channex - ${hotel.name}`,
          status: "ACTIVE",
          outboundToken: `channex_${hotelId}_${Date.now()}`,
          priceMultiplier: 1.0,
        },
      });
    }

    // Lưu hoặc cập nhật mapping
    await this.prisma.channexMapping.upsert({
      where: {
        hotelId_kind_localId: {
          hotelId,
          kind: "property",
          localId: hotel.id,
        },
      },
      update: {
        channexId: channexPropertyId,
        metadata: {
          configuredManually: true,
          propertyTitle,
          updatedAt: new Date().toISOString(),
        },
      },
      create: {
        hotelId,
        kind: "property",
        localId: hotel.id,
        channexId: channexPropertyId,
        metadata: {
          configuredManually: true,
          propertyTitle,
          createdAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log(
      `[ChannexSync] Đã gán Channex Property ID ${channexPropertyId} cho khách sạn ${hotel.name} (${hotelId})`,
    );

    return {
      success: true,
      hotelId: hotel.id,
      channexPropertyId,
      propertyTitle,
      propertyUrl: `https://staging.channex.io/properties/${channexPropertyId}`,
      message: `Đã liên kết khách sạn "${hotel.name}" với Channex Property "${propertyTitle}" (${channexPropertyId}) thành công.`,
    };
  }

  /**
   * Lấy cấu hình Channex Property hiện tại và danh sách các property có sẵn trên tài khoản Channex
   */
  async getPropertyConfig(hotelId: string, apiKey?: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { tenant: true },
    });
    if (!hotel) {
      throw new NotFoundException(`Không tìm thấy khách sạn với ID: ${hotelId}`);
    }

    const mapping = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: {
          hotelId,
          kind: "property",
          localId: hotel.id,
        },
      },
    });

    let availableProperties: Array<{
      id: string;
      title: string;
      currency: string;
      url: string;
    }> = [];

    try {
      const res = await this.channexClient.getProperties(apiKey);
      if (Array.isArray(res.data)) {
        availableProperties = res.data.map((p) => ({
          id: p.id,
          title: p.attributes?.title || p.title || p.id,
          currency: p.attributes?.currency || "VND",
          url: `https://staging.channex.io/properties/${p.id}`,
        }));
      }
    } catch (err: any) {
      this.logger.warn(`Không thể lấy danh sách properties từ Channex: ${err.message}`);
    }

    return {
      hotelId: hotel.id,
      hotelName: hotel.name,
      hotelCode: hotel.code,
      tenantName: hotel.tenant?.name || null,
      channexPropertyId: mapping?.channexId || null,
      isConfigured: Boolean(mapping?.channexId),
      channexPropertyUrl: mapping?.channexId
        ? `https://staging.channex.io/properties/${mapping.channexId}`
        : null,
      availableProperties,
    };
  }
}
