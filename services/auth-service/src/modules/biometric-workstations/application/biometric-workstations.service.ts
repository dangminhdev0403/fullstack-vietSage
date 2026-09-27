import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { generateOpaqueToken, hashOpaqueToken } from "../../../common/security/token-hash.util";
import { FRONTDESK_HN2N_CCCD_SCANNER } from "../../../common/config/hotel-features.registry";
import { BiometricWorkstationsRepository } from "../infrastructure/biometric-workstations.repository";
import { HotelFeatureEntitlementsService } from "../../property/property-public";

export const BIOMETRIC_CLOCK = Symbol("BIOMETRIC_CLOCK");
export const BIOMETRIC_SECRET_FACTORY = Symbol("BIOMETRIC_SECRET_FACTORY");

@Injectable()
export class BiometricWorkstationsService {
  constructor(
    private readonly repository: BiometricWorkstationsRepository,
    private readonly hotelFeatureEntitlementsService: HotelFeatureEntitlementsService,
    @Optional() @Inject(BIOMETRIC_CLOCK) private readonly now: () => Date = () => new Date(),
    @Optional()
    @Inject(BIOMETRIC_SECRET_FACTORY)
    private readonly createSecret: () => string = generateOpaqueToken,
  ) {}

  private async assertFeatureEnabled(hotelId: string): Promise<void> {
    const enabledFeatures =
      await this.hotelFeatureEntitlementsService.getEnabledFeaturesForHotel(hotelId);
    if (!enabledFeatures.includes(FRONTDESK_HN2N_CCCD_SCANNER)) {
      throw new ForbiddenException(
        "Tính năng máy quét CCCD HN2N chưa được kích hoạt cho khách sạn này",
      );
    }
  }

  async issuePairing(hotelId: string, operatorId: string, ttlSeconds = 300) {
    await this.assertFeatureEnabled(hotelId);
    const code = this.createSecret();
    const expiresAt = new Date(this.now().getTime() + ttlSeconds * 1_000);
    await this.repository.createPairing({
      codeHash: hashOpaqueToken(code),
      hotelId,
      operatorId,
      expiresAt,
    });
    return { code, expiresAt: expiresAt.getTime() };
  }

  async pair(code: string, ttlSeconds = 30 * 24 * 60 * 60) {
    if (!code || code.length > 256)
      throw new NotFoundException("Mã kết nối không hợp lệ hoặc đã hết hạn");
    const pairedAt = this.now();
    const token = this.createSecret();
    const pairing = await this.repository.consumePairing({
      codeHash: hashOpaqueToken(code),
      consumedAt: pairedAt,
      workstationTokenHash: hashOpaqueToken(token),
      workstationExpiresAt: new Date(pairedAt.getTime() + ttlSeconds * 1_000),
    });
    if (!pairing) throw new NotFoundException("Mã kết nối không hợp lệ hoặc đã hết hạn");
    return { token, hotelId: pairing.hotelId };
  }

  async authenticate(token: string, ttlSeconds = 30 * 24 * 60 * 60) {
    const seenAt = this.now();
    const workstation = await this.repository.authenticate(
      hashOpaqueToken(token),
      seenAt,
      new Date(seenAt.getTime() + ttlSeconds * 1_000),
    );
    if (!workstation)
      throw new UnauthorizedException("Thông tin kết nối máy quét không hợp lệ hoặc đã hết hạn");
    return workstation;
  }

  async hasOnlineWorkstation(hotelId: string, freshnessMs = 10_000) {
    await this.assertFeatureEnabled(hotelId);
    const at = this.now();
    return this.repository.hasOnlineWorkstation(hotelId, new Date(at.getTime() - freshnessMs), at);
  }

  disconnectHotel(hotelId: string) {
    return this.repository.revokeHotel(hotelId, this.now());
  }
}
