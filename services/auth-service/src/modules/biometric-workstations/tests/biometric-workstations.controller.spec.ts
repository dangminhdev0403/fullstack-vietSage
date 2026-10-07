import { BadRequestException } from "@nestjs/common";
import { BiometricWorkstationsController } from "../api/biometric-workstations.controller";
import type { BiometricWorkstationsService } from "../application/biometric-workstations.service";
import type { HotelAccessService } from "../../property/application/hotel-access.service";

describe("BiometricWorkstationsController", () => {
  let controller: BiometricWorkstationsController;
  let service: jest.Mocked<Partial<BiometricWorkstationsService>>;
  let hotelAccessService: jest.Mocked<Partial<HotelAccessService>>;

  beforeEach(() => {
    service = {
      pair: jest.fn().mockResolvedValue({ token: "workstation-token", hotelId: "hotel-1" }),
    };
    hotelAccessService = {
      assertHotelAccess: jest.fn().mockResolvedValue(undefined),
    };
    controller = new BiometricWorkstationsController(
      service as unknown as BiometricWorkstationsService,
      hotelAccessService as unknown as HotelAccessService,
    );
  });

  describe("pair", () => {
    it("parses valid pairing code with parseWithZod", async () => {
      const result = await controller.pair({ code: "PAIR-123456" });
      expect(service.pair).toHaveBeenCalledWith("PAIR-123456");
      expect(result).toEqual({ token: "workstation-token", hotelId: "hotel-1" });
    });

    it("trims whitespace from pairing code", async () => {
      await controller.pair({ code: "  PAIR-123456  " });
      expect(service.pair).toHaveBeenCalledWith("PAIR-123456");
    });

    it("rejects empty pairing code", () => {
      expect(() => controller.pair({ code: "" })).toThrow(BadRequestException);
      expect(() => controller.pair({ code: "   " })).toThrow(BadRequestException);
    });

    it("rejects non-object or missing code", () => {
      expect(() => controller.pair(null)).toThrow(BadRequestException);
      expect(() => controller.pair({})).toThrow(BadRequestException);
      expect(() => controller.pair({ code: 123 })).toThrow(BadRequestException);
    });

    it("rejects unexpected properties due to strict schema", () => {
      expect(() => controller.pair({ code: "PAIR-123", extra: "forbidden" })).toThrow(
        BadRequestException,
      );
    });
  });
});
