import { BadRequestException } from "@nestjs/common";
import { HotelReportsController } from "../api/hotel-reports.controller";

describe("HotelReportsController", () => {
  const mockHotelReportsService = {
    getReports: jest.fn(),
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
});
