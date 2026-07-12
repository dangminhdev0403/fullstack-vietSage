import { Injectable } from "@nestjs/common";
import { FolioStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

export const folioListSelect = {
  id: true,
  hotelId: true,
  stayId: true,
  roomId: true,
  folioNumber: true,
  status: true,
  currency: true,
  subtotalAmount: true,
  taxAmount: true,
  discountAmount: true,
  totalAmount: true,
  openedAt: true,
  checkoutStartedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  room: { select: { id: true, roomNumber: true } },
  stay: { select: { id: true, reservationCode: true, guestDisplayName: true, status: true } },
  invoices: {
    select: { id: true, invoiceNumber: true, status: true },
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    take: 1,
  },
} satisfies Prisma.FolioSelect;

export const folioDetailInclude = {
  room: { select: { id: true, roomNumber: true, floor: true, status: true } },
  stay: {
    select: {
      id: true,
      reservationCode: true,
      guestDisplayName: true,
      guestPhone: true,
      status: true,
      plannedCheckInAt: true,
      plannedCheckOutAt: true,
      checkedInAt: true,
      checkedOutAt: true,
    },
  },
  createdBy: { select: { id: true, fullName: true, email: true } },
  closedBy: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.FolioInclude;

export const folioItemListInclude = {
  serviceItem: { select: { id: true, name: true } },
  guestRequest: { select: { id: true, status: true, title: true } },
  postedBy: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.FolioItemInclude;

export const invoiceDetailInclude = {
  folio: { select: { id: true, folioNumber: true, status: true } },
  stay: {
    select: {
      id: true,
      guestDisplayName: true,
      checkedInAt: true,
      checkedOutAt: true,
      plannedCheckInAt: true,
      plannedCheckOutAt: true,
      room: { select: { id: true, roomNumber: true } },
    },
  },
} satisfies Prisma.InvoiceInclude;

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listFolios(input: { hotelId: string; status?: FolioStatus; skip: number; take: number }) {
    const where: Prisma.FolioWhereInput = {
      hotelId: input.hotelId,
      ...(input.status
        ? {
            status:
              input.status === FolioStatus.CLOSED
                ? { in: [FolioStatus.CLOSED, FolioStatus.CHECKOUT_PENDING] }
                : input.status,
          }
        : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      const [total, rows] = await Promise.all([
        tx.folio.count({ where }),
        tx.folio.findMany({
          where,
          select: folioListSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: input.skip,
          take: input.take,
        }),
      ]);

      return { total, rows };
    });
  }

  async findFolioDetail(hotelId: string, folioId: string) {
    return this.prisma.folio.findFirst({
      where: { id: folioId, hotelId },
      include: folioDetailInclude,
    });
  }

  async findActiveFoliosByStay(hotelId: string, stayId: string) {
    return this.prisma.folio.findMany({
      where: { hotelId, stayId, status: FolioStatus.OPEN },
      select: folioListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async folioExists(hotelId: string, folioId: string) {
    return this.prisma.folio.findFirst({
      where: { id: folioId, hotelId },
      select: { id: true },
    });
  }

  async listFolioItems(input: { hotelId: string; folioId: string; skip: number; take: number }) {
    const where: Prisma.FolioItemWhereInput = {
      hotelId: input.hotelId,
      folioId: input.folioId,
    };

    return this.prisma.$transaction(async (tx) => {
      const [total, rows] = await Promise.all([
        tx.folioItem.count({ where }),
        tx.folioItem.findMany({
          where,
          include: folioItemListInclude,
          orderBy: [{ postedAt: "desc" }, { id: "desc" }],
          skip: input.skip,
          take: input.take,
        }),
      ]);

      return { total, rows };
    });
  }

  async getFolioSummary(hotelId: string, folioId: string) {
    return this.prisma.$transaction(async (tx) => {
      const folio = await tx.folio.findFirst({
        where: { id: folioId, hotelId },
        select: {
          id: true,
          hotelId: true,
          stayId: true,
          folioNumber: true,
          status: true,
          currency: true,
          subtotalAmount: true,
          taxAmount: true,
          discountAmount: true,
          totalAmount: true,
          updatedAt: true,
        },
      });

      if (!folio) {
        return null;
      }

      const [grouped, latestItem] = await Promise.all([
        tx.folioItem.groupBy({
          by: ["itemType"],
          where: { hotelId, folioId, voidedAt: null },
          _count: { _all: true },
        }),
        tx.folioItem.aggregate({
          where: { hotelId, folioId, voidedAt: null },
          _max: { postedAt: true },
        }),
      ]);

      return { folio, grouped, latestItemPostedAt: latestItem._max.postedAt };
    });
  }

  async findInvoiceDetail(hotelId: string, invoiceId: string) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, hotelId },
        include: invoiceDetailInclude,
      });

      if (!invoice) {
        return null;
      }

      const [items, payments] = await Promise.all([
        tx.folioItem.findMany({
          where: { hotelId, folioId: invoice.folioId, voidedAt: null },
          orderBy: [{ postedAt: "asc" }, { id: "asc" }],
        }),
        tx.payment.findMany({
          where: { hotelId, invoiceId: invoice.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
      ]);

      return { invoice, items, payments };
    });
  }
}
