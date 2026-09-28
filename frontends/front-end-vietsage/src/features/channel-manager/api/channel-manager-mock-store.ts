import type {
  AvailabilityUpdateItem,
  BulkUpdatePayload,
  ChannelConnection,
  CreateConnectionPayload,
  DayInventory,
  InventoryGridResponse,
  RestrictionUpdateItem,
  RoomTypeInventory,
} from "../types/channel-manager.types";

interface HotelChannelStore {
  connections: ChannelConnection[];
  customDays: Map<string, Partial<DayInventory>>; // key: `${roomTypeId}_${date}`
}

const stores = new Map<string, HotelChannelStore>();

const DEFAULT_ROOM_TYPES = [
  {
    roomTypeId: "room-type-dlx",
    roomTypeName: "Deluxe King City View",
    roomTypeCode: "DLX-K",
    basePrice: 1_250_000,
    totalRooms: 10,
  },
  {
    roomTypeId: "room-type-exe",
    roomTypeName: "Executive Suite Ocean View",
    roomTypeCode: "EXE-S",
    basePrice: 2_450_000,
    totalRooms: 5,
  },
  {
    roomTypeId: "room-type-sup",
    roomTypeName: "Superior Twin Mountain View",
    roomTypeCode: "SUP-T",
    basePrice: 950_000,
    totalRooms: 12,
  },
  {
    roomTypeId: "room-type-villa",
    roomTypeName: "VietSage Royal Pool Villa",
    roomTypeCode: "VLA-RP",
    basePrice: 5_800_000,
    totalRooms: 3,
  },
];

