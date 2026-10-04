import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { AriCoreService } from "./ari-core.service";
import {
  ChannexApiClient,
  ChannexAvailabilityValue,
  ChannexRestrictionValue,
} from "./channex-api-client.service";
import { channexMinorUnitScale, resolveChannexRateMultiplier } from "./channex-currency";

export interface AriPushResult {
  success: boolean;
  hotelId: string;
  channexPropertyId: string;
  startDate: string;
  endDate: string;
  availabilityPushedCount: number;
  restrictionsPushedCount: number;
  sourceCurrency: "VND";
  targetCurrency: string;
  rateConversionApplied: boolean;
  rateConversionMultiplier: number;
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
      availabilityOnly?: boolean;
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

    const startForLimit = options.startDate ?? effectiveStart;
    const startMs = Date.parse(`${startForLimit}T00:00:00.000Z`);
    const endMs = Date.parse(`${effectiveEnd}T00:00:00.000Z`);
    const totalPushDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
    if (totalPushDays > 365) {
      throw new BadRequestException(
        `Khoảng thời gian đẩy ARI (${totalPushDays} ngày) vượt quá giới hạn tối đa 365 ngày`,
      );
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
    const remoteProperty = options.availabilityOnly
      ? null
      : await this.channexClient.getProperty(channexPropertyId, options.apiKey);
    const targetCurrency = options.availabilityOnly
      ? "NOT_APPLICABLE"
      : (remoteProperty?.data?.attributes?.currency ?? remoteProperty?.data?.currency);
    if (!targetCurrency) {
      throw new BadRequestException("Property Channex chưa xác định tiền tệ");
    }
    const rateConversionMultiplier = options.availabilityOnly
      ? 1
      : resolveChannexRateMultiplier(this.channexClient.getBaseUrl(), targetCurrency);

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

    if (
      roomTypeMappingMap.size === 0 ||
      (!options.availabilityOnly && ratePlanMappingMap.size === 0)
    ) {
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

    const catalog = await this.prisma.roomType.findMany({
      where: { hotelId },
      select: { id: true, name: true, normalizedKey: true, basePrice: true },
    });
    const seenGridTypes = new Set<string>();
    for (const rt of grid.roomTypes) {
      const key = rt.roomType.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
      if (seenGridTypes.has(key)) {
        throw new BadRequestException(
          `Hạng phòng "${rt.roomType}" có nhiều cách viết trong kho phòng. Đối soát trước khi đẩy ARI`,
        );
      }
      seenGridTypes.add(key);
      const type = catalog.find((item) => item.normalizedKey === key);
      if (type) {
        const mappingIds = new Set(
          Array.from(roomTypeMappingMap.entries())
            .filter(
              ([mappingKey]) =>
                mappingKey === type.id ||
                mappingKey.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() === key,
            )
            .map(([, remoteId]) => remoteId),
        );
        if (mappingIds.size > 1) {
          throw new BadRequestException(
            `Mapping Channex hạng phòng "${rt.roomType}" bị xung đột. Đối soát trước khi đẩy ARI`,
          );
        }
      }
      if (options.availabilityOnly) continue;
      if (
        !type ||
        type.basePrice === null ||
        Number(type.basePrice) <= 0 ||
        rt.days.some(
          (day) =>
            day.date >= today && (day.rate === null || !Number.isFinite(day.rate) || day.rate <= 0),
        )
      ) {
        throw new BadRequestException(
          `Hạng phòng "${rt.roomType}" chưa có giá gốc hợp lệ. Cập nhật danh mục loại phòng trước khi đẩy ARI`,
        );
      }
      const legacyRates = Array.from(ratePlanMappingMap.entries()).filter(
        ([key]) =>
          key.endsWith(":STANDARD") &&
          key.slice(0, -9).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() ===
            type.normalizedKey,
      );
      const catalogRate = ratePlanMappingMap.get(`${type.id}:STANDARD`);
      if (
        legacyRates.length > 1 ||
        (legacyRates.length && catalogRate && legacyRates[0][1] !== catalogRate)
      ) {
        throw new BadRequestException(
          `Mapping gói giá Channex "${rt.roomType}" bị xung đột. Đối soát trước khi đẩy ARI`,
        );
      }
    }

    // Resolve every mapping before sending availability; a later missing rate plan must not leave a partial push.
    const mappingsByType = new Map<string, { roomTypeId: string; ratePlanId?: string }>();
    for (const rt of grid.roomTypes) {
      const normalizedKey = rt.roomType.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
      const catalogType = catalog.find((item) => item.normalizedKey === normalizedKey);
      const legacyKey = Array.from(roomTypeMappingMap.keys()).find(
        (key) => key.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() === normalizedKey,
      );
      const mappingKey = legacyKey ?? catalogType?.id ?? rt.roomType;
      const roomTypeId = roomTypeMappingMap.get(mappingKey);
      if (!roomTypeId) {
        throw new BadRequestException(
          `Hạng phòng ${rt.roomType} chưa có mapping Channex. Đồng bộ nội dung trước`,
        );
      }
      let ratePlanId: string | undefined;
      if (!options.availabilityOnly) {
        const code = options.ratePlanCode || "STANDARD";
        ratePlanId =
          ratePlanMappingMap.get(`${mappingKey}:${code}`) ||
          ratePlanMappingMap.get(`${mappingKey}:STANDARD`) ||
          ratePlanMappingMap.get(`${catalogType?.id}:STANDARD`) ||
          ratePlanMappingMap.get(
            Array.from(ratePlanMappingMap.keys()).find(
              (key) =>
                key.endsWith(":STANDARD") &&
                key.slice(0, -9).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() ===
                  normalizedKey,
            ) ?? "",
          );
        if (!ratePlanId) {
          throw new BadRequestException(
            `Hạng phòng ${rt.roomType} chưa có mapping gói giá Channex. Đồng bộ nội dung trước`,
          );
        }
      }
      mappingsByType.set(rt.roomType, { roomTypeId, ratePlanId });
    }

    // 4. Xử lý từng hạng phòng: nén khoảng ngày liên tiếp (Run-length encoding)
    for (const rt of grid.roomTypes) {
      const mapping = mappingsByType.get(rt.roomType);
      if (!mapping) continue;
      const channexRoomTypeId = mapping.roomTypeId;

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

      if (options.availabilityOnly) continue;
      // 4.2. Restrictions: Lọc bỏ ngày quá khứ, sau đó nén dải ngày
      const channexRatePlanId = mapping.ratePlanId!;

      const rawRestrictionDays = rt.days
        .filter((d) => d.date >= today)
        .map((d) => {
          return {
            date: d.date,
            rate: Math.round(d.rate! * rateConversionMultiplier),
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
    let availabilityPushed = false;
    let restrictionsPushed = false;
    let writeError: string | null = null;

    try {
      if (availabilityValues.length > 0) {
        await this.channexClient.postAvailability(availabilityValues, options.apiKey);
        availabilityPushed = true;
        this.logger.log(
          `[ChannexAriSync] Đã đẩy ${availabilityValues.length} availability ranges sang Channex`,
        );
      }

      if (restrictionValues.length > 0) {
        await this.channexClient.postRestrictions(restrictionValues, options.apiKey);
        restrictionsPushed = true;
        this.logger.log(
          `[ChannexAriSync] Đã đẩy ${restrictionValues.length} restrictions ranges sang Channex`,
        );
      }
    } catch (writeErr: any) {
      writeError = writeErr.message || String(writeErr);
      this.logger.error(`[ChannexAriSync] Provider write failed: ${writeError}`);
    }

    // 6. READBACK VERIFICATION (Đọc ngược lại từ Channex API để đối chiếu chính xác toàn bộ dải ngày)
    let avlMatch = true;
    let restMatch = true;
    let checkedAvlDays = 0;
    let checkedRestDays = 0;
    let readbackError: string | null = null;
    const sampleDate = effectiveStart;

    if (writeError === null) {
      const PAGE_SIZE_DAYS = 30;

      try {
        let chunkStart = effectiveStart;
        while (
          chunkStart <= effectiveEnd &&
          (availabilityValues.length === 0 || avlMatch) &&
          (options.availabilityOnly || restrictionValues.length === 0 || restMatch)
        ) {
          const chunkEnd = this.minDate(
            this.addDaysToDate(chunkStart, PAGE_SIZE_DAYS - 1),
            effectiveEnd,
          );

          let pageAvl: any = null;
          let pageRest: any = null;

          if (availabilityValues.length > 0) {
            pageAvl = await this.channexClient.getAvailability(
              channexPropertyId,
              chunkStart,
              chunkEnd,
              options.apiKey,
            );
          }

          if (!options.availabilityOnly && restrictionValues.length > 0) {
            pageRest = await this.channexClient.getRestrictions(
              channexPropertyId,
              chunkStart,
              chunkEnd,
              "rate,min_stay_arrival,stop_sell,closed_to_arrival,closed_to_departure",
              options.apiKey,
            );
          }

          // Verify availability across sent values in current chunk
          if (availabilityValues.length > 0) {
            for (const val of availabilityValues) {
              const vStart = val.date ?? val.date_from!;
              const vEnd = val.date ?? val.date_to!;
              const overlapStart = chunkStart > vStart ? chunkStart : vStart;
              const overlapEnd = chunkEnd < vEnd ? chunkEnd : vEnd;

              if (overlapStart <= overlapEnd) {
                let cur = overlapStart;
                while (cur <= overlapEnd) {
                  const actual = pageAvl?.data?.[val.room_type_id]?.[cur];
                  if (actual === undefined || Number(actual) !== val.availability) {
                    avlMatch = false;
                    break;
                  }
                  checkedAvlDays++;
                  cur = this.addDaysToDate(cur, 1);
                }
                if (!avlMatch) break;
              }
            }
          }

          // Verify restrictions across sent values in current chunk
          if (!options.availabilityOnly && restrictionValues.length > 0) {
            const scale = channexMinorUnitScale(targetCurrency);
            for (const val of restrictionValues) {
              const vStart = val.date ?? val.date_from!;
              const vEnd = val.date ?? val.date_to!;
              const overlapStart = chunkStart > vStart ? chunkStart : vStart;
              const overlapEnd = chunkEnd < vEnd ? chunkEnd : vEnd;

              if (overlapStart <= overlapEnd) {
                let cur = overlapStart;
                while (cur <= overlapEnd) {
                  const actual = pageRest?.data?.[val.rate_plan_id]?.[cur];
                  if (!actual) {
                    restMatch = false;
                    break;
                  }

                  if (
                    val.rate !== undefined &&
                    (actual.rate === undefined ||
                      Math.round(Number(actual.rate) * scale) !== val.rate)
                  ) {
                    restMatch = false;
                    break;
                  }

                  if (
                    val.min_stay_arrival !== undefined &&
                    (actual.min_stay_arrival === undefined ||
                      Number(actual.min_stay_arrival) !== val.min_stay_arrival)
                  ) {
                    restMatch = false;
                    break;
                  }

                  if (
                    val.stop_sell !== undefined &&
                    (actual.stop_sell === undefined ||
                      !this.matchBool(actual.stop_sell, val.stop_sell))
                  ) {
                    restMatch = false;
                    break;
                  }

                  if (
                    val.closed_to_arrival !== undefined &&
                    (actual.closed_to_arrival === undefined ||
                      !this.matchBool(actual.closed_to_arrival, val.closed_to_arrival))
                  ) {
                    restMatch = false;
                    break;
                  }

                  if (
                    val.closed_to_departure !== undefined &&
                    (actual.closed_to_departure === undefined ||
                      !this.matchBool(actual.closed_to_departure, val.closed_to_departure))
                  ) {
                    restMatch = false;
                    break;
                  }

                  checkedRestDays++;
                  cur = this.addDaysToDate(cur, 1);
                }
                if (!restMatch) break;
              }
            }
          }

          chunkStart = this.addDaysToDate(chunkEnd, 1);
        }

        if (availabilityValues.length > 0 && checkedAvlDays === 0) {
          avlMatch = false;
        }
        if (!options.availabilityOnly && restrictionValues.length > 0 && checkedRestDays === 0) {
          restMatch = false;
        }
      } catch (readErr: any) {
        avlMatch = false;
        restMatch = false;
        readbackError = readErr.message || String(readErr);
        this.logger.warn(`[ChannexAriSync] Readback verification warning: ${readbackError}`);
      }
    } else {
      avlMatch = false;
      restMatch = false;
    }

    const overallSuccess =
      writeError === null && avlMatch && (options.availabilityOnly ? true : restMatch);

    // 7. Ghi log đồng bộ
    await this.prisma.channelSyncLog.create({
      data: {
        hotelId,
        syncType: "CHANNEX_ARI_PUSH",
        status: overallSuccess ? "SUCCESS" : "FAILED",
        eventsCount:
          (availabilityPushed ? availabilityValues.length : 0) +
          (restrictionsPushed ? restrictionValues.length : 0),
        details: JSON.stringify({
          startDate: effectiveStart,
          endDate: effectiveEnd,
          availabilityRanges: availabilityValues.length,
          restrictionsRanges: restrictionValues.length,
          sourceCurrency: "VND",
          targetCurrency,
          rateConversionMultiplier,
          readbackVerification: {
            avlMatch,
            restMatch,
            sampleDate,
            checkedAvlDays,
            checkedRestDays,
            writeError: writeError || null,
            readbackError: readbackError || null,
          },
        }),
      },
    });

    // 6.5. Tự động kích hoạt full_sync cho các kênh OTA active (Booking.com, Agoda...) chỉ khi thành công
    if (overallSuccess) {
      try {
        const activeChannelsRes = await this.channexClient.getChannels(
          channexPropertyId,
          options.apiKey,
        );
        for (const ch of activeChannelsRes?.data || []) {
          const isAct = (ch as any).attributes?.is_active ?? (ch as any).is_active;
          const chId = (ch as any).id;
          if (isAct && chId) {
            await this.channexClient.fullSyncChannel(chId, options.apiKey);
          }
        }
      } catch (syncErr: any) {
        this.logger.warn(`[ChannexAriSync] Auto full_sync warning: ${syncErr.message}`);
      }
    }

    return {
      success: overallSuccess,
      hotelId,
      channexPropertyId,
      startDate: effectiveStart,
      endDate: effectiveEnd,
      availabilityPushedCount: availabilityPushed ? availabilityValues.length : 0,
      restrictionsPushedCount: restrictionsPushed ? restrictionValues.length : 0,
      sourceCurrency: "VND",
      targetCurrency,
      rateConversionApplied: targetCurrency !== "VND" && targetCurrency !== "NOT_APPLICABLE",
      rateConversionMultiplier,
      readbackVerified: {
        availabilityMatch: avlMatch,
        restrictionsMatch: restMatch,
        sampleDateChecked: sampleDate,
      },
    };
  }

  private addDaysToDate(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split("T")[0];
  }

  private minDate(d1: string, d2: string): string {
    return d1 <= d2 ? d1 : d2;
  }

  private matchBool(actual: any, expected: boolean): boolean {
    if (typeof actual === "boolean") return actual === expected;
    if (actual === "true" || actual === 1) return expected === true;
    if (actual === "false" || actual === 0) return expected === false;
    return Boolean(actual) === expected;
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
