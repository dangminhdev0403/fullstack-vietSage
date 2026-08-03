import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { generateOpaqueToken, hashOpaqueToken } from "../../../common/security/token-hash.util";
import { BiometricWorkstationsRepository } from "../infrastructure/biometric-workstations.repository";

export const BIOMETRIC_CLOCK = Symbol("BIOMETRIC_CLOCK");
export const BIOMETRIC_SECRET_FACTORY = Symbol("BIOMETRIC_SECRET_FACTORY");

@Injectable()
export class BiometricWorkstationsService {
  constructor(
    private readonly repository: BiometricWorkstationsRepository,
    @Optional() @Inject(BIOMETRIC_CLOCK) private readonly now: () => Date = () => new Date(),
    @Optional()
    @Inject(BIOMETRIC_SECRET_FACTORY)
    private readonly createSecret: () => string = generateOpaqueToken,
  ) {}

  async issuePairing(hotelId: string, operatorId: string, ttlSeconds = 300) {
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
    const pairing = await this.repository.consumePairing(hashOpaqueToken(code), pairedAt);
    if (!pairing) throw new NotFoundException("Mã kết nối không hợp lệ hoặc đã hết hạn");
    const token = this.createSecret();
    await this.repository.createWorkstation({
      tokenHash: hashOpaqueToken(token),
      hotelId: pairing.hotelId,
      lastSeenAt: pairedAt,
      expiresAt: new Date(pairedAt.getTime() + ttlSeconds * 1_000),
    });
    return { token, hotelId: pairing.hotelId };
  }

  async authenticate(token: string) {
    const workstation = await this.repository.authenticate(hashOpaqueToken(token), this.now());
    if (!workstation)
      throw new UnauthorizedException("Thông tin kết nối máy quét không hợp lệ hoặc đã hết hạn");
    return workstation;
  }

  async hasOnlineWorkstation(hotelId: string, freshnessMs = 10_000) {
    const at = this.now();
    return this.repository.hasOnlineWorkstation(hotelId, new Date(at.getTime() - freshnessMs), at);
  }

  disconnectHotel(hotelId: string) {
    return this.repository.revokeHotel(hotelId, this.now());
  }
}
