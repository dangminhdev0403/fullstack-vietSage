import { Injectable, NotFoundException } from "@nestjs/common";
import type { LocalPartnerStatus } from "@prisma/client";
import { LocalPartnersRepository } from "../infrastructure/local-partners.repository";

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

  getPartnersForHotel(
    hotelId: string,
    filters?: { status?: LocalPartnerStatus; categoryId?: string; isFeatured?: boolean },
  ) {
    return this.repository.findPartnersByHotelId(hotelId, filters);
  }

  async getPartnerById(hotelId: string, partnerId: string) {
    const partner = await this.repository.findPartnerInHotel(hotelId, partnerId);
    if (!partner) throw new NotFoundException("Không tìm thấy thông tin đối tác");
    return partner;
  }

  createPartner(
    hotelId: string,
    payload: Omit<Parameters<LocalPartnersRepository["createPartner"]>[0], "hotelId">,
  ) {
    return this.repository.createPartner({ ...payload, hotelId });
  }

  async updatePartner(
    hotelId: string,
    partnerId: string,
    payload: Parameters<LocalPartnersRepository["updatePartner"]>[2],
  ) {
    await this.getPartnerById(hotelId, partnerId);
    return this.repository.updatePartner(hotelId, partnerId, payload);
  }

  async setPartnerStatus(hotelId: string, partnerId: string, status: LocalPartnerStatus) {
    return this.updatePartner(hotelId, partnerId, { status });
  }
}
