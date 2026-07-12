import { GuestStayStatus, Prisma } from "@prisma/client";

export const hotelDetailInclude = {
  tenant: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.HotelInclude;

export const roomListInclude = {
  qrCodes: {
    orderBy: {
      version: "desc",
    },
    take: 1,
  },
  guestStays: {
    where: {
      status: {
        in: [GuestStayStatus.ACTIVE],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  },
} satisfies Prisma.RoomInclude;

export type HotelDetailRow = Prisma.HotelGetPayload<{ include: typeof hotelDetailInclude }>;
export type RoomListRow = Prisma.RoomGetPayload<{ include: typeof roomListInclude }> & {
  activeGuestDeviceCount: number;
};

export const serviceItemInclude = {
  translations: true,
  category: {
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      defaultPrice: true,
      currency: true,
      translations: true,
    },
  },
} satisfies Prisma.HotelServiceItemInclude;

export type ServiceCatalogTranslationInput = Record<
  string,
  { name: string; description?: string | null } | undefined
>;

export type ServiceItemRow = Prisma.HotelServiceItemGetPayload<{
  include: typeof serviceItemInclude;
}>;
