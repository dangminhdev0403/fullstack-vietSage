import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { MarketplaceOrderStatus } from "@prisma/client";
import { PublicLocalMateService } from "../application/public-localmate.service";

const proposal = {
  id: "proposal-1",
  publicSessionId: "pub-session-123",
  tourCode: "tour-ha-noi-1d",
  query: "Hà Nội 1 ngày",
  knowledgeVersion: "sha256:knowledge-v1",
  version: 1,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 100_000),
};
const candidate = {
  id: "candidate-1",
  publicSessionId: "pub-session-123",
  proposalId: proposal.id,
  proposalVersion: proposal.version,
  guideCode: "LM-HN-001",
  version: 1,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 100_000),
};
const proposalKey = `trip_${proposal.tourCode}`;
const candidateKey = `cand_${candidate.guideCode}`;
const knowledge = {
  knowledgeVersion: proposal.knowledgeVersion,
  tours: [
    {
      tourCode: proposal.tourCode,
      title: "Hà Nội di sản 1 ngày",
      duration: "1 ngày",
      highlights: ["Hồ Gươm", "Văn Miếu"],
      provinceCode: "HA_NOI",
      province: "Hà Nội",
      suitableGuides: [{ guideCode: candidate.guideCode, fullName: "Nguyễn Văn Minh" }],
    },
  ],
};

