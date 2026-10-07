import { Injectable } from "@nestjs/common";
import {
  MarketplaceMessageDeliveryStatus,
  MarketplaceOrderActorType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class MarketplaceConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateConversation(
    orderId: string,
    details: {
      hotelId?: string | null;
      stayId?: string | null;
      publicSessionId?: string | null;
      serviceTenantId: string;
      assignedLocalMateProfileId?: string | null;
    },
  ) {
    const existing = await this.prisma.marketplaceConversation.findUnique({
      where: { orderId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            hotelId: true,
            stayId: true,
            serviceTenantId: true,
            assignedLocalMateProfileId: true,
          },
        },
      },
    });
    if (existing) return existing;

    try {
      return await this.prisma.marketplaceConversation.create({
        data: {
          orderId,
          hotelId: details.hotelId,
          stayId: details.stayId,
          publicSessionId: details.publicSessionId,
          serviceTenantId: details.serviceTenantId,
          assignedLocalMateProfileId: details.assignedLocalMateProfileId ?? null,
          status: "ACTIVE",
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              hotelId: true,
              stayId: true,
              serviceTenantId: true,
              assignedLocalMateProfileId: true,
            },
          },
        },
      });
    } catch (error) {
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
        (error && typeof error === "object" && error.code === "P2002")
      ) {
        const found = await this.prisma.marketplaceConversation.findUnique({
          where: { orderId },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                hotelId: true,
                stayId: true,
                serviceTenantId: true,
                assignedLocalMateProfileId: true,
              },
            },
          },
        });
        if (found) return found;
      }
      throw error;
    }
  }

  async findConversationByOrderId(orderId: string) {
    return this.prisma.marketplaceConversation.findUnique({
      where: { orderId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            hotelId: true,
            stayId: true,
            serviceTenantId: true,
            assignedLocalMateProfileId: true,
          },
        },
      },
    });
  }

  async listMessages(conversationId: string, limit = 50, before?: string) {
    let cursorCondition: Prisma.MarketplaceConversationMessageWhereInput = {};
    if (before) {
      const beforeMsg = await this.prisma.marketplaceConversationMessage.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      if (beforeMsg) {
        cursorCondition = { createdAt: { lt: beforeMsg.createdAt } };
      }
    }

    const items = await this.prisma.marketplaceConversationMessage.findMany({
      where: {
        conversationId,
        ...cursorCondition,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Return chronological ascending order
    return items.reverse();
  }

  async appendGuestMessage(params: {
    conversationId: string;
    orderId: string;
    body: string;
    clientMessageId: string;
  }) {
    // Idempotent duplicate check
    const existing = await this.prisma.marketplaceConversationMessage.findUnique({
      where: {
        conversationId_clientMessageId: {
          conversationId: params.conversationId,
          clientMessageId: params.clientMessageId,
        },
      },
    });
    if (existing) {
      return { isDuplicate: true, message: existing };
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const message = await tx.marketplaceConversationMessage.create({
          data: {
            conversationId: params.conversationId,
            orderId: params.orderId,
            senderType: MarketplaceOrderActorType.GUEST,
            body: params.body,
            clientMessageId: params.clientMessageId,
            deliveryStatus: MarketplaceMessageDeliveryStatus.PENDING,
          },
        });

        await tx.marketplaceConversation.update({
          where: { id: params.conversationId },
          data: { lastMessageAt: new Date() },
        });

        return message;
      });

      return { isDuplicate: false, message: created };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const found = await this.prisma.marketplaceConversationMessage.findUnique({
          where: {
            conversationId_clientMessageId: {
              conversationId: params.conversationId,
              clientMessageId: params.clientMessageId,
            },
          },
        });
        if (found) return { isDuplicate: true, message: found };
      }
      throw error;
    }
  }
}
