process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "mock_jwt_access_secret_32_chars_long!!";
process.env.JWT_REFRESH_SECRET = "mock_jwt_refresh_secret_32_chars_long!";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";
process.env.VIETSAGE_HMAC_SECRET = "test_vietsage_hmac_secret_32_chars!!";

import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ReservationStatus, RoomStatus } from "@prisma/client";
import { DirectBookingController } from "../controllers/direct-booking.controller";
import { DirectBookingHmacGuard } from "../guards/direct-booking-hmac.guard";
import {
  computeDirectBookingCanonicalPayload,
  signDirectBookingPayload,
} from "../services/direct-booking-hmac.util";
import { DirectBookingService } from "../services/direct-booking.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";

describe("Channel Manager Direct Booking & Auto Room Allocation Module", () => {
  let directBookingService: DirectBookingService;
  let directBookingController: DirectBookingController;
  let hmacGuard: DirectBookingHmacGuard;
  let mockPrisma: any;
  let mockRoomAllocationService: any;
  let mockCodesService: any;

  const testSecret = "test_vietsage_hmac_secret_32_chars!!";
  const hotelId = "hotel_vsh_01";
  const roomTypeId = "room_type_deluxe";

  beforeEach(() => {
    mockPrisma = {
      room: {
        findMany: jest.fn().mockResolvedValue([
          { id: "room_301", hotelId, roomTypeId, roomNumber: "301", floor: "3", status: RoomStatus.AVAILABLE },
          { id: "room_302", hotelId, roomTypeId, roomNumber: "302", floor: "3", status: RoomStatus.AVAILABLE },
        ]),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(async ({ where, data }) => ({
          id: where.id,
          ...data,
        })),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "res_9999",
          ...data,
        })),
      },
      guestStay: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    mockRoomAllocationService = {
      allocateRoom: jest.fn().mockImplementation(async (_tx, input) => {
        expect(input.mode).toBe("auto");
        expect(input.hotelId).toBe(hotelId);
        return {
          id: "room_302",
          roomId: "room_302",
          roomNumber: "302",
          hotelId: input.hotelId,
          roomTypeId: input.roomTypeId,
          type: "DELUXE",
          status: RoomStatus.AVAILABLE,
          price: 1200000,
          floor: "3",
          room: { id: "room_302", roomNumber: "302", floor: "3" },
        };
      }),
    };

    mockCodesService = {
      generateEntityCode: jest.fn().mockResolvedValue("VS-20261019-001"),
    };

    directBookingService = new DirectBookingService(
      mockPrisma,
      mockRoomAllocationService,
      mockCodesService,
    );

    directBookingController = new DirectBookingController(directBookingService);
    hmacGuard = new DirectBookingHmacGuard();
  });

  describe("1. HMAC SHA256 Signature Verification", () => {
    it("chấp nhận chữ ký chuẩn với header X-Signature: t=...,v1=...", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const requestId = "req_123456";
      const path = "/channel-manager/direct-booking/holds";
      const method = "POST";
      const body = {
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-10-25",
        check_out_date: "2026-10-27",
      };

      const canonical = computeDirectBookingCanonicalPayload(
        method,
        path,
        timestamp,
        requestId,
        body,
      );
      const signature = signDirectBookingPayload(canonical, testSecret);

      const mockReq = {
        method,
        originalUrl: path,
        path,
        headers: {
          "x-signature": `t=${timestamp},v1=${signature}`,
          "x-timestamp": String(timestamp),
          "x-request-id": requestId,
        },
        body,
      } as any;

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
      } as any;

      expect(hmacGuard.canActivate(mockContext)).toBe(true);
    });

    it("chấp nhận chữ ký khi truyền header X-Signature-V1 riêng biệt", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const requestId = "req_abcdef";
      const path = "/channel-manager/direct-booking/status?booking_id=bk_123";
      const method = "GET";
      const body = null;

      const canonical = computeDirectBookingCanonicalPayload(
        method,
        path,
        timestamp,
        requestId,
        body,
      );
      const signature = signDirectBookingPayload(canonical, testSecret);

      const mockReq = {
        method,
        originalUrl: path,
        path: "/channel-manager/direct-booking/status",
        headers: {
          "x-signature-v1": signature,
          "x-timestamp": String(timestamp),
          "x-request-id": requestId,
        },
        body,
      } as any;

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
      } as any;

      expect(hmacGuard.canActivate(mockContext)).toBe(true);
    });

    it("từ chối khi chữ ký sai hoặc bị can thiệp body", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const requestId = "req_tampered";
      const path = "/channel-manager/direct-booking/holds";
      const method = "POST";
      const body = { amount: 100 };

      const mockReq = {
        method,
        originalUrl: path,
        headers: {
          "x-signature": `t=${timestamp},v1=bad_signature_hex`,
          "x-timestamp": String(timestamp),
          "x-request-id": requestId,
        },
        body,
      } as any;

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
      } as any;

      expect(() => hmacGuard.canActivate(mockContext)).toThrow(BadRequestException);
    });

    it("từ chối khi timestamp bị trôi quá 300 giây (drift window)", () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 350;
      const requestId = "req_expired";
      const path = "/channel-manager/direct-booking/holds";
      const method = "POST";
      const body = {};

      const canonical = computeDirectBookingCanonicalPayload(
        method,
        path,
        expiredTimestamp,
        requestId,
        body,
      );
      const signature = signDirectBookingPayload(canonical, testSecret);

      const mockReq = {
        method,
        originalUrl: path,
        headers: {
          "x-signature": `t=${expiredTimestamp},v1=${signature}`,
          "x-timestamp": String(expiredTimestamp),
          "x-request-id": requestId,
        },
        body,
      } as any;

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
      } as any;

      expect(() => hmacGuard.canActivate(mockContext)).toThrow(
        "VietSage request timestamp drift exceeds tolerance window",
      );
    });
  });

  describe("2. Hold Creation (POST /channel-manager/direct-booking/holds)", () => {
    it("tạo hold thành công, trả về hold_id và expires_at bọc trong envelope", async () => {
      const payload = {
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-11-01",
        check_out_date: "2026-11-03",
        rooms_count: 1,
        guest: {
          name: "Nguyen Van A",
          email: "vana@example.com",
          phone: "0901234567",
        },
        ttl_minutes: 30,
      };

      const response = await directBookingController.createHold(payload);

      expect(response.success).toBe(true);
      expect(response.data.hold_id).toBeDefined();
      expect(response.data.hold_id.startsWith("hld_")).toBe(true);
      expect(response.data.expires_at).toBeDefined();
    });

    it("ném lỗi ConflictException ROOM_NOT_AVAILABLE khi không còn phòng trống", async () => {
      // Mock tất cả phòng đã có reservation trùng lịch
      mockPrisma.reservation.findMany.mockResolvedValue([
        { roomId: "room_301" },
        { roomId: "room_302" },
      ]);

      const payload = {
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-11-01",
        check_out_date: "2026-11-03",
        rooms_count: 1,
      };

      await expect(directBookingController.createHold(payload)).rejects.toThrow(ConflictException);
    });

    it("từ chối khi check_out_date trước hoặc bằng check_in_date", async () => {
      const payload = {
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-11-05",
        check_out_date: "2026-11-03",
      };

      await expect(directBookingController.createHold(payload)).rejects.toThrow(BadRequestException);
    });
  });

  describe("3. Hold Confirmation & Auto Room Allocation (POST /channel-manager/direct-booking/holds/:id/confirm)", () => {
    it("confirm hold thành công, tự gán phòng và cập nhật trạng thái phòng thành RESERVED (KHÔNG ĐƯỢC OCCUPIED)", async () => {
      // 1. Tạo hold
      const holdRes = await directBookingController.createHold({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-11-10",
        check_out_date: "2026-11-12",
        rooms_count: 1,
        guest: {
          name: "Tran Thi B",
          phone: "0987654321",
        },
      });

      const holdId = holdRes.data.hold_id;
      const bookingId = "bk_ota_order_001";

      // 2. Xác nhận hold
      const confirmRes = await directBookingController.confirmHold(holdId, {
        hold_id: holdId,
        booking_id: bookingId,
      });

      expect(confirmRes.success).toBe(true);
      const data = confirmRes.data;

      // Kiểm tra cấu trúc trả về chuẩn theo yêu cầu
      expect(data).toMatchObject({
        reservation_id: "res_9999",
        reservation_code: "VS-20261019-001",
        hold_id: holdId,
        booking_id: bookingId,
        status: "CONFIRMED",
        room_status: "AVAILABLE",
        assigned_room: {
          room_number: "302",
          floor: 3,
        },
      });
      expect(data.confirmed_at).toBeDefined();

      // BẤT BIẾN: Tạo/xác nhận reservation KHÔNG toggle Room.status vật lý thành RESERVED
      expect(mockPrisma.room.update).not.toHaveBeenCalled();

      // TUYỆT ĐỐI KHÔNG ĐƯỢC CÓ TRẠNG THÁI OCCUPIED
      expect(data.room_status).not.toBe("OCCUPIED");

      // BẤT BIẾN: Lưu trữ canonical roomTypeId trong Reservation
      expect(mockPrisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hotelId,
            roomId: "room_302",
            roomTypeId,
            roomTypeSnapshot: "DELUXE",
          }),
        }),
      );

      // Kiểm tra tự gán phòng mode auto được gọi
      expect(mockRoomAllocationService.allocateRoom).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          hotelId,
          roomTypeId,
          mode: "auto",
        }),
      );
    });

    it("lưu trữ canonical roomTypeId và authoritative provider party size (guestCount) khi có", async () => {
      const holdRes = await directBookingService.createHold({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-11-10",
        check_out_date: "2026-11-12",
        rooms_count: 1,
        guest: {
          name: "Tran Thi B",
          phone: "0987654321",
        },
        guest_count: 2,
      } as any);

      const holdId = holdRes.hold_id;
      const bookingId = "bk_ota_party_002";

      await directBookingService.confirmHold(holdId, bookingId);

      expect(mockPrisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roomTypeId,
            guestCount: 2,
          }),
        }),
      );

      expect(mockRoomAllocationService.allocateRoom).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          guestCount: 2,
        }),
      );
    });

    it("phát sự kiện realtime channel_booking.created khi confirm hold thành công và không phát room_status.updated", async () => {
      const emitBookingSpy = jest.spyOn(RequestRealtimeEmitter, "emitChannelBookingCreated").mockImplementation(() => {});
      const emitRoomSpy = jest.spyOn(RequestRealtimeEmitter, "emitRoomStatusUpdated").mockImplementation(() => {});

      const holdRes = await directBookingController.createHold({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-11-20",
        check_out_date: "2026-11-22",
        guest: { name: "Le Van C" },
      });

      const holdId = holdRes.data.hold_id;
      await directBookingController.confirmHold(holdId, {
        hold_id: holdId,
        booking_id: "bk_realtime_001",
        amount: 1500000,
        currency: "VND",
      });

      expect(emitBookingSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          hotelId,
          bookingId: "bk_realtime_001",
          guestName: "Le Van C",
          roomNumber: "302",
          amount: 1500000,
          currency: "VND",
        }),
      );

      // BẤT BIẾN: Không toggle Room.status -> emitRoomStatusUpdated không được gọi
      expect(emitRoomSpy).not.toHaveBeenCalled();

      emitBookingSpy.mockRestore();
      emitRoomSpy.mockRestore();
    });

    it("hỗ trợ idempotency khi confirm lại cùng booking_id", async () => {
      const holdRes = await directBookingController.createHold({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-11-15",
        check_out_date: "2026-11-17",
      });

      const holdId = holdRes.data.hold_id;
      const bookingId = "bk_idempotent_01";

      const firstConfirm = await directBookingController.confirmHold(holdId, {
        hold_id: holdId,
        booking_id: bookingId,
      });

      const secondConfirm = await directBookingController.confirmHold(holdId, {
        hold_id: holdId,
        booking_id: bookingId,
      });

      expect(secondConfirm).toEqual(firstConfirm);
      // allocateRoom chỉ chạy 1 lần duy nhất
      expect(mockRoomAllocationService.allocateRoom).toHaveBeenCalledTimes(1);
    });

    it("ném ConflictException khi confirm hold đã hết hạn (HOLD_EXPIRED)", async () => {
      const holdRes = await directBookingController.createHold({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-11-20",
        check_out_date: "2026-11-22",
        ttl_minutes: 1,
      });

      const holdId = holdRes.data.hold_id;

      // Giả lập hold đã quá hạn
      const holdRecord = (directBookingService as any).holds.get(holdId);
      holdRecord.expiresAt = new Date(Date.now() - 5000);

      await expect(
        directBookingController.confirmHold(holdId, {
          hold_id: holdId,
          booking_id: "bk_expired_01",
        }),
      ).rejects.toThrow("HOLD_EXPIRED");
    });

    it("ném NotFoundException khi hold_id không tồn tại", async () => {
      await expect(
        directBookingController.confirmHold("hld_non_existent", {
          hold_id: "hld_non_existent",
          booking_id: "bk_unknown",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("4. Hold Release (POST /channel-manager/direct-booking/holds/:id/release)", () => {
    it("giải phóng hold thành công, trả về status: RELEASED", async () => {
      const holdRes = await directBookingController.createHold({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-11-25",
        check_out_date: "2026-11-27",
      });

      const holdId = holdRes.data.hold_id;

      const releaseRes = await directBookingController.releaseHold(holdId, {
        hold_id: holdId,
        reason: "User cancelled on checkout page",
      });

      expect(releaseRes.success).toBe(true);
      expect(releaseRes.data).toEqual({
        hold_id: holdId,
        status: "RELEASED",
      });

      // Không thể confirm hold sau khi đã bị release
      await expect(
        directBookingController.confirmHold(holdId, {
          hold_id: holdId,
          booking_id: "bk_should_fail",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("5. Order Status Query (GET /channel-manager/direct-booking/status)", () => {
    it("tra cứu trạng thái đơn đã xác nhận theo booking_id", async () => {
      const holdRes = await directBookingController.createHold({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-12-01",
        check_out_date: "2026-12-03",
      });

      const holdId = holdRes.data.hold_id;
      const bookingId = "bk_query_test_001";

      await directBookingController.confirmHold(holdId, {
        hold_id: holdId,
        booking_id: bookingId,
      });

      const statusRes = await directBookingController.getStatus({
        booking_id: bookingId,
      });

      expect(statusRes.success).toBe(true);
      expect(statusRes.data.confirmed).toBe(true);
      expect(statusRes.data.booking_id).toBe(bookingId);
      expect(statusRes.data.status).toBe("CONFIRMED");
      expect(statusRes.data.room_status).toBe("AVAILABLE");
      expect(statusRes.data.assigned_room.room_number).toBe("302");
    });

    it("tra cứu trạng thái đơn theo operation_key", async () => {
      const operationKey = "confirm-hold:hld_custom_001:bk_op_001";

      const holdRes = await directBookingController.createHold({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        check_in_date: "2026-12-05",
        check_out_date: "2026-12-07",
      });

      const holdId = holdRes.data.hold_id;
      const bookingId = "bk_op_001";

      await directBookingController.confirmHold(holdId, {
        hold_id: holdId,
        booking_id: bookingId,
        operation_key: operationKey,
      });

      const statusRes = await directBookingController.getStatus({
        operation_key: operationKey,
      });

      expect(statusRes.success).toBe(true);
      expect(statusRes.data.confirmed).toBe(true);
      expect(statusRes.data.booking_id).toBe(bookingId);
    });

    it("trả về confirmed: false khi đơn không tồn tại", async () => {
      const statusRes = await directBookingController.getStatus({
        booking_id: "bk_non_existent",
      });

      expect(statusRes.success).toBe(true);
      expect(statusRes.data.confirmed).toBe(false);
      expect(statusRes.data.status).toBe("NOT_FOUND");
    });
  });
});
