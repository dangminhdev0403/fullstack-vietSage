import { Injectable, NotFoundException } from "@nestjs/common";
import { LocalPartnersRepository } from "../infrastructure/local-partners.repository";
import type { LocalPartnerInteractionType } from "@prisma/client";

@Injectable()
export class GuestLocalPartnersService {
  constructor(private readonly repository: LocalPartnersRepository) {}

  async getCategories() {
    await this.repository.ensureDefaultCategories();
    return this.repository.findCategories();
  }

  async getGuestPartners(
    hotelId: string,
    query?: {
      categoryId?: string;
      maxDistanceMeters?: number;
      q?: string;
      isFeatured?: string;
    },
  ) {
    const isFeaturedBool = query?.isFeatured === "true" ? true : undefined;
    const partners = await this.repository.findPartnersByHotelId(hotelId, {
      status: "ACTIVE",
      categoryId: query?.categoryId,
      isFeatured: isFeaturedBool,
      q: query?.q,
    });

    if (query?.maxDistanceMeters) {
      const maxDist = Number(query.maxDistanceMeters);
      return partners.filter((p) => (p.distanceMeters ?? 0) <= maxDist);
    }

    return partners;
  }

  async getGuestPartnerDetail(hotelId: string, partnerId: string, stayId?: string) {
    const partner = await this.repository.findPartnerById(partnerId);
    if (!partner || partner.hotelId !== hotelId || partner.status !== "ACTIVE") {
      throw new NotFoundException("Không tìm thấy thông tin đối tác lân cận");
    }

    // Record VIEW_DETAIL interaction asynchronously
    void this.repository.createInteractionLog({
      hotelId,
      stayId,
      partnerId,
      actionType: "VIEW_DETAIL",
    });

    return partner;
  }

  async claimOffer(hotelId: string, partnerId: string, offerId: string, stayId?: string) {
    const partner = await this.getGuestPartnerDetail(hotelId, partnerId, stayId);
    const offer = partner.offers.find((o) => o.id === offerId && o.status === "ACTIVE");
    if (!offer) {
      throw new NotFoundException("Ưu đãi không tồn tại hoặc đã hết hạn");
    }

    void this.repository.createInteractionLog({
      hotelId,
      stayId,
      partnerId,
      actionType: "CLAIM_OFFER",
    });

    return {
      partner,
      offer,
      claimedAt: new Date().toISOString(),
    };
  }

  async createBookingRequest(hotelId: string, payload: any, stayId?: string) {
    const partner = await this.repository.findPartnerById(payload.partnerId);
    if (!partner || partner.hotelId !== hotelId) {
      throw new NotFoundException("Đối tác không hợp lệ");
    }

    const bookingRequest = await this.repository.createBookingRequest({
      ...payload,
      hotelId,
      stayId,
    });

    void this.repository.createInteractionLog({
      hotelId,
      stayId,
      partnerId: payload.partnerId,
      actionType: "BOOKING_REQUEST",
    });

    return bookingRequest;
  }

  async recordInteraction(
    hotelId: string,
    partnerId: string,
    actionType: LocalPartnerInteractionType,
    stayId?: string,
  ) {
    return this.repository.createInteractionLog({
      hotelId,
      stayId,
      partnerId,
      actionType,
    });
  }
}
