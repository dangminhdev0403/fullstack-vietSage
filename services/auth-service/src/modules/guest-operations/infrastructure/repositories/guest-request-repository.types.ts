import { Prisma } from "@prisma/client";

export const requestListInclude = {
  room: { select: { id: true, roomNumber: true } },
  stay: {
    select: {
      id: true,
      reservationCode: true,
      guestDisplayName: true,
      status: true,
      checkedOutAt: true,
    },
  },
  assignedTo: { select: { id: true, fullName: true, email: true } },
  serviceItem: {
    select: {
      id: true,
      hotelId: true,
      categoryId: true,
      name: true,
      description: true,
      priceOverride: true,
      quantityEnabled: true,
      minQuantity: true,
      maxQuantity: true,
      metadata: true,
      sortOrder: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      translations: true,
      category: {
        select: {
          id: true,
          hotelId: true,
          name: true,
          description: true,
          defaultPrice: true,
          currency: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          translations: true,
        },
      },
    },
  },
  events: {
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} satisfies Prisma.GuestRequestInclude;

export type StaffRequestListRow = Prisma.GuestRequestGetPayload<{
  include: typeof requestListInclude;
}>;

export const requestDetailInclude = {
  ...requestListInclude,
  events: {
    orderBy: { createdAt: "asc" },
    include: { actorUser: { select: { id: true, fullName: true, email: true } } },
  },
  session: {
    select: { id: true, status: true, createdAt: true, lastSeenAt: true, closedAt: true },
  },
} satisfies Prisma.GuestRequestInclude;
