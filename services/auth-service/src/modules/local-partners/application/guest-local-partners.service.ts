import { Injectable, NotFoundException } from "@nestjs/common";
import { LocalPartnersRepository } from "../infrastructure/local-partners.repository";

@Injectable()
export class GuestLocalPartnersService {
  constructor(private readonly repository: LocalPartnersRepository) {}

  async getCategories() {
    await this.repository.ensureDefaultCategories();
    return this.repository.findCategories();
  }

  async getGuestPartners(
    hotelId: string,
    query: { categoryId?: string; maxDistanceMeters?: number; isFeatured?: string } = {},
  ) {
    const partners = await this.repository.findPartnersByHotelId(hotelId, {
      status: "ACTIVE",
      categoryId: query.categoryId,
      isFeatured: query.isFeatured === "true" ? true : undefined,
    });
    return query.maxDistanceMeters === undefined
      ? partners
      : partners.filter(
          (partner) => partner.distanceMeters != null && partner.distanceMeters <= query.maxDistanceMeters!,
        );
  }

  async getGuestPartnerDetail(hotelId: string, partnerId: string) {
    const partner = await this.repository.findPartnerInHotel(hotelId, partnerId);
    if (!partner || partner.status !== "ACTIVE") {
      throw new NotFoundException("Không tìm thấy thông tin đối tác lân cận");
    }
    return partner;
  }
}
