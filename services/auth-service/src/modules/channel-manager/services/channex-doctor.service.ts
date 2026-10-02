import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { ChannexApiClient } from "./channex-api-client.service";

export interface DoctorCheckItem {
  id: string;
  name: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  details?: any;
}

export interface DoctorReport {
  hotelId: string;
  healthy: boolean;
  timestamp: string;
  environment: string;
  checks: DoctorCheckItem[];
}

@Injectable()
export class ChannexDoctorService {
  private readonly logger = new Logger(ChannexDoctorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channexClient: ChannexApiClient,
  ) {}

  /**
   * Chạy chẩn đoán toàn diện hệ thống kết nối Channex của khách sạn
   */
  async runDoctor(hotelId: string, apiKey?: string): Promise<DoctorReport> {
    const checks: DoctorCheckItem[] = [];
    let isHealthy = true;

    // Check 1: Cấu hình API Key & Kết nối tới Channex
    try {
      const propRes = await this.channexClient.getProperties(apiKey);
      checks.push({
        id: "api_reachability",
        name: "Kết nối mạng và xác thực Channex API",
        status: "PASS",
        message: "API key hợp lệ và máy chủ Channex phản hồi 200 OK",
        details: {
          baseUrl: this.channexClient.getBaseUrl(),
          totalPropertiesFound: (propRes.data || []).length,
        },
      });
    } catch (err: any) {
      isHealthy = false;
      checks.push({
        id: "api_reachability",
        name: "Kết nối mạng và xác thực Channex API",
        status: "FAIL",
        message: `Không thể kết nối hoặc API key không hợp lệ: ${err.message}`,
      });
      return {
        hotelId,
        healthy: false,
        timestamp: new Date().toISOString(),
        environment: this.channexClient.getBaseUrl(),
        checks,
      };
    }

    // Check 2: Property Mapping
    const propertyMapping = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: {
          hotelId,
          kind: "property",
          localId: hotelId,
        },
      },
    });

    let channexPropertyId: string | null = null;
    if (!propertyMapping) {
      isHealthy = false;
      checks.push({
        id: "property_mapping",
        name: "Liên kết Khách sạn (Property Mapping)",
        status: "FAIL",
        message: "Khách sạn chưa được mapping với Property trên Channex. Cần chạy Content Sync.",
      });
    } else {
      channexPropertyId = propertyMapping.channexId;
      try {
        const p = await this.channexClient.getProperty(channexPropertyId, apiKey);
        checks.push({
          id: "property_mapping",
          name: "Liên kết Khách sạn (Property Mapping)",
          status: "PASS",
          message: `Khách sạn liên kết chuẩn xác với Channex Property: ${channexPropertyId}`,
          details: { title: p.data?.attributes?.title, currency: p.data?.attributes?.currency },
        });
      } catch (err: any) {
        isHealthy = false;
        checks.push({
          id: "property_mapping",
          name: "Liên kết Khách sạn (Property Mapping)",
          status: "FAIL",
          message: `Property ID ${channexPropertyId} không tồn tại trên Channex: ${err.message}`,
        });
      }
    }

    // Check 3: Room Type Mappings
    const rooms = await this.prisma.room.findMany({
      where: { hotelId },
      select: { type: true },
    });
    const localTypes = Array.from(
      new Set(
        rooms.map((room) => room.type?.trim()).filter((type): type is string => Boolean(type)),
      ),
    );
    const rtMappings = await this.prisma.channexMapping.findMany({
      where: { hotelId, kind: "room_type" },
    });
    const catalog = await this.prisma.roomType.findMany({
      where: { hotelId },
      select: { id: true, name: true, normalizedKey: true, basePrice: true },
    });

    const mappedTypes = new Set(rtMappings.map((m) => m.localId));
    const matchingType = (name: string) =>
      catalog.find(
        (item) =>
          item.normalizedKey === name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
      );
    const missingTypes = localTypes.filter(
      (t) =>
        !mappedTypes.has(matchingType(t)?.id ?? "") &&
        !Array.from(mappedTypes).some(
          (key) =>
            key.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() ===
            t.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
        ),
    );
    const missingPriceTypes = localTypes.filter((type) => {
      const price = matchingType(type)?.basePrice;
      return price === null || price === undefined || Number(price) <= 0;
    });

    if (missingPriceTypes.length > 0) {
      isHealthy = false;
      checks.push({
        id: "room_type_prices",
        name: "Giá gốc hạng phòng",
        status: "FAIL",
        message: `Hạng phòng ${missingPriceTypes.join(", ")} chưa có giá gốc trong danh mục. Cập nhật giá trước khi đồng bộ Channex.`,
        details: { missingPriceTypes },
      });
    } else {
      checks.push({
        id: "room_type_prices",
        name: "Giá hạng phòng trong DB",
        status: "PASS",
        message: `Toàn bộ ${localTypes.length} hạng phòng có giá gốc trong danh mục.`,
      });
    }

    if (missingTypes.length > 0) {
      checks.push({
        id: "room_type_mappings",
        name: "Độ phủ Mapping Hạng phòng",
        status: "WARN",
        message: `Có ${missingTypes.length} hạng phòng chưa mapping Channex (${missingTypes.join(", ")}).`,
        details: { missingTypes, totalLocalTypes: localTypes.length },
      });
    } else {
      checks.push({
        id: "room_type_mappings",
        name: "Độ phủ Mapping Hạng phòng",
        status: "PASS",
        message: `Toàn bộ ${localTypes.length} hạng phòng đều đã được mapping thành công.`,
        details: { mappedTypes: Array.from(mappedTypes) },
      });
    }

    // Check 4: Rate Plan Mappings
    const rpMappings = await this.prisma.channexMapping.findMany({
      where: { hotelId, kind: "rate_plan" },
    });
    if (rpMappings.length === 0) {
      isHealthy = false;
      checks.push({
        id: "rate_plan_mappings",
        name: "Gói giá (Rate Plan Mappings)",
        status: "FAIL",
        message: "Chưa có Gói giá nào được liên kết với Channex.",
      });
    } else {
      checks.push({
        id: "rate_plan_mappings",
        name: "Gói giá (Rate Plan Mappings)",
        status: "PASS",
        message: `Đã có ${rpMappings.length} gói giá được mapping và kích hoạt options.`,
        details: { totalRatePlans: rpMappings.length },
      });
    }

    // Check 5: Feed Reachability & Pending Revisions Count
    try {
      const feedRes = await this.channexClient.getBookingFeed(
        1,
        apiKey,
        channexPropertyId ?? undefined,
      );
      const pendingTotal = feedRes.meta?.total ?? 0;
      checks.push({
        id: "feed_reachability",
        name: "Đường truyền Booking Revisions Feed",
        status: pendingTotal > 20 ? "WARN" : "PASS",
        message:
          pendingTotal > 0
            ? `Feed đang hoạt động tốt. Có ${pendingTotal} booking revision đang chờ xử lý (unacked).`
            : "Feed hoạt động tốt, hàng đợi booking sạch sẽ (0 pending).",
        details: { pendingRevisions: pendingTotal },
      });
    } catch (err: any) {
      checks.push({
        id: "feed_reachability",
        name: "Đường truyền Booking Revisions Feed",
        status: "WARN",
        message: `Không thể đọc feed: ${err.message}`,
      });
    }

    // Check 6: Trạng thái lần đẩy đồng bộ gần nhất
    const lastLog = await this.prisma.channelSyncLog.findFirst({
      where: { hotelId },
      orderBy: { createdAt: "desc" },
    });

    if (lastLog) {
      checks.push({
        id: "last_sync_status",
        name: "Lần đồng bộ gần nhất",
        status: lastLog.status === "SUCCESS" ? "PASS" : "WARN",
        message: `Đồng bộ loại ${lastLog.syncType} trạng thái ${lastLog.status} lúc ${lastLog.createdAt.toISOString()}`,
        details: { details: lastLog.details },
      });
    }

    return {
      hotelId,
      healthy: isHealthy,
      timestamp: new Date().toISOString(),
      environment: this.channexClient.getBaseUrl(),
      checks,
    };
  }
}
