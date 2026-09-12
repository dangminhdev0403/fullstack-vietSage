import { Injectable, NotFoundException, type OnModuleDestroy } from "@nestjs/common";
import type { KbttHotelConnection } from "@prisma/client";
import { HotelAccessService } from "../../property/property-public";
import {
  kbttMetadata,
  type KbttCredentials,
  type KbttSession,
} from "../domain/schemas/kbtt.schema";
import { KbttCredentialCipher } from "../infrastructure/kbtt-credential-cipher";
import {
  KbttProviderClient,
  kbttAuthFailed,
  KBTT_AUTH_FAILED_MESSAGE,
} from "../infrastructure/kbtt-provider.client";
import { KbttRepository } from "../infrastructure/kbtt.repository";

@Injectable()
export class KbttService implements OnModuleDestroy {
  private readonly sessions = new Map<string, { ciphertext: string; session: KbttSession }>();
  private readonly operations = new Map<string, Promise<unknown>>();

  constructor(
    private readonly access: HotelAccessService,
    private readonly repository: KbttRepository,
    private readonly cipher: KbttCredentialCipher,
    private readonly provider: KbttProviderClient,
  ) {}

  async get(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.view(await this.repository.find(hotelId));
  }

  async connect(userId: string, roleId: string, hotelId: string, credentials: KbttCredentials) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.serialize(hotelId, async () => {
      const encrypted = this.cipher.encrypt(hotelId, credentials);
      const session = await this.provider.login(credentials);
      const now = new Date();
      let connection: KbttHotelConnection;
      try {
        connection = await this.repository.save({
          hotelId,
          ...encrypted,
          ...kbttMetadata(session),
          status: "CONNECTED",
          lastCheckedAt: now,
          lastConnectedAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
        });
      } catch (error) {
        await this.revoke(session.AccessToken);
        throw error;
      }
      const previous = this.sessions.get(hotelId)?.session;
      this.sessions.set(hotelId, { ciphertext: connection.ciphertext, session });
      if (previous && previous.AccessToken !== session.AccessToken)
        await this.revoke(previous.AccessToken);
      return this.view(connection);
    });
  }

  async check(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.serialize(hotelId, async () => {
      const connection = await this.repository.find(hotelId);
      if (!connection)
        throw new NotFoundException({
          code: "KBTT_NOT_CONFIGURED",
          message: "Khách sạn chưa cấu hình kết nối KBTT.",
        });
      const cached = this.sessions.get(hotelId);
      let session: KbttSession;
      try {
        if (
          cached?.ciphertext === connection.ciphertext &&
          cached.session.Exp * 1000 <= Date.now() + 60_000
        ) {
          try {
            session = await this.provider.refresh(cached.session.RefreshToken);
          } catch {
            session = await this.provider.login(this.cipher.decrypt(hotelId, connection));
          }
        } else {
          session = await this.provider.login(this.cipher.decrypt(hotelId, connection));
        }
      } catch (error) {
        this.sessions.delete(hotelId);
        const response =
          error &&
          typeof error === "object" &&
          "response" in error &&
          error.response &&
          typeof error.response === "object"
            ? (error.response as { code?: string; message?: string })
            : {};
        const isStableError = response.code?.startsWith("KBTT_") ?? false;
        const code = isStableError ? response.code! : "KBTT_AUTH_FAILED";
        const message =
          isStableError && response.message ? response.message : KBTT_AUTH_FAILED_MESSAGE;
        await this.repository.update(connection, {
          status: "AUTH_FAILED",
          lastCheckedAt: new Date(),
          lastErrorCode: code,
          lastErrorMessage: message,
        });
        if (isStableError && error && typeof error === "object") throw error;
        throw kbttAuthFailed();
      }
      let updated: KbttHotelConnection;
      try {
        updated = await this.repository.update(connection, {
          ...kbttMetadata(session),
          status: "CONNECTED",
          lastCheckedAt: new Date(),
          lastConnectedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        });
      } catch (error) {
        this.sessions.delete(hotelId);
        await this.revoke(session.AccessToken);
        throw error;
      }
      this.sessions.set(hotelId, { ciphertext: connection.ciphertext, session });
      if (cached && cached.session.AccessToken !== session.AccessToken)
        await this.revoke(cached.session.AccessToken);
      return this.view(updated);
    });
  }

  async disconnect(userId: string, roleId: string, hotelId: string) {
    await this.access.assertHotelAccess(userId, roleId, hotelId);
    return this.serialize(hotelId, async () => {
      const cached = this.sessions.get(hotelId);
      this.sessions.delete(hotelId);
      if (cached) await this.revoke(cached.session.AccessToken);
      await this.repository.remove(hotelId);
      return this.view(null);
    });
  }

  onModuleDestroy() {
    this.sessions.clear();
  }

  private async revoke(accessToken: string) {
    try {
      await this.provider.revoke(accessToken);
    } catch {
      return;
    }
  }

  private async serialize<Result>(hotelId: string, action: () => Promise<Result>): Promise<Result> {
    for (const [cachedHotelId, cached] of this.sessions) {
      if (cachedHotelId !== hotelId && cached.session.Exp * 1000 <= Date.now())
        this.sessions.delete(cachedHotelId);
    }
    // ponytail: per-process ordering; database compare-and-swap fences stale checks across replicas.
    const pending = (this.operations.get(hotelId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(action);
    this.operations.set(hotelId, pending);
    try {
      return await pending;
    } finally {
      if (this.operations.get(hotelId) === pending) this.operations.delete(hotelId);
    }
  }

  private view(connection: KbttHotelConnection | null) {
    return {
      configured: Boolean(connection),
      status: connection?.status ?? "DISCONNECTED",
      maskedUsername: connection ? "••••••" : null,
      csltId: connection?.csltId ?? null,
      csltKhuVuc: connection?.csltKhuVuc ?? null,
      csltDonVi: connection?.csltDonVi ?? null,
      maTTCuaCslt: connection?.maTTCuaCslt ?? null,
      maPxCuaCslt: connection?.maPxCuaCslt ?? null,
      isCsltChinh: connection?.isCsltChinh ?? null,
      lastCheckedAt: connection?.lastCheckedAt.toISOString() ?? null,
      lastConnectedAt: connection?.lastConnectedAt.toISOString() ?? null,
      lastErrorCode: connection?.lastErrorCode ?? null,
      lastErrorMessage: connection?.lastErrorMessage ?? null,
    };
  }
}
