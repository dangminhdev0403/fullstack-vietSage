import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  AvailabilityItemDto,
  BulkUpdateRestrictionsDto,
  RestrictionItemDto,
} from "../domain/schemas/channel-manager.schema";

export interface DateRangeCollapsed<T> {
  startDate: string;
  endDate: string;
  data: T;
}

export interface InventoryGridDay {
  date: string;
  totalRooms: number;
  bookedRooms: number;
  blockedRooms: number;
  availableRooms: number;
  overrideAvailable: number | null;
  rate: number | null;
  ratePlanCode: string;
  minStayArrival: number;
  minStayThrough: number;
  maxStay: number;
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
}

export interface InventoryGridRoomType {
  roomType: string;
  totalInventoryRooms: number;
  days: InventoryGridDay[];
}

export interface InventoryGridResult {
  hotelId: string;
  startDate: string;
  endDate: string;
  roomTypes: InventoryGridRoomType[];
}

@Injectable()
export class AriCoreService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sinh danh sách các ngày liên tiếp dạng YYYY-MM-DD
   */
  private generateDateList(startDateStr: string, endDateStr: string): string[] {
    const dates: string[] = [];
    const current = new Date(`${startDateStr}T00:00:00.000Z`);
    const end = new Date(`${endDateStr}T00:00:00.000Z`);

    if (current > end) {
      throw new BadRequestException("Ngày bắt đầu không được lớn hơn ngày kết thúc");
    }

    while (current <= end) {
      dates.push(current.toISOString().split("T")[0]);
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }

  /**
   * Tổng hợp kho phòng trống (AVL) và giá/hạn chế (RATE, minStay, stopSell)
   */
  async getInventoryGrid(
    hotelId: string,
    startDateStr: string,
    endDateStr: string,
    roomTypeFilter?: string,
  ): Promise<InventoryGridResult> {
    const dates = this.generateDateList(startDateStr, endDateStr);
    const startDate = new Date(`${startDateStr}T00:00:00.000Z`);
    const endDate = new Date(`${endDateStr}T23:59:59.999Z`);

    // 1. Lấy danh sách các phòng thực tế của khách sạn để xác định số phòng & giá mặc định
    const rooms = await this.prisma.room.findMany({
      where: { hotelId },
      select: {
        id: true,
        type: true,
        price: true,
      },
    });

    const roomTypeStats = new Map<string, { total: number; basePrice: number | null }>();
    const roomTypeByRoomId = new Map<string, string>();
    for (const room of rooms) {
      const type = room.type?.trim();
      if (!type) continue;
      roomTypeByRoomId.set(room.id, type);
      const current = roomTypeStats.get(type) || { total: 0, basePrice: null };
      current.total += 1;
      if (room.price !== null && Number(room.price) > 0) {
        current.basePrice = Number(room.price);
      }
      roomTypeStats.set(type, current);
    }

    const reservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        OR: [{ roomId: { not: null } }, { roomTypeSnapshot: { not: null } }],
        status: { in: ["CONFIRMED", "ARRIVAL_READY", "CHECKED_IN"] },
        plannedCheckInAt: { lt: new Date(`${endDateStr}T17:00:00.000Z`) },
        plannedCheckOutAt: { gt: new Date(`${startDateStr}T00:00:00.000Z`) },
      },
      select: {
        roomId: true,
        roomTypeSnapshot: true,
        plannedCheckInAt: true,
        plannedCheckOutAt: true,
      },
    });
    const bookedByRoomTypeAndDate = new Map<string, number>();
    const vietnamDate = (value: Date): string =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(value);
    for (const reservation of reservations) {
      const roomType =
        (reservation.roomId ? roomTypeByRoomId.get(reservation.roomId) : undefined) ??
        reservation.roomTypeSnapshot ??
        undefined;
      if (!roomType) continue;
      const arrivalDate = vietnamDate(reservation.plannedCheckInAt);
      const departureDate = vietnamDate(reservation.plannedCheckOutAt);
      for (const date of dates) {
        if (date >= arrivalDate && date < departureDate) {
          const key = `${roomType}__${date}`;
          bookedByRoomTypeAndDate.set(key, (bookedByRoomTypeAndDate.get(key) ?? 0) + 1);
        }
      }
    }

    // 2. Lấy dữ liệu ChannelDailyAvailability đã lưu
    const availabilities = await this.prisma.channelDailyAvailability.findMany({
      where: {
        hotelId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        ...(roomTypeFilter ? { roomType: roomTypeFilter } : {}),
      },
    });

    const availabilityMap = new Map<string, (typeof availabilities)[number]>();
    for (const av of availabilities) {
      const dateKey = av.date.toISOString().split("T")[0];
      const key = `${av.roomType}__${dateKey}`;
      availabilityMap.set(key, av);
    }

    // 3. Lấy dữ liệu ChannelDailyRestriction đã lưu
    const restrictions = await this.prisma.channelDailyRestriction.findMany({
      where: {
        hotelId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        ...(roomTypeFilter ? { roomType: roomTypeFilter } : {}),
      },
    });

    const restrictionMap = new Map<string, (typeof restrictions)[number]>();
    for (const res of restrictions) {
      const dateKey = res.date.toISOString().split("T")[0];
      const key = `${res.roomType}__${res.ratePlanCode}__${dateKey}`;
      restrictionMap.set(key, res);
    }

    // Xác định tất cả các roomType cần hiển thị
    const allRoomTypes = new Set<string>();
    for (const type of roomTypeStats.keys()) {
      allRoomTypes.add(type);
    }
    for (const av of availabilities) {
      allRoomTypes.add(av.roomType);
    }
    for (const res of restrictions) {
      allRoomTypes.add(res.roomType);
    }

    let targetTypes = Array.from(allRoomTypes);

    if (roomTypeFilter) {
      targetTypes = targetTypes.filter((t) => t === roomTypeFilter);
    }

    // 4. Xây dựng grid cho từng hạng phòng
    const roomTypeGrids: InventoryGridRoomType[] = [];

    for (const roomType of targetTypes) {
      const stats = roomTypeStats.get(roomType) || { total: 0, basePrice: null };
      const days: InventoryGridDay[] = [];

      for (const d of dates) {
        const avKey = `${roomType}__${d}`;
        const av = availabilityMap.get(avKey);

        const totalRooms = av ? av.totalRooms : stats.total;
        const bookedRooms = bookedByRoomTypeAndDate.get(avKey) ?? 0;
        const blockedRooms = av ? av.blockedRooms : 0;
        const overrideAvailable = av ? av.overrideAvailable : null;
        const availableRooms =
          overrideAvailable !== null
            ? overrideAvailable
            : Math.max(0, totalRooms - bookedRooms - blockedRooms);

        const resKey = `${roomType}__STANDARD__${d}`;
        const res = restrictionMap.get(resKey);

        const rate = res ? Number(res.rate) : stats.basePrice;
        const ratePlanCode = res ? res.ratePlanCode : "STANDARD";
        const minStayArrival = res ? res.minStayArrival : 1;
        const minStayThrough = res ? res.minStayThrough : 1;
        const maxStay = res ? res.maxStay : 0;
        const stopSell = res ? res.stopSell : false;
        const closedToArrival = res ? res.closedToArrival : false;
        const closedToDeparture = res ? res.closedToDeparture : false;

        days.push({
          date: d,
          totalRooms,
          bookedRooms,
          blockedRooms,
          availableRooms,
          overrideAvailable,
          rate,
          ratePlanCode,
          minStayArrival,
          minStayThrough,
          maxStay,
          stopSell,
          closedToArrival,
          closedToDeparture,
        });
      }

      roomTypeGrids.push({
        roomType,
        totalInventoryRooms: stats.total,
        days,
      });
    }

    return {
      hotelId,
      startDate: startDateStr,
      endDate: endDateStr,
      roomTypes: roomTypeGrids,
    };
  }

  /**
   * Cập nhật thông tin phòng trống
   */
  async updateAvailability(
    hotelId: string,
    items: AvailabilityItemDto[],
  ): Promise<{ success: boolean; count: number }> {
    for (const item of items) {
      const date = new Date(`${item.date}T00:00:00.000Z`);
      const override = item.overrideAvailable ?? null;
      const total = item.totalRooms ?? 0;
      const booked = item.bookedRooms ?? 0;
      const blocked = item.blockedRooms ?? 0;
      const calculatedAvailable =
        override !== null ? override : Math.max(0, total - booked - blocked);

      await this.prisma.channelDailyAvailability.upsert({
        where: {
          hotelId_roomType_date: {
            hotelId,
            roomType: item.roomType,
            date,
          },
        },
        create: {
          hotelId,
          roomType: item.roomType,
          date,
          totalRooms: total,
          bookedRooms: booked,
          blockedRooms: blocked,
          availableRooms: calculatedAvailable,
          overrideAvailable: override,
        },
        update: {
          ...(item.totalRooms !== undefined ? { totalRooms: item.totalRooms } : {}),
          ...(item.bookedRooms !== undefined ? { bookedRooms: item.bookedRooms } : {}),
          ...(item.blockedRooms !== undefined ? { blockedRooms: item.blockedRooms } : {}),
          availableRooms: calculatedAvailable,
          ...(item.overrideAvailable !== undefined
            ? { overrideAvailable: item.overrideAvailable }
            : {}),
        },
      });
    }

    return {
      success: true,
      count: items.length,
    };
  }

  /**
   * Cập nhật giá và hạn chế
   */
  async updateRestrictions(
    hotelId: string,
    items: RestrictionItemDto[],
  ): Promise<{ success: boolean; count: number }> {
    for (const item of items) {
      const date = new Date(`${item.date}T00:00:00.000Z`);
      const ratePlanCode = item.ratePlanCode || "STANDARD";

      await this.prisma.channelDailyRestriction.upsert({
        where: {
          hotelId_roomType_ratePlanCode_date: {
            hotelId,
            roomType: item.roomType,
            ratePlanCode,
            date,
          },
        },
        create: {
          hotelId,
          roomType: item.roomType,
          ratePlanCode,
          date,
          rate: item.rate,
          minStayArrival: item.minStayArrival ?? 1,
          minStayThrough: item.minStayThrough ?? 1,
          maxStay: item.maxStay ?? 0,
          stopSell: item.stopSell ?? false,
          closedToArrival: item.closedToArrival ?? false,
          closedToDeparture: item.closedToDeparture ?? false,
        },
        update: {
          rate: item.rate,
          ...(item.minStayArrival !== undefined ? { minStayArrival: item.minStayArrival } : {}),
          ...(item.minStayThrough !== undefined ? { minStayThrough: item.minStayThrough } : {}),
          ...(item.maxStay !== undefined ? { maxStay: item.maxStay } : {}),
          ...(item.stopSell !== undefined ? { stopSell: item.stopSell } : {}),
          ...(item.closedToArrival !== undefined ? { closedToArrival: item.closedToArrival } : {}),
          ...(item.closedToDeparture !== undefined
            ? { closedToDeparture: item.closedToDeparture }
            : {}),
        },
      });
    }

    return {
      success: true,
      count: items.length,
    };
  }

  /**
   * Áp dụng giá/ràng buộc hàng loạt cho dải ngày và các thứ trong tuần được chọn
   */
  async bulkUpdateRestrictions(
    hotelId: string,
    payload: BulkUpdateRestrictionsDto,
  ): Promise<{
    success: boolean;
    updatedDatesCount: number;
    updatedTotalCount: number;
  }> {
    const dates = this.generateDateList(payload.startDate, payload.endDate);
    const allowedDays = new Set(payload.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);

    const matchingDates = dates.filter((d) => {
      const dayOfWeek = new Date(`${d}T00:00:00.000Z`).getUTCDay();
      return allowedDays.has(dayOfWeek);
    });

    if (matchingDates.length === 0) {
      return {
        success: true,
        updatedDatesCount: 0,
        updatedTotalCount: 0,
      };
    }

    const ratePlanCode = payload.ratePlanCode || "STANDARD";
    let updatedTotalCount = 0;

    for (const roomType of payload.roomTypes) {
      for (const d of matchingDates) {
        const date = new Date(`${d}T00:00:00.000Z`);

        // Tìm bản ghi hiện tại nếu có để giữ nguyên rate nếu không truyền rate mới
        const existing = await this.prisma.channelDailyRestriction.findUnique({
          where: {
            hotelId_roomType_ratePlanCode_date: {
              hotelId,
              roomType,
              ratePlanCode,
              date,
            },
          },
        });

        if (payload.rate === undefined && !existing) {
          throw new BadRequestException(
            `Hạng phòng ${roomType} chưa có giá trong DB; vui lòng nhập giá khi cập nhật`,
          );
        }
        const effectiveRate = payload.rate ?? Number(existing!.rate);

        await this.prisma.channelDailyRestriction.upsert({
          where: {
            hotelId_roomType_ratePlanCode_date: {
              hotelId,
              roomType,
              ratePlanCode,
              date,
            },
          },
          create: {
            hotelId,
            roomType,
            ratePlanCode,
            date,
            rate: effectiveRate,
            minStayArrival: payload.minStayArrival ?? 1,
            minStayThrough: payload.minStayThrough ?? 1,
            maxStay: payload.maxStay ?? 0,
            stopSell: payload.stopSell ?? false,
            closedToArrival: payload.closedToArrival ?? false,
            closedToDeparture: payload.closedToDeparture ?? false,
          },
          update: {
            ...(payload.rate !== undefined ? { rate: payload.rate } : {}),
            ...(payload.minStayArrival !== undefined
              ? { minStayArrival: payload.minStayArrival }
              : {}),
            ...(payload.minStayThrough !== undefined
              ? { minStayThrough: payload.minStayThrough }
              : {}),
            ...(payload.maxStay !== undefined ? { maxStay: payload.maxStay } : {}),
            ...(payload.stopSell !== undefined ? { stopSell: payload.stopSell } : {}),
            ...(payload.closedToArrival !== undefined
              ? { closedToArrival: payload.closedToArrival }
              : {}),
            ...(payload.closedToDeparture !== undefined
              ? { closedToDeparture: payload.closedToDeparture }
              : {}),
          },
        });
        updatedTotalCount += 1;
      }
    }

    return {
      success: true,
      updatedDatesCount: matchingDates.length,
      updatedTotalCount,
    };
  }

  /**
   * Utility gộp các ngày liên tiếp có cùng trạng thái thành dải ngày [startDate, endDate]
   */
  collapseDateRanges<T extends Record<string, unknown>>(
    items: Array<T & { date: string }>,
    compareKeys?: Array<keyof T>,
  ): Array<DateRangeCollapsed<T>> {
    if (items.length === 0) {
      return [];
    }

    // Sắp xếp tăng dần theo ngày
    const sorted = [...items].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const results: Array<DateRangeCollapsed<T>> = [];
    let currentStart = sorted[0].date;
    let currentEnd = sorted[0].date;
    let currentData = { ...sorted[0] };
    Reflect.deleteProperty(currentData, "date");

    const areEqual = (objA: Record<string, unknown>, objB: Record<string, unknown>): boolean =>
      (compareKeys?.map(String) ?? Object.keys(objA)).every(
        (key) => key === "date" || objA[key] === objB[key],
      );

    const isNextDay = (dateStr1: string, dateStr2: string): boolean => {
      const d1 = new Date(`${dateStr1}T00:00:00.000Z`);
      const d2 = new Date(`${dateStr2}T00:00:00.000Z`);
      const diffMs = d2.getTime() - d1.getTime();
      return diffMs === 86400000;
    };

    for (let i = 1; i < sorted.length; i++) {
      const item = sorted[i];
      const itemData = { ...item };
      Reflect.deleteProperty(itemData, "date");

      if (isNextDay(currentEnd, item.date) && areEqual(currentData, itemData)) {
        currentEnd = item.date;
      } else {
        results.push({
          startDate: currentStart,
          endDate: currentEnd,
          data: currentData,
        });
        currentStart = item.date;
        currentEnd = item.date;
        currentData = itemData;
      }
    }

    results.push({
      startDate: currentStart,
      endDate: currentEnd,
      data: currentData,
    });

    return results;
  }
}