describe("PublicLocalMateService", () => {
  let service: PublicLocalMateService;
  let prisma: any;
  let localMate: any;
  let orders: any;
  let conversations: any;

  beforeEach(() => {
    prisma = {
      publicLocalMateSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      publicLocalMateProposal: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(proposal),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      publicLocalMateCandidate: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(candidate),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    localMate = {
      getKnowledge: jest.fn().mockResolvedValue(knowledge),
      resolveBookingCandidate: jest.fn(),
    };
    orders = {
      createGuestOrder: jest.fn(),
      publicOrder: jest.fn(),
      createPublicPaymentSession: jest.fn(),
    };
    conversations = {
      getConversation: jest.fn(),
      sendGuestMessage: jest.fn(),
    };
    service = new PublicLocalMateService(prisma, localMate, orders, conversations);
  });

  describe("createSession", () => {
    it("generates a random token, stores its SHA-256 hash in DB, and returns token + sessionId", async () => {
      prisma.publicLocalMateSession.create.mockResolvedValue({ id: "pub-session-1" });

      const result = await service.createSession({
        location: "Hà Nội",
        guestDisplayName: "Nguyễn Văn A",
        guestPhone: "0901234567",
      });

      expect(result.sessionId).toBe("pub-session-1");
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThanOrEqual(40);
      expect(result.expiresAt).toBeDefined();

      const expectedHash = createHash("sha256").update(result.token).digest("hex");
      expect(prisma.publicLocalMateSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokenHash: expectedHash,
          location: "Hà Nội",
          guestDisplayName: "Nguyễn Văn A",
          guestPhone: "0901234567",
        }),
        select: { id: true },
      });
    });

    it("atomically rotates a valid token while preserving public session ownership when no orders exist", async () => {
      const previousToken = "p".repeat(43);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-1",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        location: "Hà Nội",
        guestDisplayName: null,
        guestPhone: null,
        orders: [],
      });
      prisma.publicLocalMateSession.update.mockResolvedValue({ id: "pub-session-1" });

      const result = await service.createSession(
        {
          location: "Đà Nẵng",
          guestDisplayName: "Lê Văn B",
          guestPhone: "0912345678",
        },
        previousToken,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.publicLocalMateSession.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: createHash("sha256").update(previousToken).digest("hex") },
        select: {
          id: true,
          expiresAt: true,
          revokedAt: true,
          location: true,
          guestDisplayName: true,
          guestPhone: true,
          orders: { select: { id: true, status: true } },
        },
      });
      expect(prisma.publicLocalMateSession.update).toHaveBeenCalledWith({
        where: { id: "pub-session-1" },
        data: expect.objectContaining({
          tokenHash: createHash("sha256").update(result.token).digest("hex"),
          location: "Đà Nẵng",
          guestDisplayName: "Lê Văn B",
          guestPhone: "0912345678",
        }),
        select: { id: true },
      });
      expect(prisma.publicLocalMateSession.create).not.toHaveBeenCalled();
      expect(result.sessionId).toBe("pub-session-1");
    });

    it("preserves previous session and retains capability ownership when previous session has an active non-terminal order", async () => {
      const previousToken = "p".repeat(43);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-active",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        location: "Hà Nội",
        guestDisplayName: "Nguyễn Văn A",
        guestPhone: "0901234567",
        orders: [{ id: "order-active", status: MarketplaceOrderStatus.PENDING }],
      });
      prisma.publicLocalMateSession.update.mockResolvedValue({ id: "pub-session-active" });

      const result = await service.createSession(
        {
          location: "Đà Nẵng",
          guestDisplayName: "Nguyễn Văn A Updated",
          guestPhone: "0901234567",
        },
        previousToken,
      );

      // Must NOT create a new session
      expect(prisma.publicLocalMateSession.create).not.toHaveBeenCalled();
      // Must NOT revoke the existing session
      expect(prisma.publicLocalMateSession.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ revokedAt: expect.anything() }),
        }),
      );
      // Retains existing session ID and token capability
      expect(result.sessionId).toBe("pub-session-active");
      expect(result.token).toBe(previousToken);
      expect(prisma.publicLocalMateSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pub-session-active" },
          data: expect.objectContaining({
            location: "Đà Nẵng",
            guestDisplayName: "Nguyễn Văn A Updated",
          }),
        }),
      );
    });

    it("atomically revokes previous session and creates a fresh session if previous session has only terminal orders", async () => {
      const previousToken = "p".repeat(43);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-terminal",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        location: "Hà Nội",
        guestDisplayName: "Nguyễn Văn A",
        guestPhone: "0901234567",
        orders: [{ id: "order-completed", status: MarketplaceOrderStatus.COMPLETED }],
      });
      prisma.publicLocalMateSession.update.mockResolvedValue({ id: "pub-session-terminal" });
      prisma.publicLocalMateSession.create.mockResolvedValue({ id: "pub-session-new" });

      const result = await service.createSession(
        {
          location: "Đà Nẵng",
          guestDisplayName: "Lê Văn B",
          guestPhone: "0912345678",
        },
        previousToken,
      );

      expect(prisma.publicLocalMateSession.update).toHaveBeenCalledWith({
        where: { id: "pub-session-terminal" },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.publicLocalMateSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokenHash: createHash("sha256").update(result.token).digest("hex"),
          location: "Đà Nẵng",
          guestDisplayName: "Lê Văn B",
          guestPhone: "0912345678",
        }),
        select: { id: true },
      });
      expect(result.sessionId).toBe("pub-session-new");
    });
  });

  describe("requireSession validation", () => {
    it("throws UnauthorizedException if token is missing or malformed", async () => {
      await expect(service.getOrder(undefined, "order-1")).rejects.toThrow(UnauthorizedException);
      await expect(service.getOrder("short", "order-1")).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException if token hash is not found in DB", async () => {
      prisma.publicLocalMateSession.findUnique.mockResolvedValue(null);
      const token = "a".repeat(45);

      await expect(service.getOrder(token, "order-1")).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException if session is revoked", async () => {
      const token = "a".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-1",
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
        guestDisplayName: "Guest",
        guestPhone: "0901234567",
      });

      await expect(service.getOrder(token, "order-1")).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException if session is expired", async () => {
      const token = "a".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        guestDisplayName: "Guest",
        guestPhone: "0901234567",
      });

      await expect(service.getOrder(token, "order-1")).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("createOrder", () => {
    it("resolves the session-bound selection and stores the canonical trip snapshot", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Hà Nội",
        guestDisplayName: "Lê Văn B",
        guestPhone: " 0912345678 ",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      localMate.resolveBookingCandidate.mockResolvedValue({
        candidateKey,
        telegramReady: true,
        service: { id: "srv-456" },
      });
      orders.createGuestOrder.mockResolvedValue({ id: "order-999" });

      const result = await service.createOrder(token, {
        proposalKey,
        candidateKey,
        partySize: 2,
        idempotencyKey: "idem-key-123456",
      });

      expect(localMate.resolveBookingCandidate).toHaveBeenCalledWith({
        candidateKey,
        location: "Hà Nội",
      });
      expect(orders.createGuestOrder).toHaveBeenCalledWith(
        {
          publicSessionId: "pub-session-123",
          location: "Hà Nội",
          guestDisplayName: "Lê Văn B",
          guestPhone: "0912345678",
        },
        {
          serviceId: "srv-456",
          quantity: 2,
          requestedStartAt: null,
          partySize: 2,
          guestNote: null,
          idempotencyKey: "idem-key-123456",
        },
        {
          knowledgeVersion: proposal.knowledgeVersion,
          tourCode: proposal.tourCode,
          title: "Hà Nội di sản 1 ngày",
          duration: "1 ngày",
          highlights: ["Hồ Gươm", "Văn Miếu"],
          provinceCode: "HA_NOI",
          province: "Hà Nội",
        },
      );
      expect(result).toEqual({ id: "order-999" });
    });

    it("throws ConflictException if guide is not telegramReady", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Hà Nội",
        guestDisplayName: "Lê Văn B",
        guestPhone: "0912345678",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      localMate.resolveBookingCandidate.mockResolvedValue({
        candidateKey,
        telegramReady: false,
        service: { id: "srv-456" },
      });

      await expect(
        service.createOrder(token, {
          proposalKey,
          candidateKey,
          partySize: 1,
          idempotencyKey: "idem-key-123456",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("throws UnauthorizedException if session identity is incomplete", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-provisional",
        location: "Hà Nội",
        guestDisplayName: null,
        guestPhone: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.createOrder(token, {
          proposalKey,
          candidateKey,
          partySize: 1,
          idempotencyKey: "idem-key-123456",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException if guestPhone is missing or empty when requireIdentity is true", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-missing-phone",
        location: "Hà Nội",
        guestDisplayName: "Lê Văn B",
        guestPhone: "   ",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.createOrder(token, {
          proposalKey,
          candidateKey,
          partySize: 2,
          idempotencyKey: "idem-key-123456",
        }),
      ).rejects.toThrow(UnauthorizedException);

      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-null-phone",
        location: "Hà Nội",
        guestDisplayName: "Lê Văn B",
        guestPhone: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.createOrder(token, {
          proposalKey,
          candidateKey,
          partySize: 2,
          idempotencyKey: "idem-key-123456",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException if guestPhone is malformed", async () => {
      const token = "b".repeat(45);
      const malformedPhones = ["abc", "123", "phone: 0901234567", "!@#$%^"];

      for (const badPhone of malformedPhones) {
        prisma.publicLocalMateSession.findUnique.mockResolvedValue({
          id: "pub-session-bad-phone",
          location: "Hà Nội",
          guestDisplayName: "Lê Văn B",
          guestPhone: badPhone,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 100000),
        });

        await expect(
          service.createOrder(token, {
            proposalKey,
            candidateKey,
            partySize: 2,
            idempotencyKey: "idem-key-123456",
          }),
        ).rejects.toThrow(UnauthorizedException);
      }
    });

    it("accepts valid phone numbers conforming to canonical format", async () => {
      const token = "b".repeat(45);
      const validPhones = ["0901234567", "+84901234567", "+1 555-0199", "+84 24 3825 0000"];

      localMate.resolveBookingCandidate.mockResolvedValue({
        candidateKey,
        telegramReady: true,
        service: { id: "srv-456" },
      });
      orders.createGuestOrder.mockResolvedValue({ id: "order-ok" });

      for (const goodPhone of validPhones) {
        prisma.publicLocalMateSession.findUnique.mockResolvedValue({
          id: "pub-session-good-phone",
          location: "Hà Nội",
          guestDisplayName: "Lê Văn B",
          guestPhone: goodPhone,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 100000),
        });

        const result = await service.createOrder(token, {
          proposalKey,
          candidateKey,
          partySize: 1,
          idempotencyKey: `idem-${goodPhone.replace(/\s+/g, "")}`,
        });
        expect(result).toEqual({ id: "order-ok" });
      }
    });
  });

  describe("listProposals", () => {
    it("returns session-bound proposal keys and actions without proposal DB rows", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Hà Nội",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });

      const result = await service.listProposals(token, {
        query: "Hà Nội 1 ngày",
        tourCodes: [proposal.tourCode],
      });

      expect(result.stage).toBe("PROPOSALS");
      expect(result.proposals[0].proposalKey).toBe(proposalKey);
      expect(result.actions[0].type).toBe("SELECT_PROPOSAL");
      expect(result.actions[0].proposalKey).toBe(proposalKey);
    });

    it("uses input location override over stale session location when listing proposals", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Hội An",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });

      await service.listProposals(token, {
        query: "Hà Nội 1 ngày",
        tourCodes: [proposal.tourCode],
        location: "Hà Nội",
      });

      expect(localMate.getKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: "Hà Nội",
        }),
      );
    });
  });

  describe("selectProposal", () => {
    it("returns guide selection stage with guide actions", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Hà Nội",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });

      const result = await service.selectProposal(token, proposalKey);
      expect(result.stage).toBe("GUIDE_SELECTION");
      expect(result.proposal.proposalKey).toBe(proposalKey);
      expect(result.actions.some((a) => a.type === "SELECT_GUIDE")).toBe(true);
    });
  });

  describe("getCandidate", () => {
    it("rejects candidate if guide does not belong to the proposal", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Hà Nội",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });

      await expect(service.getCandidate(token, proposalKey, "cand_UNKNOWN")).rejects.toThrow(
        ConflictException,
      );
      expect(localMate.resolveBookingCandidate).not.toHaveBeenCalled();
    });

    it("rejects proposal if tour is not in current location", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Hà Nội",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });

      await expect(service.getCandidate(token, "trip_unknown", candidateKey)).rejects.toThrow(
        ConflictException,
      );
      expect(localMate.resolveBookingCandidate).not.toHaveBeenCalled();
    });

    it("resolves candidate using session location", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Hà Nội",
        guestDisplayName: "Lê Văn B",
        guestPhone: "0912345678",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      localMate.resolveBookingCandidate.mockResolvedValue({
        candidateKey,
        telegramReady: true,
        guide: { fullName: "HDV Hà Nội" },
        service: { name: "Tour Hà Nội di sản", price: 600000 },
      });

      const result = await service.getCandidate(token, proposalKey, candidateKey);
      expect(localMate.resolveBookingCandidate).toHaveBeenCalledWith({
        candidateKey,
        location: "Hà Nội",
      });
      expect(result.guide.fullName).toBe("HDV Hà Nội");
      expect(result.tour.title).toBe("Hà Nội di sản 1 ngày");
    });

    it("resolves candidate for provisional session without guest identity", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-prov",
        location: "Hà Nội",
        guestDisplayName: null,
        guestPhone: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      localMate.resolveBookingCandidate.mockResolvedValue({
        candidateKey,
        telegramReady: true,
        guide: { fullName: "HDV Hà Nội" },
        service: { name: "Tour Hà Nội di sản", price: 600000 },
      });

      const result = await service.getCandidate(token, proposalKey, candidateKey);
      expect(localMate.resolveBookingCandidate).toHaveBeenCalledWith({
        candidateKey,
        location: "Hà Nội",
      });
      expect(result.guide.fullName).toBe("HDV Hà Nội");
    });
  });

  describe("getOrder and createPaymentSession", () => {
    it("scopes getOrder and createPaymentSession by publicSessionId", async () => {
      const token = "c".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-1",
        location: "Hà Nội",
        guestDisplayName: "Guest",
        guestPhone: "0900000000",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      orders.publicOrder.mockResolvedValue({ id: "ord-1", status: "PENDING" });
      orders.createPublicPaymentSession.mockResolvedValue({ payment: { status: "OPEN" } });

      const orderResult = await service.getOrder(token, "ord-1");
      expect(orders.publicOrder).toHaveBeenCalledWith("pub-session-1", "ord-1");
      expect(orderResult.id).toBe("ord-1");

      const paymentResult = await service.createPaymentSession(token, "ord-1");
      expect(orders.createPublicPaymentSession).toHaveBeenCalledWith("pub-session-1", "ord-1");
      expect(paymentResult.payment?.status).toBe("OPEN");
    });
  });

  describe("getConversation and sendMessage", () => {
    it("scopes conversations by publicSessionId", async () => {
      const token = "d".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-1",
        location: "Hà Nội",
        guestDisplayName: "Guest",
        guestPhone: "0900000000",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      conversations.getConversation.mockResolvedValue({ id: "conv-1", items: [] });
      conversations.sendGuestMessage.mockResolvedValue({ id: "msg-1" });

      const conv = await service.getConversation(token, "ord-1", { limit: 20 });
      expect(conversations.getConversation).toHaveBeenCalledWith(
        { publicSessionId: "pub-session-1" },
        "ord-1",
        { limit: 20 },
      );
      expect(conv.id).toBe("conv-1");

      const msg = await service.sendMessage(token, "ord-1", {
        body: "Hello",
        clientMessageId: "cid-1",
      });
      expect(conversations.sendGuestMessage).toHaveBeenCalledWith(
        { publicSessionId: "pub-session-1" },
        "ord-1",
        { body: "Hello", clientMessageId: "cid-1" },
      );
      expect(msg.id).toBe("msg-1");
    });
  });

  describe("simulatePayment removal", () => {
    it("does not expose simulatePayment on PublicLocalMateService", () => {
      expect((service as any).simulatePayment).toBeUndefined();
    });
  });
});
