import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import {
  MarketplaceGuideNotificationStatus,
  MarketplaceOrderPaymentStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { LocalMateService } from "../../localmate/application/localmate.service";
import { LocalMatePaymentsService } from "../../localmate-payments/application/localmate-payments.service";
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

export type ListPublicLocalMateProposals = {
  query?: string;
  tourCodes?: string[];
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

  async listProposals(token: string | undefined, input: ListPublicLocalMateProposals) {
    const session = await this.requireSession(token);
    const knowledge = await this.localMate.getKnowledge({
      query: input.query?.trim() || undefined,
      destination: session.location,
      limit: 5,
    });
    const requested = new Set((input.tourCodes ?? []).slice(0, 5));
    const proposals = knowledge.tours
      .filter((tour) => requested.size === 0 || requested.has(tour.tourCode))
      .slice(0, 3)
      .map((tour) => ({
        proposalKey: `trip_${tour.tourCode}`,
        title: tour.title,
        location: tour.province || session.location,
        duration: tour.duration,
        highlights: tour.highlights.slice(0, 8),
        bookable: tour.bookable,
        availableGuideCount: tour.suitableGuides.length,
        selected: false,
      }));

    return {
      stage: proposals.length > 0 ? ("PROPOSALS" as const) : ("DISCOVERY" as const),
      proposals,
      actions: proposals.map((proposal) => ({
        type: "SELECT_PROPOSAL" as const,
        proposalKey: proposal.proposalKey,
        label: `Chọn lịch trình: ${proposal.title}`,
      })),
      knowledgeVersion: knowledge.knowledgeVersion,
    };
  }

  async selectProposal(token: string | undefined, proposalKey: string) {
    const session = await this.requireSession(token);
    const tour = await this.resolveProposal(session.location, proposalKey);
    const guideActions = tour.suitableGuides.map((guide) => ({
      type: "SELECT_GUIDE" as const,
      proposalKey,
      candidateKey: `cand_${guide.guideCode}`,
      label: `Chọn Hướng dẫn viên ${guide.fullName}`,
      guideName: guide.fullName,
    }));

    return {
      stage: "GUIDE_SELECTION" as const,
      proposal: {
        proposalKey,
        title: tour.title,
        location: tour.province || session.location,
        duration: tour.duration,
        highlights: tour.highlights.slice(0, 8),
        bookable: guideActions.length > 0,
        availableGuideCount: guideActions.length,
        selected: true,
      },
      actions: [
        ...guideActions,
        { type: "REFINE_PROPOSAL" as const, proposalKey, label: "Tùy chỉnh lịch trình" },
        { type: "SHOW_ALTERNATIVES" as const, label: "Xem lịch trình khác" },
      ],
    };
  }

  async createOrder(token: string | undefined, input: PublicLocalMateOrderRequest) {
    const session = await this.requireSession(token, { requireIdentity: true });
    const tour = await this.resolveSelection(session.location, input.proposalKey, input.candidateKey);
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
        guestPhone: session.guestPhone?.trim() || "Trao đổi qua Chat",
      },
      {
        serviceId: candidate.service.id,
        quantity: input.quantity,
        requestedStartAt: input.requestedStartAt,
        partySize: input.partySize,
        guestNote: input.guestNote,
        idempotencyKey: input.idempotencyKey,
      },
      {
        knowledgeVersion: tour.knowledgeVersion,
        tourCode: tour.tourCode,
        title: tour.title,
        duration: tour.duration,
        highlights: tour.highlights.slice(0, 12),
        provinceCode: tour.provinceCode,
        province: tour.province,
      },
    );
  }

  async getCandidate(
    token: string | undefined,
    proposalKey: string,
    candidateKey: string,
  ) {
    const session = await this.requireSession(token);
    const tour = await this.resolveSelection(session.location, proposalKey, candidateKey);
    const candidate = await this.localMate.resolveBookingCandidate({
      candidateKey,
      location: session.location,
    });
    return {
      ...candidate,
      proposalKey,
      candidateKey,
      tour: {
        title: tour.title,
        duration: tour.duration,
        highlights: tour.highlights.slice(0, 8),
      },
    };
  }

  async getOrder(token: string | undefined, orderId: string) {
    const session = await this.requireSession(token);
    return this.orders.publicOrder(session.id, orderId);
  }

  async createPaymentSession(token: string | undefined, orderId: string) {
    const session = await this.requireSession(token);
    return this.orders.createPublicPaymentSession(session.id, orderId);
  }

  async simulatePayment(token: string | undefined, orderId: string) {
    const session = await this.requireSession(token);
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: orderId, publicSessionId: session.id },
      include: { payment: true },
    });
    if (!order) {
      throw new ConflictException("Không tìm thấy đơn hàng");
    }

    if (order.payment) {
      await this.prisma.marketplaceOrderPayment.update({
        where: { id: order.payment.id },
        data: {
          status: MarketplaceOrderPaymentStatus.PAID,
          paidAt: new Date(),
          guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
          lastProviderErrorCode: null,
        },
      });
      LocalMatePaymentsService.notifyPaymentCompletedSafely(order.payment.id);
    }

    return this.orders.publicOrder(session.id, orderId);
  }

  async getConversation(
    token: string | undefined,
    orderId: string,
    query: ListMarketplaceConversationMessagesQuery,
  ) {
    const session = await this.requireSession(token);
    return this.conversations.getConversation({ publicSessionId: session.id }, orderId, query);
  }

  async sendMessage(
    token: string | undefined,
    orderId: string,
    input: SendMarketplaceConversationMessageInput,
  ) {
    const session = await this.requireSession(token);
    return this.conversations.sendGuestMessage({ publicSessionId: session.id }, orderId, input);
  }

  private async resolveSelection(location: string, proposalKey: string, candidateKey: string) {
    const tour = await this.resolveProposal(location, proposalKey);
    const guideCode = candidateKey.slice("cand_".length);
    if (!tour.suitableGuides.some((guide) => guide.guideCode === guideCode)) {
      throw new ConflictException("Hướng dẫn viên không thuộc lịch trình hoặc vị trí hiện tại");
    }
    return tour;
  }

  private async resolveProposal(location: string, proposalKey: string) {
    const tourCode = proposalKey.slice("trip_".length);
    const knowledge = await this.localMate.getKnowledge({ destination: location, limit: 10 });
    const tour = knowledge.tours.find((item) => item.tourCode === tourCode);
    if (!tour) {
      throw new ConflictException("Lịch trình không thuộc vị trí hiện tại hoặc không còn khả dụng");
    }
    return { ...tour, knowledgeVersion: knowledge.knowledgeVersion };
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
    if (options.requireIdentity && !session.guestDisplayName?.trim()) {
      throw new UnauthorizedException("Public LocalMate session identity is incomplete");
    }
    return session;
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
