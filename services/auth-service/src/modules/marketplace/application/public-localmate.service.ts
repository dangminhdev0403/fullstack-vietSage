import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { LocalMateService } from "../../localmate/application/localmate.service";
import type { PublicLocalMateOrderRequest } from "../domain/marketplace-order.schema";
import type {
  ListMarketplaceConversationMessagesQuery,
  SendMarketplaceConversationMessageInput,
} from "../domain/marketplace-conversation.schema";
import { MarketplaceConversationService } from "./marketplace-conversation.service";
import { MarketplaceOrderService } from "./marketplace-order.service";

export type CreatePublicLocalMateSession = {
  location: string;
  guestDisplayName?: string | null;
  guestPhone?: string | null;
};

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PublicLocalMateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly localMate: LocalMateService,
    private readonly orders: MarketplaceOrderService,
    private readonly conversations: MarketplaceConversationService,
  ) {}

  async createSession(input: CreatePublicLocalMateSession, previousToken?: string) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const normalizedPreviousToken = previousToken?.trim();
    const previousTokenHash =
      normalizedPreviousToken && /^[A-Za-z0-9_-]{40,64}$/.test(normalizedPreviousToken)
        ? this.hashToken(normalizedPreviousToken)
        : null;
    const session = await this.prisma.$transaction(async (tx) => {
      const previousSession = previousTokenHash
        ? await tx.publicLocalMateSession.findUnique({
            where: { tokenHash: previousTokenHash },
            select: {
              id: true,
              expiresAt: true,
              revokedAt: true,
              location: true,
              guestDisplayName: true,
              guestPhone: true,
              orders: { select: { id: true }, take: 1 },
            },
          })
        : null;

      if (previousSession && !previousSession.revokedAt && previousSession.expiresAt > new Date()) {
        if (previousSession.orders.length > 0) {
          await tx.publicLocalMateSession.update({
            where: { id: previousSession.id },
            data: { revokedAt: new Date() },
          });
          return tx.publicLocalMateSession.create({
            data: {
              tokenHash: this.hashToken(token),
              location: input.location,
              guestDisplayName: input.guestDisplayName?.trim() || null,
              guestPhone: input.guestPhone?.trim() || null,
              expiresAt,
            },
            select: { id: true },
          });
        }

        return tx.publicLocalMateSession.update({
          where: { id: previousSession.id },
          data: {
            tokenHash: this.hashToken(token),
            location: input.location,
            guestDisplayName: input.guestDisplayName?.trim() ?? previousSession.guestDisplayName,
            guestPhone: input.guestPhone?.trim() ?? previousSession.guestPhone,
            expiresAt,
          },
          select: { id: true },
        });
      }

      return tx.publicLocalMateSession.create({
        data: {
          tokenHash: this.hashToken(token),
          location: input.location,
          guestDisplayName: input.guestDisplayName?.trim() || null,
          guestPhone: input.guestPhone?.trim() || null,
          expiresAt,
        },
        select: { id: true },
      });
    });
    return { token, sessionId: session.id, expiresAt: expiresAt.toISOString() };
  }

  async createOrder(token: string | undefined, input: PublicLocalMateOrderRequest) {
    const session = await this.requireSession(token, { requireIdentity: true });
    const candidate = await this.localMate.resolveBookingCandidate({
      candidateKey: input.candidateKey,
      location: session.location,
    });
    if (!candidate.telegramReady) {
      throw new ConflictException("Hướng dẫn viên chưa sẵn sàng nhận yêu cầu qua Telegram");
    }

    return this.orders.createGuestOrder(
      {
        publicSessionId: session.id,
        location: session.location,
        guestDisplayName: session.guestDisplayName!,
        guestPhone: session.guestPhone!,
      },
      {
        serviceId: candidate.service.id,
        quantity: input.quantity,
        requestedStartAt: input.requestedStartAt,
        partySize: input.partySize,
        guestNote: input.guestNote,
        idempotencyKey: input.idempotencyKey,
      },
    );
  }

  async getCandidate(token: string | undefined, candidateKey: string) {
    const session = await this.requireSession(token, { requireIdentity: false });
    return this.localMate.resolveBookingCandidate({
      candidateKey,
      location: session.location,
    });
  }

  async getOrder(token: string | undefined, orderId: string) {
    const session = await this.requireSession(token, { requireIdentity: false });
    return this.orders.publicOrder(session.id, orderId);
  }

  async createPaymentSession(token: string | undefined, orderId: string) {
    const session = await this.requireSession(token, { requireIdentity: false });
    return this.orders.createPublicPaymentSession(session.id, orderId);
  }

  async getConversation(
    token: string | undefined,
    orderId: string,
    query: ListMarketplaceConversationMessagesQuery,
  ) {
    const session = await this.requireSession(token, { requireIdentity: false });
    return this.conversations.getConversation({ publicSessionId: session.id }, orderId, query);
  }

  async sendMessage(
    token: string | undefined,
    orderId: string,
    input: SendMarketplaceConversationMessageInput,
  ) {
    const session = await this.requireSession(token, { requireIdentity: false });
    return this.conversations.sendGuestMessage({ publicSessionId: session.id }, orderId, input);
  }

  private async requireSession(
    token: string | undefined,
    options: { requireIdentity?: boolean } = {},
  ) {
    const normalized = token?.trim();
    if (!normalized || !/^[A-Za-z0-9_-]{40,64}$/.test(normalized)) {
      throw new UnauthorizedException("Public LocalMate session token is missing or invalid");
    }
    const session = await this.prisma.publicLocalMateSession.findUnique({
      where: { tokenHash: this.hashToken(normalized) },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException("Public LocalMate session has expired or was revoked");
    }
    if (options.requireIdentity && (!session.guestDisplayName || !session.guestPhone)) {
      throw new UnauthorizedException("Public LocalMate session identity is incomplete");
    }
    return session;
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
