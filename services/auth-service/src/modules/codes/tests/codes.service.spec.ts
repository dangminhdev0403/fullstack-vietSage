import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CodesRepository } from "../codes.repository";
import { CodesService } from "../codes.service";

describe("CodesService", () => {
  let service: CodesService;
  let codesRepository: {
    generateEntityCode: jest.Mock;
  };

  beforeEach(() => {
    codesRepository = {
      generateEntityCode: jest.fn().mockResolvedValue({
        id: "code-1",
        name: "ROOM",
        sequenceNext: 25,
      }),
    };

    service = new CodesService(codesRepository as unknown as CodesRepository);
  });

  it("generates entity code from the reserved sequence row", async () => {
    const result = await service.generateEntityCode(" room ");

    expect(codesRepository.generateEntityCode).toHaveBeenCalledWith("ROOM", undefined);
    expect(result).toBe("VSH_ROOM_0025");
  });

  it("uses provided transaction for code generation", async () => {
    const tx = {} as Prisma.TransactionClient;

    await service.generateEntityCode("ROOM", tx);

    expect(codesRepository.generateEntityCode).toHaveBeenCalledWith("ROOM", tx);
  });

  it("throws not found when active sequence is missing", async () => {
    codesRepository.generateEntityCode.mockResolvedValue(null);

    await expect(service.generateEntityCode("AIRPORT")).rejects.toBeInstanceOf(NotFoundException);
  });
});
