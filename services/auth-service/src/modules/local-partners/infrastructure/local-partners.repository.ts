import { Injectable } from "@nestjs/common";
import type { LocalPartnerStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
export { calculateHaversineDistanceMeters } from "../../../common/geo-distance";

const partnerInclude = {
  category: true,
  offers: { where: { status: "ACTIVE" as const }, orderBy: { createdAt: "desc" as const } },
};

@Injectable()
export class LocalPartnersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCategories() {
    return this.prisma.localPartnerCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async ensureDefaultCategories() {
    if (await this.prisma.localPartnerCategory.count()) return;
    const defaults = [
      ["RESTAURANT", "Nhà hàng & Ẩm thực", "Restaurants & Dining", "restaurant"],
      ["CAFE", "Cà phê & Trà", "Cafes & Tea", "local_cafe"],
      ["SPA_MASSAGE", "Spa & Thư giãn", "Spa & Wellness", "spa"],
      ["TOUR_ATTRACTION", "Vui chơi & Tham quan", "Tours & Attractions", "attractions"],
      ["RENTAL_TRANSPORT", "Thuê xe & Di chuyển", "Rental & Transport", "directions_car"],
      ["OTHER", "Dịch vụ khác", "Other Services", "more_horiz"],
    ] as const;
    await this.prisma.$transaction(
      defaults.map(([code, nameVi, nameEn, icon], index) =>
        this.prisma.localPartnerCategory.upsert({
          where: { code },
          update: {},
          create: { code, nameVi, nameEn, icon, sortOrder: index + 1 },
        }),
      ),
    );
  }

  findPartnersByHotelId(
    hotelId: string,
    filters: { status?: LocalPartnerStatus; categoryId?: string; isFeatured?: boolean } = {},
  ) {
    return this.prisma.localPartner.findMany({
      where: { hotelId, ...filters },
      include: partnerInclude,
      take: 100,
      orderBy: [{ isFeatured: "desc" }, { distanceMeters: "asc" }, { sortOrder: "asc" }],
    });
  }

  findPartnerInHotel(hotelId: string, partnerId: string) {
    return this.prisma.localPartner.findFirst({
      where: { id: partnerId, hotelId },
      include: partnerInclude,
    });
  }

  createPartner(data: Prisma.LocalPartnerUncheckedCreateInput) {
    return this.prisma.localPartner.create({ data, include: partnerInclude });
  }

  async updatePartner(
    hotelId: string,
    partnerId: string,
    data: Prisma.LocalPartnerUpdateManyMutationInput,
  ) {
    await this.prisma.localPartner.updateMany({ where: { id: partnerId, hotelId }, data });
    return this.findPartnerInHotel(hotelId, partnerId);
  }
}
