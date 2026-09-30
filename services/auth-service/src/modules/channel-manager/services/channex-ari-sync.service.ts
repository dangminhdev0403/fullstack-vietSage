import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { AriCoreService } from "./ari-core.service";
import {
  ChannexApiClient,
  ChannexAvailabilityValue,
  ChannexRestrictionValue,
} from "./channex-api-client.service";

export interface AriPushResult {
  success: boolean;
  hotelId: string;
  channexPropertyId: string;
  startDate: string;
  endDate: string;
  availabilityPushedCount: number;
  restrictionsPushedCount: number;
  readbackVerified: {
    availabilityMatch: boolean;
    restrictionsMatch: boolean;
    sampleDateChecked: string;
  };
}

@Injectable()
export class ChannexAriSyncService {
  private readonly logger = new Logger(ChannexAriSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ariCoreService: AriCoreService,
    private readonly channexClient: ChannexApiClient,
  ) {}

  /**
   * Lấy ngày hôm nay theo múi giờ chuẩn Việt Nam (Asia/Ho_Chi_Minh) dạng YYYY-MM-DD
   */
  private getTodayInVietnam(): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  /**
   * Đẩy dữ liệu Kho phòng trống (Availability) và Giá/Hạn chế (Restrictions) sang Channex
   * Áp dụng thuật toán Run-length Compression (gộp dải ngày liên tiếp có cùng giá trị)
   * và lọc bỏ toàn bộ các ngày trong quá khứ (Past-date filtering).
   */
  async pushAri(
    hotelId: string,
    options: {
      startDate?: string;
      endDate?: string;
      roomType?: string;
      ratePlanCode?: string;
      apiKey?: string;
    } = {},
  ): Promise<AriPushResult> {
    const today = this.getTodayInVietnam();
    const effectiveStart =
      options.startDate && options.startDate >= today ? options.startDate : today;

    // 1. Xác định ngày kết thúc đẩy ARI (effectiveEnd):
    // Thay vì bắt buộc / validate ép đủ 30 ngày, hệ thống linh hoạt:
    // - Nếu options.endDate được chỉ định và >= effectiveStart: sử dụng options.endDate.
    // - Nếu không chỉ định: tự động tìm ngày cập nhật mới nhất (maxDate) trong DB từ ChannelDailyRestriction / ChannelDailyAvailability.
    // - Nếu chưa từng có cập nhật nào trong tương lai: chỉ đẩy đúng ngày bắt đầu (effectiveStart).
    let effectiveEnd = options.endDate;
    if (!effectiveEnd || effectiveEnd < effectiveStart) {
      const startDateUtc = new Date(`${effectiveStart}T00:00:00.000Z`);
      const [latestRestriction, latestAvailability] = await Promise.all([
        this.prisma.channelDailyRestriction.findFirst({
          where: {
            hotelId,
            date: { gte: startDateUtc },
          },
          orderBy: { date: "desc" },
          select: { date: true },
        }),
        this.prisma.channelDailyAvailability.findFirst({
          where: {
            hotelId,
            date: { gte: startDateUtc },
          },
          orderBy: { date: "desc" },
          select: { date: true },
        }),
      ]);

      const toDateString = (d: Date | null | undefined): string | null => {
        if (!d) return null;
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
      };

      const restDateStr = toDateString(latestRestriction?.date);
      const avlDateStr = toDateString(latestAvailability?.date);

      let maxConfiguredDate: string | null = null;
      if (restDateStr && avlDateStr) {
        maxConfiguredDate = restDateStr > avlDateStr ? restDateStr : avlDateStr;
      } else {
        maxConfiguredDate = restDateStr || avlDateStr;
      }

      if (maxConfiguredDate && maxConfiguredDate >= effectiveStart) {
        effectiveEnd = maxConfiguredDate;
      } else {
        effectiveEnd = effectiveStart;
      }
    }

    // 1. Kiểm tra mapping Property
    const propertyMapping = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: {
          hotelId,
          kind: "property",
          localId: hotelId,
        },
      },
    });

    if (!propertyMapping) {
      throw new BadRequestException(
        "Khách sạn chưa được đồng bộ thông tin sang Channex. Hãy thực hiện Content Sync trước.",
      );
    }
    const channexPropertyId = propertyMapping.channexId;

    // 2. Lấy toàn bộ room_type mappings và rate_plan mappings
    const allMappings = await this.prisma.channexMapping.findMany({
      where: { hotelId },
    });

    const roomTypeMappingMap = new Map<string, string>();
    const ratePlanMappingMap = new Map<string, string>();

    for (const m of allMappings) {
      if (m.kind === "room_type") {
        roomTypeMappingMap.set(m.localId, m.channexId);
      } else if (m.kind === "rate_plan") {
        ratePlanMappingMap.set(m.localId, m.channexId);
      }
    }

    if (roomTypeMappingMap.size === 0 || ratePlanMappingMap.size === 0) {
      throw new BadRequestException(
        "Chưa có Room Type hoặc Rate Plan mapping cho Channex. Vui lòng chạy Content Sync trước.",
      );
    }

    // 3. Lấy ma trận dữ liệu Inventory Grid từ AriCoreService
    const grid = await this.ariCoreService.getInventoryGrid(
      hotelId,
      effectiveStart,
      effectiveEnd,
      options.roomType,
    );

    const availabilityValues: ChannexAvailabilityValue[] = [];
    const restrictionValues: ChannexRestrictionValue[] = [];

    // 3.1. Tìm giá sàn cơ sở của khách sạn để fallback an toàn nếu ngày nào đó chưa có giá
    const sampleRoomWithPrice = await this.prisma.room.findFirst({
      where: {
        hotelId,
        price: { gt: 0 },
      },
      select: { price: true },
    });
    const safeFloorRate = sampleRoomWithPrice?.price
      ? Math.round(Number(sampleRoomWithPrice.price))
      : 500_000;

    // 4. Xử lý từng hạng phòng: nén khoảng ngày liên tiếp (Run-length encoding)
    for (const rt of grid.roomTypes) {
      const channexRoomTypeId = roomTypeMappingMap.get(rt.roomType);
      if (!channexRoomTypeId) {
        this.logger.warn(`Bỏ qua hạng phòng ${rt.roomType} vì chưa có Channex mapping`);
        continue;
      }

      // 4.1. Availability: Lọc bỏ ngày quá khứ, sau đó nén dải ngày
      const rawAvlDays = rt.days
        .filter((d) => d.date >= today)
        .map((d) => ({
          date: d.date,
          availability: d.overrideAvailable !== null ? d.overrideAvailable : d.availableRooms,
        }));

      const collapsedAvl = this.ariCoreService.collapseDateRanges(rawAvlDays, ["availability"]);
      for (const range of collapsedAvl) {
        if (range.startDate === range.endDate) {
          availabilityValues.push({
            property_id: channexPropertyId,
            room_type_id: channexRoomTypeId,
            date: range.startDate,
            availability: Math.max(0, range.data.availability),
          });
        } else {
          availabilityValues.push({
            property_id: channexPropertyId,
            room_type_id: channexRoomTypeId,
            date_from: range.startDate,
            date_to: range.endDate,
            availability: Math.max(0, range.data.availability),
          });
        }
      }

      // 4.2. Restrictions: Lọc bỏ ngày quá khứ, sau đó nén dải ngày
      const targetRatePlanCode = options.ratePlanCode || "STANDARD";
      const fullRatePlanKey = `${rt.roomType}:${targetRatePlanCode}`;
      const channexRatePlanId =
        ratePlanMappingMap.get(fullRatePlanKey) ||
        ratePlanMappingMap.get(`${rt.roomType}:STANDARD`);

      if (!channexRatePlanId) {
        this.logger.warn(`Không tìm thấy Rate Plan Channex cho ${fullRatePlanKey}`);
        continue;
      }

      const rawRestrictionDays = rt.days
        .filter((d) => d.date >= today)
        .map((d) => {
          let resolvedRate = d.rate;
          if (resolvedRate === null || resolvedRate <= 0) {
            resolvedRate = safeFloorRate;
            this.logger.warn(
              `[ChannexAriSync] Hạng phòng ${rt.roomType} ngày ${d.date} chưa có giá tùy biến, tự động bù giá cơ sở an toàn: ${resolvedRate} VND`,
            );
          }
          return {
            date: d.date,
            rate: Math.round(resolvedRate), // VND minor unit (integer)
            min_stay_arrival: d.minStayArrival,
            stop_sell: d.stopSell,
            closed_to_arrival: d.closedToArrival,
            closed_to_departure: d.closedToDeparture,
          };
        });

      const collapsedRest = this.ariCoreService.collapseDateRanges(rawRestrictionDays, [
        "rate",
        "min_stay_arrival",
        "stop_sell",
        "closed_to_arrival",
        "closed_to_departure",
      ]);

      for (const range of collapsedRest) {
        if (range.startDate === range.endDate) {
          restrictionValues.push({
            property_id: channexPropertyId,
            rate_plan_id: channexRatePlanId,
            date: range.startDate,
            rate: range.data.rate,
            min_stay_arrival: range.data.min_stay_arrival,
            stop_sell: range.data.stop_sell,
            closed_to_arrival: range.data.closed_to_arrival,
            closed_to_departure: range.data.closed_to_departure,
          });
        } else {
          restrictionValues.push({
            property_id: channexPropertyId,
            rate_plan_id: channexRatePlanId,
            date_from: range.startDate,
            date_to: range.endDate,
            rate: range.data.rate,
            min_stay_arrival: range.data.min_stay_arrival,
            stop_sell: range.data.stop_sell,
            closed_to_arrival: range.data.closed_to_arrival,
            closed_to_departure: range.data.closed_to_departure,
          });
        }
      }
    }

    // 5. Gửi message POST /availability và POST /restrictions (riêng biệt theo đúng spec Channex)
    if (availabilityValues.length > 0) {
      await this.channexClient.postAvailability(availabilityValues, options.apiKey);
      this.logger.log(
        `[ChannexAriSync] Đã đẩy ${availabilityValues.length} availability ranges sang Channex`,
      );
    }

    if (restrictionValues.length > 0) {
      await this.channexClient.postRestrictions(restrictionValues, options.apiKey);
      this.logger.log(
        `[ChannexAriSync] Đã đẩy ${restrictionValues.length} restrictions ranges sang Channex`,
      );
    }

    // 6. READBACK VERIFICATION (Đọc ngược lại từ Channex API để đối chiếu chính xác)
    let avlMatch = availabilityValues.length === 0;
    let restMatch = restrictionValues.length === 0;
    const sampleDate = effectiveStart;

    try {
      const readbackAvl = await this.channexClient.getAvailability(
        channexPropertyId,
        sampleDate,
        sampleDate,
        options.apiKey,
      );
      const expectedAvailability = availabilityValues.filter((value) =>
        this.rangeContains(value, sampleDate),
      );
      avlMatch = expectedAvailability.every(
        (value) => readbackAvl.data?.[value.room_type_id]?.[sampleDate] === value.availability,
      );

      const readbackRest = await this.channexClient.getRestrictions(
        channexPropertyId,
        sampleDate,
        sampleDate,
        "rate,min_stay_arrival,stop_sell",
        options.apiKey,
      );
      const expectedRestrictions = restrictionValues.filter((value) =>
        this.rangeContains(value, sampleDate),
      );
      restMatch = expectedRestrictions.every((value) => {
        const actual = readbackRest.data?.[value.rate_plan_id]?.[sampleDate];
        return (
          actual !== undefined &&
          (value.rate === undefined || Number(actual.rate) === value.rate) &&
          (value.min_stay_arrival === undefined ||
            Number(actual.min_stay_arrival) === value.min_stay_arrival) &&
          (value.stop_sell === undefined || actual.stop_sell === value.stop_sell)
        );
      });
    } catch (readErr: any) {
      avlMatch = false;
      restMatch = false;
      this.logger.warn(`[ChannexAriSync] Readback verification warning: ${readErr.message}`);
    }

    // 7. Ghi log đồng bộ
    await this.prisma.channelSyncLog.create({
      data: {
        hotelId,
        syncType: "CHANNEX_ARI_PUSH",
        status: "SUCCESS",
        eventsCount: availabilityValues.length + restrictionValues.length,
        details: JSON.stringify({
          startDate: effectiveStart,
          endDate: effectiveEnd,
          availabilityRanges: availabilityValues.length,
          restrictionsRanges: restrictionValues.length,
          readbackVerification: { avlMatch, restMatch, sampleDate },
        }),
      },
    });

    return {
      success: true,
      hotelId,
      channexPropertyId,
      startDate: effectiveStart,
      endDate: effectiveEnd,
      availabilityPushedCount: availabilityValues.length,
      restrictionsPushedCount: restrictionValues.length,
      readbackVerified: {
        availabilityMatch: avlMatch,
        restrictionsMatch: restMatch,
        sampleDateChecked: sampleDate,
      },
    };
  }

  private rangeContains(
    value: { date?: string; date_from?: string; date_to?: string },
    date: string,
  ): boolean {
    return (
      value.date === date ||
      Boolean(value.date_from && value.date_to && value.date_from <= date && value.date_to >= date)
    );
  }
}
