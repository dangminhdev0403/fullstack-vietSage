import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { HotelFeatureStatus } from "@prisma/client";
import {
  CANONICAL_HOTEL_FEATURE_KEYS,
  HOTEL_FEATURE_DEFINITIONS,
  getHotelFeatureDefinition,
  isHotelFeatureKey,
  type HotelFeatureKey,
} from "../../../common/config/hotel-features.registry";
import { HotelCoreRepository } from "../infrastructure/repositories/hotel-core.repository";

export interface HotelFeatureDto {
  key: HotelFeatureKey;
  label: string;
  description: string;
  status: HotelFeatureStatus;
}

@Injectable()
export class HotelFeatureEntitlementsService {
  constructor(private readonly hotelCoreRepository: HotelCoreRepository) {}

  async getHotelFeatures(hotelId: string): Promise<HotelFeatureDto[]> {
    const hotel = await this.hotelCoreRepository.findHotelById(hotelId);
    if (!hotel) {
      throw new NotFoundException("Khách sạn không tồn tại");
    }

    const entitlements = await this.hotelCoreRepository.findHotelFeatureEntitlements(hotelId);
    const entitlementMap = new Map(entitlements.map((e) => [e.featureKey, e.status]));

    return HOTEL_FEATURE_DEFINITIONS.map((def) => ({
      key: def.key,
      label: def.label,
      description: def.description,
      status: entitlementMap.get(def.key) ?? HotelFeatureStatus.DISABLED,
    }));
  }

  async setHotelFeatureStatus(
    hotelId: string,
    featureKey: string,
    status: HotelFeatureStatus,
    actorId: string,
  ): Promise<HotelFeatureDto> {
    if (!isHotelFeatureKey(featureKey)) {
      throw new BadRequestException(`Tính năng không hợp lệ: ${featureKey}`);
    }

    if (status !== HotelFeatureStatus.ENABLED && status !== HotelFeatureStatus.DISABLED) {
      throw new BadRequestException("Trạng thái tính năng không hợp lệ");
    }

    const result = await this.hotelCoreRepository.setHotelFeatureStatus({
      hotelId,
      featureKey,
      status,
      actorId,
    });

    if (!result) {
      throw new NotFoundException("Khách sạn không tồn tại");
    }

    const def = getHotelFeatureDefinition(featureKey);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      status: result.status,
    };
  }

  async getEnabledFeaturesForHotel(hotelId: string): Promise<HotelFeatureKey[]> {
    const keys = await this.hotelCoreRepository.findEnabledHotelFeatureKeys(hotelId);
    const enabledSet = new Set(keys);
    return CANONICAL_HOTEL_FEATURE_KEYS.filter((k) => enabledSet.has(k));
  }
}
