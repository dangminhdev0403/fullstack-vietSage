import { BadRequestException } from "@nestjs/common";
import { ServicePortalController } from "../api/service-portal.controller";
import type { ServicePortalService } from "../application/service-portal.service";
import type { MarketplaceOrderService } from "../application/marketplace-order.service";
import type { ServiceItemImportService } from "../application/service-item-import.service";
import type { RequestRealtimeTicketService } from "../../request-realtime/application/request-realtime-ticket.service";

describe("ServicePortalController", () => {
  let controller: ServicePortalController;
  let service: jest.Mocked<Partial<ServicePortalService>>;
  let orders: jest.Mocked<Partial<MarketplaceOrderService>>;
  let imports: jest.Mocked<Partial<ServiceItemImportService>>;
  let tickets: jest.Mocked<Partial<RequestRealtimeTicketService>>;

  const fakeReq = {
    user: { userId: "user-123" },
  } as any;

  beforeEach(() => {
    service = {};
    orders = {
      verifyVoucher: jest.fn().mockResolvedValue({ valid: true } as any),
      redeemVoucher: jest.fn().mockResolvedValue({ redeemed: true } as any),
    };
    imports = {
      preview: jest.fn().mockResolvedValue({ summary: {} } as any),
      commit: jest.fn().mockResolvedValue({ applied: true } as any),
    };
    tickets = {};

    controller = new ServicePortalController(
      service as unknown as ServicePortalService,
      orders as unknown as MarketplaceOrderService,
      imports as unknown as ServiceItemImportService,
      tickets as unknown as RequestRealtimeTicketService,
    );
  });

  describe("previewImport", () => {
    it("parses valid csv and optional fileName with parseWithZod", async () => {
      await controller.previewImport(fakeReq, { csv: "col1,col2\nval1,val2" });
      expect(imports.preview).toHaveBeenCalledWith("user-123", "col1,col2\nval1,val2", "service-items.csv");
    });

    it("accepts custom fileName", async () => {
      await controller.previewImport(fakeReq, {
        csv: "col1,col2\nval1,val2",
        fileName: "custom.csv",
      });
      expect(imports.preview).toHaveBeenCalledWith("user-123", "col1,col2\nval1,val2", "custom.csv");
    });

    it("rejects empty or whitespace csv", () => {
      expect(() => controller.previewImport(fakeReq, { csv: "" })).toThrow(BadRequestException);
      expect(() => controller.previewImport(fakeReq, { csv: "   " })).toThrow(BadRequestException);
      expect(() => controller.previewImport(fakeReq, {})).toThrow(BadRequestException);
    });
  });

  describe("commitImport", () => {
    it("parses valid csv, previewToken, and optional fileName with parseWithZod", async () => {
      await controller.commitImport(fakeReq, {
        csv: "col1,col2\nval1,val2",
        previewToken: "tok-123",
      });
      expect(imports.commit).toHaveBeenCalledWith(
        "user-123",
        "col1,col2\nval1,val2",
        "tok-123",
        "service-items.csv",
      );
    });

    it("rejects missing previewToken", () => {
      expect(() =>
        controller.commitImport(fakeReq, {
          csv: "col1,col2\nval1,val2",
        }),
      ).toThrow(BadRequestException);
    });

    it("rejects empty previewToken", () => {
      expect(() =>
        controller.commitImport(fakeReq, {
          csv: "col1,col2\nval1,val2",
          previewToken: "   ",
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe("verifyVoucher", () => {
    it("parses and trims voucher code", async () => {
      await controller.verifyVoucher(fakeReq, { code: "  VS-ABC123XYZ  " });
      expect(orders.verifyVoucher).toHaveBeenCalledWith("user-123", "VS-ABC123XYZ");
    });

    it("rejects empty or missing code", () => {
      expect(() => controller.verifyVoucher(fakeReq, { code: "" })).toThrow(BadRequestException);
      expect(() => controller.verifyVoucher(fakeReq, { code: "   " })).toThrow(BadRequestException);
      expect(() => controller.verifyVoucher(fakeReq, {})).toThrow(BadRequestException);
      expect(() => controller.verifyVoucher(fakeReq, null)).toThrow(BadRequestException);
    });
  });

  describe("redeemVoucher", () => {
    it("parses and trims voucher code", async () => {
      await controller.redeemVoucher(fakeReq, { code: "  VS-ABC123XYZ  " });
      expect(orders.redeemVoucher).toHaveBeenCalledWith("user-123", "VS-ABC123XYZ");
    });

    it("rejects empty or missing code", () => {
      expect(() => controller.redeemVoucher(fakeReq, { code: "" })).toThrow(BadRequestException);
      expect(() => controller.redeemVoucher(fakeReq, { code: "   " })).toThrow(BadRequestException);
      expect(() => controller.redeemVoucher(fakeReq, {})).toThrow(BadRequestException);
      expect(() => controller.redeemVoucher(fakeReq, null)).toThrow(BadRequestException);
    });
  });
});
