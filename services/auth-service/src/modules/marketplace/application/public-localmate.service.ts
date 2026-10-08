import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { MarketplaceOrderStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { LocalMateService } from "../../localmate/application/localmate.service";
import {
  CANONICAL_PUBLIC_PHONE_REGEX,
  type PublicLocalMateOrderRequest,
} from "../domain/marketplace-order.schema";
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
  location?: string;
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
    return this.prisma.$transaction(async (tx) => {
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
              orders: { select: { id: true, status: true } },
            },
          })
        : null;

      if (previousSession && !previousSession.revokedAt && previousSession.expiresAt > new Date()) {
        const hasActiveNonTerminalOrder = previousSession.orders.some(
          (order) =>
            order.status !== MarketplaceOrderStatus.COMPLETED &&
            order.status !== MarketplaceOrderStatus.CANCELLED &&
            order.status !== MarketplaceOrderStatus.REJECTED,
        );

        if (hasActiveNonTerminalOrder) {
          // LM-04: Retain session capability and order ownership for non-terminal orders.
          // Do not revoke or overwrite tokenHash. Update location if provided so new discovery matches the selected region.
          const effectiveExpiresAt =
            expiresAt > previousSession.expiresAt ? expiresAt : previousSession.expiresAt;
          await tx.publicLocalMateSession.update({
            where: { id: previousSession.id },
            data: {
              location: input.location || previousSession.location,
              expiresAt: effectiveExpiresAt,
              guestDisplayName: input.guestDisplayName?.trim() ?? previousSession.guestDisplayName,
              guestPhone: input.guestPhone?.trim() ?? previousSession.guestPhone,
            },
            select: { id: true },
          });
          return {
            token: normalizedPreviousToken!,
            sessionId: previousSession.id,
            expiresAt: effectiveExpiresAt.toISOString(),
          };
        }

        if (previousSession.orders.length > 0) {
          // All past orders are terminal (completed/cancelled/rejected).
          // Safely retire the old session and start a fresh session for the new tour/chat lifecycle.
          await tx.publicLocalMateSession.update({
            where: { id: previousSession.id },
            data: { revokedAt: new Date() },
          });
          const newSession = await tx.publicLocalMateSession.create({
            data: {
              tokenHash: this.hashToken(token),
              location: input.location,
              guestDisplayName: input.guestDisplayName?.trim() || null,
              guestPhone: input.guestPhone?.trim() || null,
              expiresAt,
            },
            select: { id: true },
          });
          return {
            token,
            sessionId: newSession.id,
            expiresAt: expiresAt.toISOString(),
          };
        }

        // Early discovery with no orders: rotate token and update session in place.
        const updatedSession = await tx.publicLocalMateSession.update({
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
        return {
          token,
          sessionId: updatedSession.id,
          expiresAt: expiresAt.toISOString(),
        };
      }

      const createdSession = await tx.publicLocalMateSession.create({
        data: {
          tokenHash: this.hashToken(token),
          location: input.location,
          guestDisplayName: input.guestDisplayName?.trim() || null,
          guestPhone: input.guestPhone?.trim() || null,
          expiresAt,
        },
        select: { id: true },
      });
      return {
        token,
        sessionId: createdSession.id,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async listProposals(token: string | undefined, input: ListPublicLocalMateProposals) {
    const session = await this.requireSession(token);
    const targetDestination = input.location?.trim() || session.location;
    const knowledge = await this.localMate.getKnowledge({
      query: input.query?.trim() || undefined,
      destination: targetDestination,
      limit: 5,
    });
    const requested = new Set((input.tourCodes ?? []).slice(0, 5));
    const proposals = knowledge.tours
      .filter((tour) => requested.size === 0 || requested.has(tour.tourCode))
      .slice(0, 3)
      .map((tour) => ({
        proposalKey: `trip_${tour.tourCode}`,
        title: tour.title,
        location: tour.province || targetDestination,
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

  async selectProposal(token: string | undefined, proposalKey: string, location?: string) {
    const session = await this.requireSession(token);
    const targetLocation = location?.trim() || session.location;
    const tour = await this.resolveProposal(targetLocation, proposalKey);
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
        location: tour.province || targetLocation,
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
    const tour = await this.resolveSelection(
      session.location,
      input.proposalKey,
      input.candidateKey,
    );
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
        guestPhone: session.guestPhone!.trim(),
      },
      {
        serviceId: candidate.service.id,
        quantity:
          candidate.service.unit === "person" ||
          candidate.service.unit === "guest" ||
          candidate.service.unit === "pax"
            ? input.partySize
            : 1,
        requestedStartAt: null,
        partySize: input.partySize,
        guestNote: null,
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

  async getCandidate(token: string | undefined, proposalKey: string, candidateKey: string) {
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
    if (
      options.requireIdentity &&
      (!session.guestDisplayName?.trim() ||
        !session.guestPhone?.trim() ||
        !CANONICAL_PUBLIC_PHONE_REGEX.test(session.guestPhone.trim()))
    ) {
      throw new UnauthorizedException("Public LocalMate session identity is incomplete");
    }
    return session;
  }

  async getActiveSession(token: string | undefined) {
    if (!token) return null;
    const session = await this.requireSession(token).catch(() => null);
    if (!session) return null;

    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { publicSessionId: session.id },
      orderBy: { createdAt: "desc" },
      include: {
        payment: {
          select: {
            status: true,
            currency: true,
            tourTotalAmount: true,
            platformFeeRateSnapshot: true,
            platformFeeAmount: true,
            guideRemainingAmount: true,
            checkoutUrl: true,
            expiresAt: true,
          },
        },
        assignedLocalMateProfile: {
          select: {
            id: true,
            fullName: true,
            guideCode: true,
            avatarUrl: true,
            rating: true,
          },
        },
      },
    });

    return {
      session: {
        id: session.id,
        location: session.location,
        guestDisplayName: session.guestDisplayName,
        guestPhone: session.guestPhone,
        expiresAt: session.expiresAt.toISOString(),
      },
      activeOrder: order
        ? {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            quantity: order.quantity,
            partnerSubtotal: order.partnerSubtotal.toString(),
            hotelServiceFeeAmount: order.hotelServiceFeeAmount.toString(),
            customerTotalAmount: order.customerTotalAmount.toString(),
            totalAmount: order.totalAmount.toString(),
            currency: order.currency,
            serviceNameSnapshot: order.serviceNameSnapshot,
            requestedStartAt: order.requestedStartAt?.toISOString() ?? null,
            guestNote: order.guestNote,
            payment: order.payment,
            assignedGuide: order.assignedLocalMateProfile,
          }
        : null,
    };
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