function getOrCreateStore(hotelId: string): HotelChannelStore {
  let store = stores.get(hotelId);
  if (!store) {
    const slug = hotelId.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 12) || "hotel";
    const nowIso = new Date().toISOString();
    store = {
      connections: [
        {
          id: `conn-airbnb-${hotelId}`,
          hotelId,
          channelType: "AIRBNB_ICAL",
          name: "Airbnb - Toàn bộ phòng & Villa",
          inboundUrl: `https://www.airbnb.com/calendar/ical/${slug}_airbnb.ics?s=token123`,
          outboundUrl: `https://api.vietsage.com/v1/ical/export/${slug}_airbnb_feed.ics`,
          syncStatus: "SUCCESS",
          lastSyncAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
          errorReason: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        {
          id: `conn-booking-${hotelId}`,
          hotelId,
          channelType: "BOOKING_ICAL",
          name: "Booking.com - Lịch phân phối",
          inboundUrl: `https://admin.booking.com/hotel/hotelparams/ical.html?t=${slug}_booking`,
          outboundUrl: `https://api.vietsage.com/v1/ical/export/${slug}_booking_feed.ics`,
          syncStatus: "SUCCESS",
          lastSyncAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
          errorReason: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        {
          id: `conn-agoda-${hotelId}`,
          hotelId,
          channelType: "AGODA_ICAL",
          name: "Agoda YCS Extranet",
          inboundUrl: `https://ycs.agoda.com/api/v1/calendar/ical/${slug}_agoda.ics`,
          outboundUrl: `https://api.vietsage.com/v1/ical/export/${slug}_agoda_feed.ics`,
          syncStatus: "IDLE",
          lastSyncAt: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
          errorReason: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        {
          id: `conn-direct-${hotelId}`,
          hotelId,
          channelType: "DIRECT_ENGINE",
          name: "VietSage Direct Engine (Cổng Đặt Phòng Website)",
          inboundUrl: "viet-sage-direct-sync-engine://live",
          outboundUrl: `https://api.vietsage.com/v1/ical/export/${slug}_direct_feed.ics`,
          syncStatus: "SUCCESS",
          lastSyncAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          errorReason: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
      customDays: new Map(),
    };
    stores.set(hotelId, store);
  }
  return store;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function generateDates(dateFromStr: string, dateToStr: string): string[] {
  const dates: string[] = [];
  const start = parseDate(dateFromStr);
  const end = parseDate(dateToStr);
  const current = new Date(start);

  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }

  // Fallback to 14 days if range is invalid or too small
  if (dates.length === 0) {
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(formatDate(d));
    }
  }

  return dates;
}

export const channelManagerMockStore = {
  getConnections(hotelId: string): ChannelConnection[] {
    const store = getOrCreateStore(hotelId);
    return [...store.connections];
  },

  createConnection(hotelId: string, payload: CreateConnectionPayload): ChannelConnection {
    const store = getOrCreateStore(hotelId);
    const id = `conn-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const slug = hotelId.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 10) || "hotel";
    const nowIso = new Date().toISOString();
    const newConn: ChannelConnection = {
      id,
      hotelId,
      channelType: payload.channelType,
      name: payload.name.trim(),
      inboundUrl: payload.inboundUrl.trim(),
      outboundUrl: `https://api.vietsage.com/v1/ical/export/${slug}_${id}.ics`,
      syncStatus: "IDLE",
      lastSyncAt: null,
      errorReason: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.connections.unshift(newConn);
    return newConn;
  },

  deleteConnection(hotelId: string, connectionId: string): { success: boolean; id: string } {
    const store = getOrCreateStore(hotelId);
    store.connections = store.connections.filter((c) => c.id !== connectionId);
    return { success: true, id: connectionId };
  },

  syncNow(connectionId: string): {
    success: boolean;
    connectionId: string;
    syncedAt: string;
    message: string;
  } {
    const nowIso = new Date().toISOString();
    for (const store of stores.values()) {
      const conn = store.connections.find((c) => c.id === connectionId);
      if (conn) {
        conn.syncStatus = "SUCCESS";
        conn.lastSyncAt = nowIso;
        conn.errorReason = null;
        conn.updatedAt = nowIso;
        return {
          success: true,
          connectionId,
          syncedAt: nowIso,
          message: `Đồng bộ kênh "${conn.name}" thành công qua chuẩn iCal/Channex.`,
        };
      }
    }
    return {
      success: true,
      connectionId,
      syncedAt: nowIso,
      message: "Đồng bộ hoàn tất.",
    };
  },

  getInventoryGrid(hotelId: string, dateFrom: string, dateTo: string): InventoryGridResponse {
    const store = getOrCreateStore(hotelId);
    const dates = generateDates(dateFrom, dateTo);

    const roomTypes: RoomTypeInventory[] = DEFAULT_ROOM_TYPES.map((rt, idx) => {
      const days: DayInventory[] = dates.map((dateStr, dayIdx) => {
        const key = `${rt.roomTypeId}_${dateStr}`;
        const custom = store.customDays.get(key);

        const parsedDate = parseDate(dateStr);
        const dayOfWeek = parsedDate.getDay();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday or Saturday night

        // Pseudo-random but deterministic availability based on room type & day
        const seed = (idx * 7 + dayIdx * 3) % 10;
        let baseAvailable = rt.totalRooms - (seed % (rt.totalRooms + 1));
        if (baseAvailable < 0) baseAvailable = 0;
        if (seed === 0 && dayIdx % 4 === 0) baseAvailable = 0; // Occasionally sold out

        // Weekend rate markup (+15%)
        const defaultRate = isWeekend ? Math.round((rt.basePrice * 1.15) / 10000) * 10000 : rt.basePrice;
        const defaultMinStay = isWeekend ? 2 : 1;
        const defaultStopSell = baseAvailable === 0;

        return {
          date: dateStr,
          available: custom?.available !== undefined ? custom.available : baseAvailable,
          total: rt.totalRooms,
          rate: custom?.rate !== undefined ? custom.rate : defaultRate,
          minStay: custom?.minStay !== undefined ? custom.minStay : defaultMinStay,
          stopSell: custom?.stopSell !== undefined ? custom.stopSell : defaultStopSell,
          closedToArrival: custom?.closedToArrival ?? false,
          closedToDeparture: custom?.closedToDeparture ?? false,
        };
      });

      return {
        roomTypeId: rt.roomTypeId,
        roomTypeName: rt.roomTypeName,
        roomTypeCode: rt.roomTypeCode,
        basePrice: rt.basePrice,
        totalRooms: rt.totalRooms,
        days,
      };
    });

    return {
      hotelId,
      dateFrom,
      dateTo,
      roomTypes,
    };
  },

  updateRestrictions(
    hotelId: string,
    items: RestrictionUpdateItem[],
  ): { success: boolean; updatedCount: number } {
    const store = getOrCreateStore(hotelId);
    let count = 0;

    for (const item of items) {
      const key = `${item.roomTypeId}_${item.date}`;
      const current = store.customDays.get(key) || {};
      if (item.rate !== undefined) current.rate = item.rate;
      if (item.minStay !== undefined) current.minStay = item.minStay;
      if (item.stopSell !== undefined) current.stopSell = item.stopSell;
      if (item.closedToArrival !== undefined) current.closedToArrival = item.closedToArrival;
      if (item.closedToDeparture !== undefined) current.closedToDeparture = item.closedToDeparture;

      store.customDays.set(key, current);
      count++;
    }

    return { success: true, updatedCount: count };
  },

  updateAvailability(
    hotelId: string,
    items: AvailabilityUpdateItem[],
  ): { success: boolean; updatedCount: number } {
    const store = getOrCreateStore(hotelId);
    let count = 0;

    for (const item of items) {
      const key = `${item.roomTypeId}_${item.date}`;
      const current = store.customDays.get(key) || {};
      current.available = item.available;
      if (item.available === 0) {
        current.stopSell = true;
      }
      store.customDays.set(key, current);
      count++;
    }

    return { success: true, updatedCount: count };
  },

  bulkUpdate(
    hotelId: string,
    payload: BulkUpdatePayload,
  ): { success: boolean; affectedCells: number; message: string } {
    const store = getOrCreateStore(hotelId);
    const dates = generateDates(payload.dateFrom, payload.dateTo);
    const targetRoomTypeIds =
      payload.roomTypeIds && payload.roomTypeIds.length > 0
        ? payload.roomTypeIds
        : DEFAULT_ROOM_TYPES.map((r) => r.roomTypeId);

    let count = 0;

    for (const dateStr of dates) {
      const parsedDate = parseDate(dateStr);
      const dayOfWeek = parsedDate.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7

      if (payload.daysOfWeek.length > 0 && !payload.daysOfWeek.includes(dayOfWeek)) {
        continue;
      }

      for (const roomTypeId of targetRoomTypeIds) {
        const key = `${roomTypeId}_${dateStr}`;
        const current = store.customDays.get(key) || {};

        if (payload.rate !== undefined && payload.rate > 0) {
          current.rate = payload.rate;
        }
        if (payload.minStay !== undefined && payload.minStay > 0) {
          current.minStay = payload.minStay;
        }
        if (payload.stopSell !== undefined) {
          current.stopSell = payload.stopSell;
        }

        store.customDays.set(key, current);
        count++;
      }
    }

    return {
      success: true,
      affectedCells: count,
      message: `Đã áp dụng cập nhật hàng loạt thành công cho ${count} ô lịch ngày phòng.`,
    };
  },
};
