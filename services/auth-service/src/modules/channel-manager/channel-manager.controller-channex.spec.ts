process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "mock_jwt_access_secret_32_chars_long!!";
process.env.JWT_REFRESH_SECRET = "mock_jwt_refresh_secret_32_chars_long!";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

import { ChannelManagerController } from "./controllers/channel-manager.controller";

describe("ChannelManagerController Channex failure responses", () => {
  const req = { user: { userId: "user-1", roleId: "role-1" } };
  const hotelAccessService = { assertHotelAccess: jest.fn().mockResolvedValue(undefined) };
  const channexSyncService = { syncContent: jest.fn() };
  const channexAriSyncService = { pushAri: jest.fn() };
  const channexBookingIngestionService = { drainFeed: jest.fn(), recoverOutage: jest.fn() };

  const controller = new ChannelManagerController(
    {} as never,
    {} as never,
    {} as never,
    channexSyncService as never,
    channexAriSyncService as never,
    channexBookingIngestionService as never,
    {} as never,
    {} as never,
    hotelAccessService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("rejects HTTP success when Channex operations are incomplete", async () => {
    channexSyncService.syncContent.mockResolvedValue({ success: false, error: "readback failed" });
    channexAriSyncService.pushAri.mockResolvedValue({ success: false });
    channexBookingIngestionService.drainFeed.mockResolvedValue({ success: false });
    channexBookingIngestionService.recoverOutage.mockResolvedValue({ success: false });

    await expect(controller.syncChannexContent(req as never, "hotel-1", {})).rejects.toThrow(
      "readback failed",
    );
    await expect(controller.pushChannexAri(req as never, "hotel-1", {})).rejects.toThrow(
      "chưa được Channex xác nhận toàn bộ",
    );
    await expect(controller.pollChannexFeed(req as never, "hotel-1", {})).rejects.toThrow(
      "booking sửa đổi đang chờ đối soát",
    );
    await expect(
      controller.recoverChannexBookings(req as never, "hotel-1", {
        since: "2026-10-01T00:00:00Z",
      }),
    ).rejects.toThrow("Khôi phục Channex chưa hoàn tất");
  });
});
