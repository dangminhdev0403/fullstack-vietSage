import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import type {
  LocalPartnerStatus,
  LocalPartnerOfferStatus,
  LocalPartnerBookingStatus,
  LocalPartnerInteractionType,
} from "@prisma/client";

export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

@Injectable()
export class LocalPartnersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCategories() {
    return this.prisma.localPartnerCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async ensureDefaultCategories() {
    const existing = await this.prisma.localPartnerCategory.count();
    if (existing > 0) return;

    const defaults = [
      { code: "RESTAURANT", nameVi: "Nhà hàng & Ẩm thực", nameEn: "Restaurants & Dining", icon: "restaurant", sortOrder: 1 },
      { code: "CAFE", nameVi: "Cà phê & Trà", nameEn: "Cafes & Tea", icon: "local_cafe", sortOrder: 2 },
      { code: "SPA_MASSAGE", nameVi: "Spa & Thư giãn", nameEn: "Spa & Wellness", icon: "spa", sortOrder: 3 },
      { code: "TOUR_ATTRACTION", nameVi: "Vui chơi & Tham quan", nameEn: "Tours & Attractions", icon: "attractions", sortOrder: 4 },
      { code: "RENTAL_TRANSPORT", nameVi: "Thuê xe & Di chuyển", nameEn: "Rental & Transport", icon: "directions_car", sortOrder: 5 },
      { code: "LAUNDRY", nameVi: "Giặt ủi ngoài", nameEn: "External Laundry", icon: "dry_cleaning", sortOrder: 6 },
      { code: "SHOPPING", nameVi: "Mua sắm & Siêu thị", nameEn: "Shopping & Marts", icon: "shopping_bag", sortOrder: 7 },
      { code: "OTHER", nameVi: "Dịch vụ khác", nameEn: "Other Services", icon: "more_horiz", sortOrder: 8 },
    ];

    for (const cat of defaults) {
      await this.prisma.localPartnerCategory.upsert({
        where: { code: cat.code },
        update: {},
        create: cat,
      });
    }
  }

  async findPartnersByHotelId(
    hotelId: string,
    filters?: {
      status?: LocalPartnerStatus;
      categoryId?: string;
      isFeatured?: boolean;
      q?: string;
    },
  ) {
    const where: any = { hotelId };
    if (filters?.status) where.status = filters.status;
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.isFeatured !== undefined) where.isFeatured = filters.isFeatured;
    if (filters?.q) {
      where.OR = [
        { name: { contains: filters.q, mode: "insensitive" } },
        { address: { contains: filters.q, mode: "insensitive" } },
        { description: { contains: filters.q, mode: "insensitive" } },
      ];
    }

    return this.prisma.localPartner.findMany({
      where,
      include: {
        category: true,
        offers: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });
  }

  async findPartnerById(partnerId: string) {
    return this.prisma.localPartner.findUnique({
      where: { id: partnerId },
      include: {
        category: true,
        offers: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  async createPartner(data: any) {
    return this.prisma.localPartner.create({
      data,
      include: {
        category: true,
        offers: true,
      },
    });
  }

  async updatePartner(partnerId: string, data: any) {
    return this.prisma.localPartner.update({
      where: { id: partnerId },
      data,
      include: {
        category: true,
        offers: true,
      },
    });
  }

  async deletePartner(partnerId: string) {
    return this.prisma.localPartner.delete({
      where: { id: partnerId },
    });
  }

  async createOffer(partnerId: string, data: any) {
    return this.prisma.localPartnerOffer.create({
      data: {
        ...data,
        partnerId,
      },
    });
  }

  async updateOffer(offerId: string, data: any) {
    return this.prisma.localPartnerOffer.update({
      where: { id: offerId },
      data,
    });
  }

  async createBookingRequest(data: any) {
    return this.prisma.localPartnerBookingRequest.create({
      data,
      include: {
        partner: true,
        offer: true,
      },
    });
  }

  async findBookingRequestsByHotelId(hotelId: string, status?: LocalPartnerBookingStatus) {
    const where: any = { hotelId };
    if (status) where.status = status;

    return this.prisma.localPartnerBookingRequest.findMany({
      where,
      include: {
        partner: true,
        offer: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateBookingRequestStatus(id: string, status: LocalPartnerBookingStatus) {
    return this.prisma.localPartnerBookingRequest.update({
      where: { id },
      data: { status },
      include: {
        partner: true,
        offer: true,
      },
    });
  }

  async createInteractionLog(data: {
    hotelId: string;
    stayId?: string;
    partnerId: string;
    actionType: LocalPartnerInteractionType;
  }) {
    return this.prisma.localPartnerInteractionLog.create({
      data,
    });
  }

  async getAnalyticsByHotelId(hotelId: string) {
    const [totalPartners, totalOffers, totalBookings, interactionCounts] = await Promise.all([
      this.prisma.localPartner.count({ where: { hotelId } }),
      this.prisma.localPartnerOffer.count({
        where: { partner: { hotelId } },
      }),
      this.prisma.localPartnerBookingRequest.count({ where: { hotelId } }),
      this.prisma.localPartnerInteractionLog.groupBy({
        by: ["actionType"],
        where: { hotelId },
        _count: { id: true },
      }),
    ]);

    const interactionsMap: Record<string, number> = {};
    interactionCounts.forEach((item) => {
      interactionsMap[item.actionType] = item._count.id;
    });

    return {
      totalPartners,
      totalOffers,
      totalBookings,
      interactions: interactionsMap,
    };
  }
}
