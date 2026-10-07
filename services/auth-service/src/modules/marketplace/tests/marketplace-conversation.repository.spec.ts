import { Prisma } from "@prisma/client";
import { MarketplaceConversationRepository } from "../infrastructure/marketplace-conversation.repository";

describe("MarketplaceConversationRepository", () => {
  let repo: MarketplaceConversationRepository;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      marketplaceConversation: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      marketplaceConversationMessage: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };
    repo = new MarketplaceConversationRepository(mockPrisma);
  });

  describe("findOrCreateConversation", () => {
    it("returns existing conversation when already present", async () => {
      const existingConv = {
        id: "conv-1",
        orderId: "order-1",
        status: "ACTIVE",
      };
      mockPrisma.marketplaceConversation.findUnique.mockResolvedValue(existingConv);

      const result = await repo.findOrCreateConversation("order-1", {
        serviceTenantId: "tenant-1",
      });

      expect(result).toBe(existingConv);
      expect(mockPrisma.marketplaceConversation.create).not.toHaveBeenCalled();
    });

    it("creates conversation when not present", async () => {
      mockPrisma.marketplaceConversation.findUnique.mockResolvedValue(null);
      const createdConv = {
        id: "conv-new",
        orderId: "order-1",
        status: "ACTIVE",
      };
      mockPrisma.marketplaceConversation.create.mockResolvedValue(createdConv);

      const result = await repo.findOrCreateConversation("order-1", {
        serviceTenantId: "tenant-1",
      });

      expect(result).toBe(createdConv);
      expect(mockPrisma.marketplaceConversation.create).toHaveBeenCalled();
    });

    it("resolves existing row when concurrent creation hits P2002 unique constraint race", async () => {
      // First findUnique returns null (race condition window)
      mockPrisma.marketplaceConversation.findUnique.mockResolvedValueOnce(null);

      // Concurrent insert wins and create throws P2002
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`orderId`)",
        {
          code: "P2002",
          clientVersion: "5.0.0",
        },
      );
      mockPrisma.marketplaceConversation.create.mockRejectedValue(p2002Error);

      // Subsequent findUnique recovers the conversation created concurrently
      const concurrentConv = {
        id: "conv-concurrent",
        orderId: "order-1",
        status: "ACTIVE",
      };
      mockPrisma.marketplaceConversation.findUnique.mockResolvedValueOnce(concurrentConv);

      const result = await repo.findOrCreateConversation("order-1", {
        serviceTenantId: "tenant-1",
      });

      expect(result).toBe(concurrentConv);
      expect(mockPrisma.marketplaceConversation.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
