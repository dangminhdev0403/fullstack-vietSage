import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PublicLocalMateService } from "../application/public-localmate.service";

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
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    localMate = {
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
          orders: { select: { id: true }, take: 1 },
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

    it("atomically revokes previous session and creates a fresh session if previous session has existing orders", async () => {
      const previousToken = "p".repeat(43);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-old",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        location: "Hà Nội",
        guestDisplayName: "Nguyễn Văn A",
        guestPhone: "0901234567",
        orders: [{ id: "order-previous" }],
      });
      prisma.publicLocalMateSession.update.mockResolvedValue({ id: "pub-session-old" });
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
        where: { id: "pub-session-old" },
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
    it("resolves candidate with session location and delegates to orders.createGuestOrder", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Đà Nẵng",
        guestDisplayName: "Lê Văn B",
        guestPhone: "0912345678",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      localMate.resolveBookingCandidate.mockResolvedValue({
        telegramReady: true,
        service: { id: "srv-456" },
      });

      orders.createGuestOrder.mockResolvedValue({ id: "order-999" });

      const result = await service.createOrder(token, {
        candidateKey: "cand_abc123",
        quantity: 2,
        requestedStartAt: "2026-10-10T09:00:00.000Z",
        partySize: 2,
        guestNote: "Không cay",
        idempotencyKey: "idem-key-123456",
      });

      expect(localMate.resolveBookingCandidate).toHaveBeenCalledWith({
        candidateKey: "cand_abc123",
        location: "Đà Nẵng",
      });

      expect(orders.createGuestOrder).toHaveBeenCalledWith(
        {
          publicSessionId: "pub-session-123",
          location: "Đà Nẵng",
          guestDisplayName: "Lê Văn B",
          guestPhone: "0912345678",
        },
        {
          serviceId: "srv-456",
          quantity: 2,
          requestedStartAt: "2026-10-10T09:00:00.000Z",
          partySize: 2,
          guestNote: "Không cay",
          idempotencyKey: "idem-key-123456",
        },
      );
      expect(result).toEqual({ id: "order-999" });
    });

    it("throws ConflictException if guide is not telegramReady", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Đà Nẵng",
        guestDisplayName: "Lê Văn B",
        guestPhone: "0912345678",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      localMate.resolveBookingCandidate.mockResolvedValue({
        telegramReady: false,
        service: { id: "srv-456" },
      });

      await expect(
        service.createOrder(token, {
          candidateKey: "cand_abc123",
          quantity: 1,
          idempotencyKey: "idem-key-123456",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("throws UnauthorizedException if session identity is incomplete", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-provisional",
        location: "Đà Nẵng",
        guestDisplayName: null,
        guestPhone: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.createOrder(token, {
          candidateKey: "cand_abc123",
          quantity: 1,
          idempotencyKey: "idem-key-123456",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("getCandidate", () => {
    it("resolves candidate using session location", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-123",
        location: "Đà Nẵng",
        guestDisplayName: "Lê Văn B",
        guestPhone: "0912345678",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      localMate.resolveBookingCandidate.mockResolvedValue({
        candidateKey: "cand_abc123",
        telegramReady: true,
        guide: { fullName: "HDV Đà Nẵng" },
        service: { name: "Tour Ngũ Hành Sơn", price: 600000 },
      });

      const result = await service.getCandidate(token, "cand_abc123");
      expect(localMate.resolveBookingCandidate).toHaveBeenCalledWith({
        candidateKey: "cand_abc123",
        location: "Đà Nẵng",
      });
      expect(result.guide.fullName).toBe("HDV Đà Nẵng");
    });

    it("resolves candidate for provisional session without guest identity", async () => {
      const token = "b".repeat(45);
      prisma.publicLocalMateSession.findUnique.mockResolvedValue({
        id: "pub-session-prov",
        location: "Huế",
        guestDisplayName: null,
        guestPhone: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      localMate.resolveBookingCandidate.mockResolvedValue({
        candidateKey: "cand_hue_1",
        telegramReady: true,
        guide: { fullName: "HDV Huế" },
        service: { name: "Tour Đại Nội", price: 500000 },
      });

      const result = await service.getCandidate(token, "cand_hue_1");
      expect(localMate.resolveBookingCandidate).toHaveBeenCalledWith({
        candidateKey: "cand_hue_1",
        location: "Huế",
      });
      expect(result.guide.fullName).toBe("HDV Huế");
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
});
