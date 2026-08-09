import { Injectable, NotFoundException } from "@nestjs/common";
import { LocalPartnersRepository } from "../infrastructure/local-partners.repository";
import type { LocalPartnerBookingStatus, LocalPartnerStatus } from "@prisma/client";

@Injectable()
export class LocalPartnersService {
  constructor(private readonly repository: LocalPartnersRepository) {}

  async onModuleInit() {
    await this.repository.ensureDefaultCategories();
  }

  async getCategories() {
    await this.repository.ensureDefaultCategories();
    return this.repository.findCategories();
  }

  async getPartnersForHotel(
    hotelId: string,
    filters?: {
      status?: LocalPartnerStatus;
      categoryId?: string;
      isFeatured?: boolean;
      q?: string;
    },
  ) {
    return this.repository.findPartnersByHotelId(hotelId, filters);
  }

  async getPartnerById(partnerId: string) {
    const partner = await this.repository.findPartnerById(partnerId);
    if (!partner) {
      throw new NotFoundException("Không tìm thấy thông tin đối tác");
    }
    return partner;
  }

  async createPartner(hotelId: string, payload: any) {
    return this.repository.createPartner({
      ...payload,
      hotelId,
    });
  }

  async updatePartner(partnerId: string, payload: any) {
    await this.getPartnerById(partnerId);
    return this.repository.updatePartner(partnerId, payload);
  }

  async setPartnerStatus(partnerId: string, status: LocalPartnerStatus) {
    await this.getPartnerById(partnerId);
    return this.repository.updatePartner(partnerId, { status });
  }

  async deletePartner(partnerId: string) {
    await this.getPartnerById(partnerId);
    return this.repository.deletePartner(partnerId);
  }

  async createOffer(partnerId: string, payload: any) {
    await this.getPartnerById(partnerId);
    return this.repository.createOffer(partnerId, payload);
  }

  async updateOffer(offerId: string, payload: any) {
    return this.repository.updateOffer(offerId, payload);
  }

  async getBookingRequests(hotelId: string, status?: LocalPartnerBookingStatus) {
    return this.repository.findBookingRequestsByHotelId(hotelId, status);
  }

  async updateBookingRequestStatus(id: string, status: LocalPartnerBookingStatus) {
    return this.repository.updateBookingRequestStatus(id, status);
  }

  async getAnalytics(hotelId: string) {
    return this.repository.getAnalyticsByHotelId(hotelId);
  }
}
