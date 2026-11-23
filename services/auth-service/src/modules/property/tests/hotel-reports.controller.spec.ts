import { BadRequestException } from "@nestjs/common";
import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";
import { HotelReportsController } from "../api/hotel-reports.controller";

describe("HotelReportsController", () => {
  const mockHotelReportsService = {
    getReports: jest.fn(),
    upsertRevenueTarget: jest.fn(),
  };

  let controller: HotelReportsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HotelReportsController(mockHotelReportsService as never);
  });

  it("gọi hotelReportsService.getReports với tham số hợp lệ", async () => {
    const mockReports = {
      hotelId: "hotel-1",
      hotelName: "Khách sạn Sài Gòn",
      summary: { totalRevenue: 10000000 },
    };
    mockHotelReportsService.getReports.mockResolvedValue(mockReports);

    const req = {
      user: {
        userId: "user-1",
        roleId: "role-1",
      },
    };

    const res = await controller.getReports(req as never, "hotel-1", { range: "30d" });

    expect(res).toBe(mockReports);
    expect(mockHotelReportsService.getReports).toHaveBeenCalledWith("user-1", "role-1", "hotel-1", {
      range: "30d",
    });
  });

  it("chấp nhận khoảng ngày tùy chỉnh hợp lệ khi from <= to", async () => {
    mockHotelReportsService.getReports.mockResolvedValue({});
    const req = { user: { userId: "user-1", roleId: "role-1" } };

    await expect(
      controller.getReports(req as never, "hotel-1", {
        range: "30d",
        from: "2026-10-01",
        to: "2026-10-23",
      }),
    ).resolves.toBeDefined();
  });

  it("từ chối và ném BadRequestException khi from > to", async () => {
    const req = { user: { userId: "user-1", roleId: "role-1" } };

    await expect(
      controller.getReports(req as never, "hotel-1", {
        from: "2026-10-31",
        to: "2026-10-01",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("từ chối khi định dạng ngày from không đúng YYYY-MM-DD", async () => {
    const req = { user: { userId: "user-1", roleId: "role-1" } };

    await expect(
      controller.getReports(req as never, "hotel-1", {
        from: "01/10/2026",
        to: "2026-10-23",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  describe("upsertRevenueTarget", () => {
    it("yêu cầu quyền hotel.billing.manage trên endpoint PUT targets", () => {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          HotelReportsController.prototype.upsertRevenueTarget,
        ),
      ).toBe("hotel.billing.manage");
    });

    it("gọi hotelReportsService.upsertRevenueTarget với dữ liệu hợp lệ (cập nhật và xóa bằng 0)", async () => {
      const req = { user: { userId: "user-1", roleId: "role-1" } };
      const expected = {
        hotelId: "hotel-1",
        month: "2026-11",
        targetAmount: 150000000,
        revenueTargets: { "2026-11": 150000000 },
      };
      mockHotelReportsService.upsertRevenueTarget.mockResolvedValue(expected);

      const res = await controller.upsertRevenueTarget(req as never, "hotel-1", {
        month: " 2026-11 ",
        targetAmount: 150000000,
      });
      expect(res).toEqual(expected);
      expect(mockHotelReportsService.upsertRevenueTarget).toHaveBeenCalledWith(
        "user-1",
        "role-1",
        "hotel-1",
        { month: "2026-11", targetAmount: 150000000 },
      );

      await controller.upsertRevenueTarget(req as never, "hotel-1", {
        month: "2026-11",
        targetAmount: 0,
      });
      expect(mockHotelReportsService.upsertRevenueTarget).toHaveBeenLastCalledWith(
        "user-1",
        "role-1",
        "hotel-1",
        { month: "2026-11", targetAmount: 0 },
      );
    });

    it.each([
      { month: "2026-13", targetAmount: 1000000 },
      { month: "2026-00", targetAmount: 1000000 },
      { month: "11-2026", targetAmount: 1000000 },
      { month: "2026-11", targetAmount: -1 },
      { month: "2026-11", targetAmount: 10_000_000_000 },
      { month: "2026-11", targetAmount: 1000000, extra: true },
    ])("từ chối payload không hợp lệ %j bằng BadRequestException", async (invalidBody) => {
      const req = { user: { userId: "user-1", roleId: "role-1" } };

      await expect(
        controller.upsertRevenueTarget(req as never, "hotel-1", invalidBody),
      ).rejects.toThrow(BadRequestException);
      expect(mockHotelReportsService.upsertRevenueTarget).not.toHaveBeenCalled();
    });
  });
});
