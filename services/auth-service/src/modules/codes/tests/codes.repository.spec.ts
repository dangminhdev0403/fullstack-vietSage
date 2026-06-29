import { PrismaService } from "../../../prisma/prisma.service";
import { CodesRepository } from "../codes.repository";

describe("CodesRepository", () => {
  it("generates through a transaction with a locked sequence row", async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: "code-1",
          name: "HOTEL",
          sequenceNext: 1,
        },
      ]),
      code: {
        update: jest.fn().mockResolvedValue({ id: "code-1" }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
      ),
    };
    const repository = new CodesRepository(prisma as unknown as PrismaService);

    const result = await repository.generateEntityCode("HOTEL");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transactionClient.code.update).toHaveBeenCalledWith({
      where: { id: "code-1" },
      data: { sequenceNext: { increment: 1 } },
      select: { id: true },
    });
    expect(result).toMatchObject({ name: "HOTEL", sequenceNext: 1 });
  });
});
