import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import {
  BUSINESS_PERMISSIONS,
  isBusinessPermissionKey,
} from "../../../common/config/business-permissions.registry";
import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { KbttHotelConnection } from "@prisma/client";
import { KbttController } from "../api/kbtt.controller";
import { KbttService, isBcaDuplicateConflict } from "../application/kbtt.service";
import {
  kbttCatalogKindSchema,
  kbttCredentialsSchema,
  type KbttCatalogKind,
  type KbttSession,
} from "../domain/schemas/kbtt.schema";
import { KbttCredentialCipher } from "../infrastructure/kbtt-credential-cipher";
import { KbttProviderClient, kbttAuthFailed } from "../infrastructure/kbtt-provider.client";
import { loadKbttConfig } from "../infrastructure/kbtt.config";

jest.mock("../../../common/config/env.config", () => ({ envConfig: {} }));

const credentials = { username: "fixture-owner", password: randomBytes(24).toString("base64") };
const primaryOccupant = {
  id: "occ-vn",
  hotelId: "hotel-1",
  stayId: "stay-1",
  roomId: "room-1",
  roomNumber: "101",
  isPrimary: true,
  fullName: "Nguyen Van A",
  phone: "0901234567",
  identityNumber: "001090012345",
  dateOfBirth: "1990-01-01",
  gender: "M",
  nationality: "VNM",
  residencePlace: "Ha Noi",
  citizenshipKind: "VIETNAMESE",
  stayStatus: "ACTIVE",
  reservationCode: "RES-001",
  checkedInAt: new Date("2026-09-14T03:00:00.000Z"),
  plannedCheckInAt: new Date("2026-09-14T03:00:00.000Z"),
  plannedCheckOutAt: new Date("2026-09-15T05:00:00.000Z"),
  stay: {
    checkedInAt: new Date("2026-09-14T03:00:00.000Z"),
    plannedCheckInAt: new Date("2026-09-14T03:00:00.000Z"),
    plannedCheckOutAt: new Date("2026-09-15T05:00:00.000Z"),
    room: { roomNumber: "101" },
  },
};
const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function session(overrides: Partial<KbttSession> = {}): KbttSession {
  return {
    AccessToken: randomBytes(24).toString("base64"),
    RefreshToken: randomBytes(24).toString("base64"),
    Exp: Math.floor(Date.now() / 1000) + 300,
    Authorities: ["kbtt:create-3th"],
    CsltId: "1000227",
    ...overrides,
  };
}

function fixture() {
  const rows = new Map<string, KbttHotelConnection>();
  const declarations = new Map<string, any>();
  const occupants = new Map<string, any>();
  const repository = {
    find: jest.fn(async (hotelId: string) => rows.get(hotelId) ?? null),
    save: jest.fn(async (connection: KbttHotelConnection) => {
      const existing = rows.get(connection.hotelId);
      const saved = {
        ...connection,
        autoSubmitEnabled: existing?.autoSubmitEnabled ?? connection.autoSubmitEnabled,
        autoSubmitTime: existing?.autoSubmitTime ?? connection.autoSubmitTime,
      };
      rows.set(connection.hotelId, saved);
      return saved;
    }),
    update: jest.fn(async (connection: KbttHotelConnection, data: Partial<KbttHotelConnection>) => {
      const updated = { ...connection, ...data };
      rows.set(connection.hotelId, updated);
      return updated;
    }),
    remove: jest.fn(async (hotelId: string) => {
      rows.delete(hotelId);
    }),
    findPendingScheduledAutoSubmitRuns: jest.fn(async () => []),
    findDeclarationsByHotel: jest.fn(async (hotelId: string) => {
      return [...declarations.values()].filter((d) => d.hotelId === hotelId);
    }),
    findLatestDeclaration: jest.fn(async (hotelId: string, occupantId: string) => {
      const list = [...declarations.values()].filter(
        (d) => d.hotelId === hotelId && d.occupantId === occupantId,
      );
      return list.sort((a, b) => b.revision - a.revision)[0] ?? null;
    }),
    findOccupant: jest.fn(async (hotelId: string, occupantId: string) => {
      const occ = occupants.get(occupantId);
      if (occ && occ.hotelId === hotelId) return occ;
      return null;
    }),
    findActiveSubmittedOccupantByIdentity: jest.fn<Promise<any>, any[]>(async () => null),
    prepareStaySubmissionBatch: jest.fn(async (params: any) => {
      const actualIds = [...occupants.values()]
        .filter(
          (occupant) => occupant.hotelId === params.hotelId && occupant.stayId === params.stayId,
        )
        .map((occupant) => occupant.id)
        .sort();
      if (actualIds.join("\0") !== [...params.expectedOccupantIds].sort().join("\0")) {
        throw new ConflictException("Danh sách khách đã thay đổi");
      }
      return params.declarations.map((item: any) => {
        const existing = declarations.get(item.id);
        if (
          !existing ||
          existing.version !== item.expectedVersion ||
          !item.allowedStatuses.includes(existing.status)
        ) {
          throw new ConflictException("CAS conflict");
        }
        const updated = {
          ...existing,
          status: "SENDING",
          submittedPayloadJson: item.submittedPayloadJson,
          submittedPayloadFingerprint: item.submittedPayloadFingerprint,
          version: existing.version + 1,
        };
        declarations.set(item.id, updated);
        return updated;
      });
    }),
    finalizeSubmissionBatch: jest.fn(async (params: any) =>
      params.declarations.map((item: any) => {
        const existing = declarations.get(item.id);
        if (
          !existing ||
          existing.version !== item.expectedVersion ||
          existing.status !== "SENDING"
        ) {
          throw new ConflictException("CAS conflict");
        }
        const updated = { ...existing, ...params.data, version: existing.version + 1 };
        declarations.set(item.id, updated);
        return updated;
      }),
    ),
    createDeclaration: jest.fn(async (data: any) => {
      const revision = data.revision ?? 1;
      const duplicate = [...declarations.values()].find(
        (d) =>
          d.hotelId === data.hotelId &&
          d.stayId === data.stayId &&
          d.occupantId === data.occupantId &&
          d.revision === revision,
      );
      if (duplicate) {
        throw new ConflictException({
          code: "DECLARATION_CONFLICT",
          message: "Hồ sơ khai báo đã tồn tại hoặc đang có thao tác tạo đồng thời.",
        });
      }
      const id = "decl-" + Math.random().toString(36).substring(2, 9);
      const decl = {
        id,
        version: 1,
        revision,
        status: data.status ?? "DRAFT",
        submittedPayloadJson: null,
        submittedPayloadFingerprint: null,
        providerCode: null,
        providerMessage: null,
        providerResponseJson: null,
        submittedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      declarations.set(id, decl);
      return decl;
    }),
    updateDeclaration: jest.fn(
      async (params: { id: string; hotelId: string; expectedVersion: number; data: any }) => {
        const existing = declarations.get(params.id);
        if (!existing || existing.hotelId !== params.hotelId) {
          throw new NotFoundException("Hồ sơ không tồn tại.");
        }
        if (existing.version !== params.expectedVersion) {
          throw new ConflictException({
            code: "DECLARATION_CONFLICT",
            message: "Xung đột phiên bản hoặc trạng thái hồ sơ khai báo (CAS conflict).",
          });
        }
        const updated = {
          ...existing,
          ...params.data,
          version: existing.version + 1,
          updatedAt: new Date(),
        };
        declarations.set(params.id, updated);
        return updated;
      },
    ),
    claimAutoSubmitRunLease: jest.fn(
      async (hotelId: string, scheduledFor: Date, dryRun: boolean) => ({
        id: "run-auto-1",
        hotelId,
        scheduledFor,
        status: "RUNNING",
        leaseExpiresAt: new Date(scheduledFor.getTime() + 600_000),
        dryRun,
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        unknownCount: 0,
        telegramSent: false,
        telegramMessageId: null,
        summaryJson: null,
        createdAt: scheduledFor,
        updatedAt: scheduledFor,
      }),
    ),
    renewAutoSubmitRunLease: jest.fn(async () => true),
    createScheduledAutoSubmitRun: jest.fn(
      async (hotelId: string, scheduledFor: Date, dryRun: boolean, trigger = "MANUAL_DELAYED") => ({
        id: "run-scheduled-" + Math.random().toString(36).substring(2, 9),
        hotelId,
        scheduledFor,
        status: "RUNNING",
        leaseExpiresAt: new Date(scheduledFor.getTime() - 1),
        dryRun,
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        unknownCount: 0,
        telegramSent: false,
        telegramMessageId: null,
        summaryJson: { trigger },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
    getAutoSubmitRunHistory: jest.fn(async () => []),
    finalizeAutoSubmitRun: jest.fn(async (_runId: string, data: any) => ({
      id: "run-auto-1",
      hotelId: "hotel-1",
      scheduledFor: new Date(),
      status: data.status,
      leaseExpiresAt: new Date(),
      dryRun: true,
      totalCount: data.totalCount,
      successCount: data.successCount,
      failedCount: data.failedCount,
      unknownCount: data.unknownCount,
      telegramSent: data.telegramSent ?? false,
      telegramMessageId: null,
      summaryJson: data.summaryJson ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    updateOccupantCitizenship: jest.fn(
      async (occupantId: string, hotelId: string, citizenshipKind: any) => {
        const occ = occupants.get(occupantId);
        if (occ && occ.hotelId === hotelId) occ.citizenshipKind = citizenshipKind;
      },
    ),
    updateOccupantDetails: jest.fn(async (occupantId: string, hotelId: string, data: any) => {
      const occ = occupants.get(occupantId);
      if (occ && occ.hotelId === hotelId) Object.assign(occ, data);
    }),
    resetAllDeclarationsToDraft: jest.fn(async (hotelId: string) => {
      let count = 0;
      for (const d of declarations.values()) {
        if (d.hotelId === hotelId) {
          d.status = "DRAFT";
          d.submittedAt = null;
          d.providerCode = null;
          d.providerMessage = null;
          count++;
        }
      }
      return count;
    }),
    resetSingleDeclarationToDraft: jest.fn(async (hotelId: string, occupantId: string) => {
      for (const d of declarations.values()) {
        if (d.hotelId === hotelId && d.occupantId === occupantId) {
          d.status = "DRAFT";
          d.submittedAt = null;
          d.providerCode = null;
          d.providerMessage = null;
        }
      }
    }),
    listCatalogItems: jest.fn(
      async (params: {
        kind: any;
        parentCodeNormalized?: string;
        includeInactive?: boolean;
        limit?: number;
      }) => {
        let list = [...catalogItems.values()].filter((item) => item.kind === params.kind);
        if (params.parentCodeNormalized !== undefined) {
          list = list.filter((item) => item.parentCodeNormalized === params.parentCodeNormalized);
        }
        if (!params.includeInactive) {
          list = list.filter((item) => item.isActive);
        }
        list.sort((a, b) => a.nameVi.localeCompare(b.nameVi));
        const limit = params.limit ?? 500;
        return list.slice(0, limit);
      },
    ),
    syncCatalogItems: jest.fn(
      async (
        kind: any,
        parentCodeNormalized: string,
        candidateItems: Array<{
          code: string;
          nameVi: string;
          nameEn: string | null;
          parentCodeNormalized: string;
        }>,
      ) => {
        const now = new Date();
        const candidateCodes = new Set(candidateItems.map((i) => i.code));

        for (const [key, item] of catalogItems.entries()) {
          if (
            item.kind === kind &&
            item.parentCodeNormalized === parentCodeNormalized &&
            !candidateCodes.has(item.code)
          ) {
            item.isActive = false;
            item.fetchedAt = now;
          }
        }

        for (const candidate of candidateItems) {
          const key = `${kind}::${candidate.code}::${candidate.parentCodeNormalized}`;
          const existing = catalogItems.get(key);
          if (existing) {
            existing.nameVi = candidate.nameVi;
            existing.nameEn = candidate.nameEn;
            existing.isActive = true;
            existing.fetchedAt = now;
          } else {
            catalogItems.set(key, {
              id: "cat-" + Math.random().toString(36).substring(2, 9),
              kind,
              code: candidate.code,
              parentCodeNormalized: candidate.parentCodeNormalized,
              nameVi: candidate.nameVi,
              nameEn: candidate.nameEn,
              isActive: true,
              fetchedAt: now,
              createdAt: now,
              updatedAt: now,
            });
          }
        }

        return {
          kind,
          parentCodeNormalized,
          total: candidateItems.length,
          syncedAt: now,
        };
      },
    ),
  };
  const catalogItems = new Map<string, any>();
  const access = { assertHotelAccess: jest.fn().mockResolvedValue({ id: "hotel-1" }) };
  const cipher = new KbttCredentialCipher();
  const provider = {
    login: jest.fn(async () => session()),
    refresh: jest.fn(async () => session()),
    revoke: jest.fn(async () => undefined),
    fetchCatalog: jest.fn(async (_kind: string, _parentCode?: string): Promise<any[]> => []),
    submitDeclaration: jest.fn(
      async (_kind: string, _payload: unknown[], _accessToken: string): Promise<any> => ({
        outcome: "SUCCESS",
        code: "200",
        message: "Thành công",
        data: null,
      }),
    ),
  };
  const occupantsReadService = {
    getActiveStayOccupants: jest.fn(async (hotelId: string) =>
      [...occupants.values()].filter((o) => o.hotelId === hotelId),
    ),
    getActiveStayOccupantsPaged: jest.fn(
      async (hotelId: string, options: { cursor?: string; take?: number }) => {
        const all = [...occupants.values()].filter((o) => o.hotelId === hotelId);
        const take = options?.take ?? 10;
        let startIndex = 0;
        if (options?.cursor) {
          const found = all.findIndex((o) => o.id === options.cursor);
          if (found >= 0) {
            startIndex = found + 1;
          }
        }
        const page = all.slice(startIndex, startIndex + take);
        const hasMore = startIndex + take < all.length;
        return {
          items: page,
          nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
        };
      },
    ),
  };
  const service = new KbttService(
    access as never,
    repository as never,
    cipher,
    provider as never,
    occupantsReadService as never,
  );
  return {
    rows,
    declarations,
    occupants,
    catalogItems,
    repository,
    access,
    cipher,
    provider,
    occupantsReadService,
    service,
  };
}

beforeEach(() => {
  process.env.KBTT_BASE_URL = "https://api-kbtt.example.test";
  process.env.KBTT_LOGIN_BASIC_AUTH_VALUE = randomBytes(24).toString("base64");
  process.env.KBTT_TOKEN_BASIC_AUTH_VALUE = randomBytes(24).toString("base64");
  process.env.KBTT_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
});
afterAll(() => {
  process.env = originalEnv;
});

describe("KBTT secure manual authentication", () => {
  it("requires valid paired secrets and encrypts with hotel-bound authenticated encryption", () => {
    expect(loadKbttConfig({})).toEqual({});
    expect(() =>
      loadKbttConfig({ KBTT_LOGIN_BASIC_AUTH_VALUE: randomBytes(24).toString("base64") }),
    ).toThrow("Invalid KBTT configuration");
    const cipher = new KbttCredentialCipher();
    const encrypted = cipher.encrypt("hotel-1", credentials);
    expect(cipher.decrypt("hotel-1", encrypted)).toEqual(credentials);
    expect(cipher.encrypt("hotel-1", credentials).iv).not.toBe(encrypted.iv);
    for (const secret of Object.values(credentials))
      expect(JSON.stringify(encrypted)).not.toContain(secret);
    expect(() => cipher.decrypt("hotel-2", encrypted)).toThrow();
    expect(() =>
      cipher.decrypt("hotel-1", { ...encrypted, ciphertext: Buffer.alloc(12).toString("base64") }),
    ).toThrow();
    expect(() =>
      cipher.decrypt("hotel-1", { ...encrypted, authTag: Buffer.alloc(4).toString("base64") }),
    ).toThrow();
    expect(() => cipher.decrypt("hotel-1", { ...encrypted, keyVersion: 2 })).toThrow();
    process.env.KBTT_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => new KbttCredentialCipher().decrypt("hotel-1", encrypted)).toThrow();
  });

  it("sends form login, Basic auth and encoded refresh/revoke to fixed HTTPS endpoints", async () => {
    const data = session();
    const fetchMock = jest
      .fn()
      .mockImplementation(async () => Response.json({ code: "200", data }));
    global.fetch = fetchMock;
    const provider = new KbttProviderClient();
    expect(await provider.login(credentials)).toEqual(data);
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(`${process.env.KBTT_BASE_URL}/authorization-service/oauth/token`);
    expect(options).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { Authorization: "Basic " + process.env.KBTT_LOGIN_BASIC_AUTH_VALUE },
    });
    expect((options.headers as Record<string, string>)["User-Agent"]).toBe("Mozilla/5.0");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(options.body as URLSearchParams)).toEqual({
      ...credentials,
      "grant-type": "api_cslt",
    });
    await provider.refresh("fixture&refresh+value");
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>).Authorization).toBe(
      "Basic " + process.env.KBTT_TOKEN_BASIC_AUTH_VALUE,
    );
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get("refresh_token")).toBe(
      "fixture&refresh+value",
    );
    fetchMock.mockResolvedValueOnce(Response.json({ code: "200", data: null }));
    await provider.revoke("fixture&access+value");
    expect((fetchMock.mock.calls[2][0] as URL).searchParams.get("access_token")).toBe(
      "fixture&access+value",
    );
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });

  it("rejects provider failures, missing authority, expired tokens and invalid replies without leaking errors", async () => {
    const provider = new KbttProviderClient();
    for (const response of [
      Response.json({ code: "400", message: credentials.password, data: null }),
      Response.json({ code: "200", data: session() }, { status: 503 }),
      Response.json({ code: 200, data: session() }),
      Response.json({ code: "200", data: session({ Authorities: [] }) }),
      Response.json({ code: "200", data: session({ Exp: 1 }) }),
      Response.json({ code: "200", data: { ...session(), CsltId: credentials.password } }),
      new Response(credentials.password),
      new Response("x".repeat(65_537)),
    ]) {
      global.fetch = jest.fn().mockResolvedValue(response);
      await expect(provider.login(credentials)).rejects.toBeDefined();
    }
    global.fetch = jest.fn().mockRejectedValue(new Error(credentials.password));
    await expect(provider.login(credentials)).rejects.not.toThrow(credentials.password);
  });

  it("checks active-role hotel access before every operation and blocks cross-hotel work", async () => {
    const { service, access, repository, provider } = fixture();
    access.assertHotelAccess.mockRejectedValue(new Error("Hotel denied"));
    await expect(service.get("owner", "owner-role", "foreign")).rejects.toThrow();
    await expect(service.connect("owner", "owner-role", "foreign", credentials)).rejects.toThrow();
    await expect(service.check("owner", "owner-role", "foreign")).rejects.toThrow();
    await expect(service.disconnect("owner", "owner-role", "foreign")).rejects.toThrow();
    expect(access.assertHotelAccess).toHaveBeenCalledTimes(4);
    expect(access.assertHotelAccess).toHaveBeenLastCalledWith("owner", "owner-role", "foreign");
    expect(repository.find).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
    expect(provider.login).not.toHaveBeenCalled();
  });

  it("authenticates before writing and preserves the previous connection on invalid replacement", async () => {
    const { service, repository, provider, rows } = fixture();
    provider.login.mockRejectedValueOnce(kbttAuthFailed());
    await expect(service.connect("owner", "owner-role", "hotel-1", credentials)).rejects.toThrow();
    expect(repository.save).not.toHaveBeenCalled();
    const connected = await service.connect("owner", "owner-role", "hotel-1", credentials);
    let stored = rows.get("hotel-1");
    Object.assign(stored!, { autoSubmitEnabled: true, autoSubmitTime: "04:30" });
    await service.connect("owner", "owner-role", "hotel-1", credentials);
    expect(rows.get("hotel-1")).toMatchObject({
      autoSubmitEnabled: true,
      autoSubmitTime: "04:30",
    });
    stored = rows.get("hotel-1");
    provider.login.mockRejectedValueOnce(kbttAuthFailed());
    await expect(service.connect("owner", "owner-role", "hotel-1", credentials)).rejects.toThrow();
    expect(rows.get("hotel-1")).toEqual(stored);
    expect(connected).toMatchObject({ configured: true, status: "CONNECTED", csltId: "1000227" });
    for (const value of [
      ...Object.values(credentials),
      stored!.ciphertext,
      stored!.iv,
      stored!.authTag,
    ])
      expect(JSON.stringify(connected)).not.toContain(value);
    expect(stored).not.toHaveProperty("AccessToken");
    expect(stored).not.toHaveProperty("RefreshToken");
  });

  it("initializes auto-submit disabled and protects its settings with the existing KBTT manage permission", async () => {
    const { service, repository } = fixture();

    await service.connect("owner", "owner-role", "hotel-1", credentials);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ autoSubmitEnabled: false, autoSubmitTime: null }),
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION_KEY, KbttController.prototype.getAutoSubmitConfig),
    ).toBe("hotel.kbtt.manage");
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION_KEY, KbttController.prototype.updateAutoSubmitConfig),
    ).toBe("hotel.kbtt.manage");
  });

  it("keeps GET passive, preserves credentials on failed manual check and re-logins after restart", async () => {
    const { service, provider, rows, access, repository, cipher } = fixture();
    await service.connect("owner", "owner-role", "hotel-1", credentials);
    const ciphertext = rows.get("hotel-1")!.ciphertext;
    provider.login.mockClear();
    await service.get("owner", "owner-role", "hotel-1");
    expect(provider.login).not.toHaveBeenCalled();
    provider.login.mockRejectedValueOnce(new Error(credentials.password));
    await expect(service.check("owner", "owner-role", "hotel-1")).rejects.toMatchObject({
      response: { code: "KBTT_PROVIDER_UNAVAILABLE" },
    });
    expect(rows.get("hotel-1")).toMatchObject({ ciphertext, status: "CONNECTED" });
    expect(JSON.stringify(await service.get("owner", "owner-role", "hotel-1"))).not.toContain(
      credentials.password,
    );
    service.onModuleDestroy();
    const restarted = new KbttService(
      access as never,
      repository as never,
      cipher,
      provider as never,
    );
    await expect(restarted.check("owner", "owner-role", "hotel-1")).resolves.toMatchObject({
      status: "CONNECTED",
      lastErrorCode: null,
    });
    provider.revoke.mockRejectedValue(new Error("Unavailable"));
    await expect(restarted.disconnect("owner", "owner-role", "hotel-1")).resolves.toMatchObject({
      configured: false,
      status: "DISCONNECTED",
    });
    expect(rows.size).toBe(0);
  });

  it("keeps the connection retryable when a manual check fails from provider unavailability", async () => {
    const { service, provider, rows } = fixture();
    await service.connect("owner", "owner-role", "hotel-1", credentials);
    provider.login.mockRejectedValueOnce(
      new HttpException(
        { code: "KBTT_PROVIDER_UNAVAILABLE", message: "Không thể kết nối BCA." },
        502,
      ),
    );

    await expect(service.check("owner", "owner-role", "hotel-1")).rejects.toBeDefined();
    expect(rows.get("hotel-1")?.status).toBe("CONNECTED");
  });

  it("marks saved credentials AUTH_FAILED after restart when BCA rejects login", async () => {
    const f = fixture();
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    f.service.onModuleDestroy();
    f.provider.login.mockRejectedValueOnce(kbttAuthFailed());
    const restarted = new KbttService(
      f.access as never,
      f.repository as never,
      f.cipher,
      f.provider as never,
      f.occupantsReadService as never,
    );

    await restarted.executeAutoSubmitForHotel("hotel-1", new Date(), false);

    expect(f.rows.get("hotel-1")?.status).toBe("AUTH_FAILED");
    expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
      "run-auto-1",
      expect.objectContaining({ status: "FAILED" }),
    );
  });

  it("keeps a one-shot dry run on the backend and executes it after 15 seconds", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const scheduledFor = new Date(Date.now() + 15_000);
    const run = {
      id: "run-delayed-1",
      hotelId: "hotel-1",
      scheduledFor,
      status: "RUNNING",
      leaseExpiresAt: new Date(scheduledFor.getTime() - 1),
      dryRun: true,
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      unknownCount: 0,
      telegramSent: false,
      telegramMessageId: null,
      summaryJson: { trigger: "MANUAL_DELAYED" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    f.repository.findPendingScheduledAutoSubmitRuns = jest.fn().mockResolvedValue([]);
    f.repository.createScheduledAutoSubmitRun = jest.fn().mockResolvedValue(run);
    const execute = jest
      .spyOn(f.service, "executeAutoSubmitForHotel")
      .mockResolvedValue({} as never);

    const result = await f.service.scheduleAutoSubmit("owner", "owner-role", "hotel-1", true);
    expect(result.scheduledFor).toBe(scheduledFor.toISOString());
    await jest.advanceTimersByTimeAsync(14_999);
    expect(execute).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledWith("hotel-1", scheduledFor, true);
    f.service.onModuleDestroy();
    jest.useRealTimers();
  });

  it("does not call BCA or Telegram during auto-submit dry run", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    const telegram = { sendKbttAutoSubmitSummary: jest.fn() };
    const service = new KbttService(
      f.access as never,
      f.repository as never,
      f.cipher,
      f.provider as never,
      f.occupantsReadService as never,
      telegram as never,
    );
    await service.connect("owner", "owner-role", "hotel-1", credentials);
    f.declarations.set("decl-auto-1", {
      id: "decl-auto-1",
      hotelId: "hotel-1",
      version: 1,
      declarationKind: "VIETNAMESE",
      draftPayloadJson: {
        hoTen: "Nguyen Van A",
        gioiTinh: "M",
        ngayThangNamSinhStr: "1990-01-01",
        ngayDenCsltStr: "2026-09-14 10:00:00",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
        soPhong: "101",
        lyDoCuTru: 1,
        loaiGiayTo: 1,
        soGiayTo: "001090012345",
      },
      status: "READY",
    });

    await service.executeAutoSubmitForHotel("hotel-1", new Date(), true);

    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(telegram.sendKbttAutoSubmitSummary).not.toHaveBeenCalled();
    expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
      "run-auto-1",
      expect.objectContaining({ status: "COMPLETED", successCount: 1 }),
    );
  });
});

describe("KBTT edit and submit", () => {
  it("saves current form data as DRAFT without status gates", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    const saved = await f.service.saveDraft("user-1", "role-1", "hotel-1", "occ-vn", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1, loaiGiayTo: 1, soGiayTo: "001090012345" },
    });
    expect(saved.status).toBe("DRAFT");
  });

  it("infers Vietnamese passport, CCCD defaults and normalizes gender", async () => {
    const f = fixture();
    const vietnamesePassport = {
      ...primaryOccupant,
      id: "occ-vn-passport",
      identityNumber: "C1234567",
      gender: "Female [F]",
    };
    f.occupants.set(vietnamesePassport.id, vietnamesePassport);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    await f.service.submit("user-1", "role-1", "hotel-1", vietnamesePassport.id);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "VIETNAMESE",
      [expect.objectContaining({ loaiGiayTo: 4, lyDoCuTru: 1, gioiTinh: "F" })],
      expect.any(String),
    );
  });

  it("validates the current draft then submits directly to provider API 5", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    await f.service.saveDraft("user-1", "role-1", "hotel-1", "occ-vn", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1, loaiGiayTo: 1, soGiayTo: "001090012345" },
    });

    const result = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    expect(result.status).toBe("SUBMITTED");
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "VIETNAMESE",
      [expect.objectContaining({ loaiGiayTo: 1, lyDoCuTru: 1 })],
      expect.any(String),
    );
  });

  it("reconciles BCA duplicate conflict rejection as SUBMITTED when identity or dates match", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    await f.service.saveDraft("user-1", "role-1", "hotel-1", "occ-vn", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1, loaiGiayTo: 1, soGiayTo: "001090012345" },
    });

    (f.provider.submitDeclaration as jest.Mock).mockResolvedValueOnce({
      outcome: "BUSINESS_REJECTION",
      code: "400",
      message:
        "Bản khai báo 1: Loại giấy tờ 'Thẻ CCCD' và Số giấy tờ '001090012345' đang tạm trú tại CSLT và chưa checkout, Bản khai báo 1: Khách đã có khai báo tạm trú từ 2026-09-14 đến 2026-09-15 tại cơ sở lưu trú này.",
      data: null,
    });

    const result = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    expect(result.status).toBe("SUBMITTED");
    expect(result.providerCode).toBe("200");
    expect(result.providerMessage).toContain("Tự động đối soát");
  });

  it("creates a missing draft and fills stay timestamps before bulk-style submit", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-15T03:00:00.000Z"));
    const f = fixture();
    const foreignOccupant = {
      ...primaryOccupant,
      id: "occ-foreign",
      citizenshipKind: "FOREIGN",
      nationality: "KOR",
      identityNumber: "TESTPASSPORT1",
    };
    f.occupants.set(foreignOccupant.id, foreignOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    await f.service.submit("user-1", "role-1", "hotel-1", foreignOccupant.id);

    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "FOREIGN",
      [
        expect.objectContaining({
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
          thoiHanTamTruStr: "2026-09-15 12:00:00",
        }),
      ],
      expect.any(String),
    );
    jest.useRealTimers();
  });

  it("reports missing fields by Vietnamese label without calling BCA", async () => {
    const f = fixture();
    const incomplete = {
      ...primaryOccupant,
      id: "occ-incomplete",
      citizenshipKind: "FOREIGN",
      nationality: null,
      identityNumber: null,
      dateOfBirth: null,
      gender: null,
    };
    f.occupants.set(incomplete.id, incomplete);
    await expect(
      f.service.submit("user-1", "role-1", "hotel-1", incomplete.id),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: "KBTT_PAYLOAD_INVALID",
        message: expect.stringMatching(/Quốc tịch.*Số hộ chiếu.*Giới tính.*Ngày sinh/),
      },
    });
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("blocks a duplicate active identity before calling BCA", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.saveDraft("user-1", "role-1", "hotel-1", "occ-vn", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1, loaiGiayTo: 1, soGiayTo: "001090012345" },
    });
    f.repository.findActiveSubmittedOccupantByIdentity.mockResolvedValueOnce({
      stay: { room: { roomNumber: "202" } },
    });

    await expect(f.service.submit("user-1", "role-1", "hotel-1", "occ-vn")).rejects.toMatchObject({
      status: 409,
      response: {
        code: "KBTT_ACTIVE_IDENTITY_CONFLICT",
        message: expect.stringContaining("phòng 202"),
      },
    });
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("blocks editing and resubmitting a submitted stay declaration", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    const saved = await f.service.saveDraft("user-1", "role-1", "hotel-1", "occ-vn", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1, loaiGiayTo: 1, soGiayTo: "001090012345" },
    });
    await f.repository.updateDeclaration({
      id: saved.id,
      hotelId: "hotel-1",
      expectedVersion: saved.version,
      data: { status: "SUBMITTED" },
    });

    await expect(
      f.service.saveDraft("user-1", "role-1", "hotel-1", "occ-vn", {
        citizenshipKind: "VIETNAMESE",
        data: { hoTen: "Changed" },
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(f.service.submit("user-1", "role-1", "hotel-1", "occ-vn")).rejects.toMatchObject({
      status: 409,
    });
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("keeps the form editable and returns provider code/message when BCA rejects it", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    await f.service.saveDraft("user-1", "role-1", "hotel-1", "occ-vn", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1, loaiGiayTo: 1, soGiayTo: "001090012345" },
    });
    f.provider.submitDeclaration.mockResolvedValueOnce({
      outcome: "BUSINESS_REJECTION",
      code: "400",
      message: "Bản khai báo 1: Khách đang tạm trú tại CSLT.",
      data: null,
    });

    await expect(f.service.submit("user-1", "role-1", "hotel-1", "occ-vn")).rejects.toMatchObject({
      status: 422,
      response: {
        code: "400",
        message: "Bản khai báo 1: Khách đang tạm trú tại CSLT.",
      },
    });
    const stored = await f.repository.findLatestDeclaration("hotel-1", "occ-vn");
    expect(stored?.status).toBe("DRAFT");
  });
});

describe("KBTT Catalog Cache (AGY-50)", () => {
  it("syncs all six reference catalogs into cache with correct mappings and verbatim codes", async () => {
    const f = fixture();

    // 1. NATIONALITY
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { maQT: "VNM", tenQT: "Việt Nam", tenQTEn: "Vietnam" },
      { maQT: "USA", tenQT: "Hoa Kỳ", tenQTEn: "United States" },
    ]);
    const natSync = await f.service.syncCatalog("user-1", "role-1", "hotel-1", "NATIONALITY");
    expect(natSync.kind).toBe("NATIONALITY");
    expect(natSync.totalFetched).toBe(2);

    const nationalities = await f.service.listCatalog(
      "user-1",
      "role-1",
      "hotel-1",
      "NATIONALITY",
      { includeInactive: false, limit: 500 },
    );
    expect(nationalities).toHaveLength(2);
    expect(nationalities.find((n) => n.code === "VNM")).toMatchObject({
      kind: "NATIONALITY",
      code: "VNM",
      nameVi: "Việt Nam",
      nameEn: "Vietnam",
      parentCode: null,
      isActive: true,
    });

    // 2. PROVINCE
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { maTT: "101", tenTT: "Hà Nội", tenTTEn: "Ha Noi", maTTChu: "HN" },
    ]);
    const provSync = await f.service.syncCatalog("user-1", "role-1", "hotel-1", "PROVINCE");
    expect(provSync.kind).toBe("PROVINCE");
    expect(provSync.totalFetched).toBe(1);

    const provinces = await f.service.listCatalog("user-1", "role-1", "hotel-1", "PROVINCE", { includeInactive: false, limit: 500 });
    expect(provinces).toHaveLength(1);
    expect(provinces[0]).toMatchObject({
      kind: "PROVINCE",
      code: "101",
      nameVi: "Hà Nội",
      nameEn: "Ha Noi",
      parentCode: null,
      isActive: true,
    });

    // 3. WARD
    f.provider.fetchCatalog.mockResolvedValueOnce([
      {
        maPhuongXa: "10101",
        tenPhuongXa: "Phúc Xá",
        tenPhuongXaEn: "Phuc Xa",
        trucThuocTinh: "101",
      },
    ]);
    const wardSync = await f.service.syncCatalog("user-1", "role-1", "hotel-1", "WARD", {
      provinceCode: "101",
    });
    expect(wardSync.kind).toBe("WARD");
    expect(wardSync.parentCode).toBe("101");
    expect(wardSync.totalFetched).toBe(1);

    const wards = await f.service.listCatalog("user-1", "role-1", "hotel-1", "WARD", { parentCode: "101", includeInactive: false, limit: 500 });
    expect(wards).toHaveLength(1);
    expect(wards[0]).toMatchObject({
      kind: "WARD",
      code: "10101",
      nameVi: "Phúc Xá",
      nameEn: "Phuc Xa",
      parentCode: "101",
      isActive: true,
    });

    // 4. STAY_REASON
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { id: 1, name: "Du lịch" },
      { id: 20, name: "Khác" },
    ]);
    const reasonSync = await f.service.syncCatalog("user-1", "role-1", "hotel-1", "STAY_REASON");
    expect(reasonSync.kind).toBe("STAY_REASON");
    expect(reasonSync.totalFetched).toBe(2);

    const reasons = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", { includeInactive: false, limit: 500 });
    expect(reasons).toHaveLength(2);
    expect(reasons.find((r) => r.code === "1")).toMatchObject({
      kind: "STAY_REASON",
      code: "1",
      nameVi: "Du lịch",
      nameEn: null,
      parentCode: null,
      isActive: true,
    });

    // 5. DOCUMENT_TYPE
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { id: 1, name: "Thẻ CCCD" },
      { id: 4, name: "Hộ chiếu" },
    ]);
    const docSync = await f.service.syncCatalog("user-1", "role-1", "hotel-1", "DOCUMENT_TYPE");
    expect(docSync.kind).toBe("DOCUMENT_TYPE");
    expect(docSync.totalFetched).toBe(2);

    const docs = await f.service.listCatalog("user-1", "role-1", "hotel-1", "DOCUMENT_TYPE", { includeInactive: false, limit: 500 });
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.code === "1")).toMatchObject({
      kind: "DOCUMENT_TYPE",
      code: "1",
      nameVi: "Thẻ CCCD",
      nameEn: null,
      parentCode: null,
      isActive: true,
    });

    // 6. RESIDENCE_PLACE
    f.provider.fetchCatalog.mockResolvedValueOnce([{ id: 1, name: "Khách sạn" }]);
    const placeSync = await f.service.syncCatalog("user-1", "role-1", "hotel-1", "RESIDENCE_PLACE");
    expect(placeSync.kind).toBe("RESIDENCE_PLACE");
    expect(placeSync.totalFetched).toBe(1);

    const places = await f.service.listCatalog(
      "user-1",
      "role-1",
      "hotel-1",
      "RESIDENCE_PLACE",
      { includeInactive: false, limit: 500 },
    );
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      kind: "RESIDENCE_PLACE",
      code: "1",
      nameVi: "Khách sạn",
      nameEn: null,
      parentCode: null,
      isActive: true,
    });
  });

  it("enforces stale-if-error: failed refresh preserves existing cache and performs zero mutation", async () => {
    const f = fixture();

    // Initial valid sync
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { maQT: "VNM", tenQT: "Việt Nam", tenQTEn: "Vietnam" },
      { maQT: "LAO", tenQT: "Lào", tenQTEn: "Laos" },
    ]);
    await f.service.syncCatalog("user-1", "role-1", "hotel-1", "NATIONALITY");
    expect(
      await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", { includeInactive: false, limit: 500 }),
    ).toHaveLength(2);

    // 1. Network / provider failure
    f.provider.fetchCatalog.mockRejectedValueOnce(
      new HttpException({ code: "KBTT_PROVIDER_UNAVAILABLE", message: "Network failure" }, 502),
    );
    await expect(
      f.service.syncCatalog("user-1", "role-1", "hotel-1", "NATIONALITY"),
    ).rejects.toThrow();

    // Existing rows remain intact
    let cached = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", { includeInactive: false, limit: 500 });
    expect(cached).toHaveLength(2);
    expect(cached.map((c) => c.code)).toEqual(expect.arrayContaining(["VNM", "LAO"]));

    // 2. Malformed candidate data failing Zod validation
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { invalidField: 123 }, // missing maQT, tenQT
    ]);
    await expect(
      f.service.syncCatalog("user-1", "role-1", "hotel-1", "NATIONALITY"),
    ).rejects.toMatchObject({
      status: 502,
    });

    // Existing rows STILL remain intact (zero mutation)
    cached = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", { includeInactive: false, limit: 500 });
    expect(cached).toHaveLength(2);
    expect(cached.every((c) => c.isActive)).toBe(true);
  });

  it("marks missing prior rows inactive without hard-deleting them", async () => {
    const f = fixture();

    // First sync: A and B
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { id: 10, name: "Lý do 10" },
      { id: 20, name: "Lý do 20" },
    ]);
    await f.service.syncCatalog("user-1", "role-1", "hotel-1", "STAY_REASON");
    const firstList = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", { includeInactive: false, limit: 500 });
    expect(firstList).toHaveLength(2);

    // Second sync: B and C (A is missing)
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { id: 20, name: "Lý do 20 (Cập nhật)" },
      { id: 30, name: "Lý do 30" },
    ]);
    await f.service.syncCatalog("user-1", "role-1", "hotel-1", "STAY_REASON");

    // Active by default: returns 20 and 30
    const activeList = await f.service.listCatalog(
      "user-1",
      "role-1",
      "hotel-1",
      "STAY_REASON",
      { includeInactive: false, limit: 500 },
    );
    expect(activeList).toHaveLength(2);
    expect(activeList.map((i) => i.code).sort()).toEqual(["20", "30"]);
    expect(activeList.find((i) => i.code === "20")?.nameVi).toBe("Lý do 20 (Cập nhật)");

    // includeInactive: returns 10, 20, and 30
    const allList = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", {
      includeInactive: true, limit: 500
    });
    expect(allList).toHaveLength(3);
    const item10 = allList.find((i) => i.code === "10");
    expect(item10).toBeDefined();
    expect(item10?.isActive).toBe(false);
  });

  it("enforces ward parent relations: requires province code on sync and scopes queries", async () => {
    const f = fixture();

    // Sync without province code must fail
    await expect(f.service.syncCatalog("user-1", "role-1", "hotel-1", "WARD", {})).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      f.service.syncCatalog("user-1", "role-1", "hotel-1", "WARD", { provinceCode: "" }),
    ).rejects.toThrow(BadRequestException);

    // Sync wards for province 101
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { maPhuongXa: "10101", tenPhuongXa: "Phường 101-1", trucThuocTinh: "101" },
      { maPhuongXa: "10102", tenPhuongXa: "Phường 101-2", trucThuocTinh: "101" },
    ]);
    await f.service.syncCatalog("user-1", "role-1", "hotel-1", "WARD", { provinceCode: "101" });

    // Sync wards for province 202
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { maPhuongXa: "20201", tenPhuongXa: "Phường 202-1", trucThuocTinh: "202" },
    ]);
    await f.service.syncCatalog("user-1", "role-1", "hotel-1", "WARD", { provinceCode: "202" });

    // Wards for 101 are not deactivated by syncing 202
    const wards101 = await f.service.listCatalog("user-1", "role-1", "hotel-1", "WARD", {
      parentCode: "101", includeInactive: false, limit: 500
    });
    expect(wards101).toHaveLength(2);
    expect(wards101.every((w) => w.parentCode === "101" && w.isActive)).toBe(true);

    const wards202 = await f.service.listCatalog("user-1", "role-1", "hotel-1", "WARD", {
      parentCode: "202", includeInactive: false, limit: 500
    });
    expect(wards202).toHaveLength(1);
    expect(wards202[0].code).toBe("20201");
    expect(wards202[0].parentCode).toBe("202");
  });

  it("calls exact public paths with no auth headers, requires code 200, bounds envelope, and sanitizes errors", async () => {
    const provider = new KbttProviderClient();
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const testCases: Array<{
      kind: KbttCatalogKind;
      parentCode?: string;
      expectedPath: string;
    }> = [
      { kind: "NATIONALITY", expectedPath: "/cms-backend/public/dm-qt/3th/get-all" },
      { kind: "PROVINCE", expectedPath: "/cms-backend/public/dm-tinh-tp/get-all" },
      {
        kind: "WARD",
        parentCode: "101",
        expectedPath: "/cms-backend/public/dm-phuong-xa?trucThuocTinh=101",
      },
      { kind: "STAY_REASON", expectedPath: "/cms-backend/public/ly-do-cu-tru/get-all" },
      { kind: "DOCUMENT_TYPE", expectedPath: "/cms-backend/public/loai-giay-to/get-all" },
      { kind: "RESIDENCE_PLACE", expectedPath: "/cms-backend/public/noi-cu-tru/get-all" },
    ];

    for (const tc of testCases) {
      fetchMock.mockResolvedValueOnce(Response.json({ code: "200", message: "OK", data: [] }));
      await provider.fetchCatalog(tc.kind, tc.parentCode);
      const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      const url = call[0] as URL;
      const options = call[1] as RequestInit;

      expect(url.pathname + url.search).toBe(tc.expectedPath);
      expect((options.headers as any).Authorization).toBeUndefined();
      expect((options.headers as any).Accept).toBe("application/json");
      expect(options.method).toBe("GET");
    }

    // Body code !== "200" throws 502
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "400", message: "Internal business error", data: null }),
    );
    await expect(provider.fetchCatalog("NATIONALITY")).rejects.toMatchObject({
      status: 502,
      response: { code: "KBTT_PROVIDER_INVALID_RESPONSE" },
    });

    // Network timeout / error throws 502 KBTT_PROVIDER_UNAVAILABLE
    fetchMock.mockRejectedValueOnce(new Error("Connection reset by peer"));
    await expect(provider.fetchCatalog("NATIONALITY")).rejects.toMatchObject({
      status: 502,
      response: { code: "KBTT_PROVIDER_UNAVAILABLE" },
    });

    // Oversized response (> 5MB) throws 502 KBTT_PROVIDER_INVALID_RESPONSE
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(6 * 1024 * 1024)));
    await expect(provider.fetchCatalog("NATIONALITY")).rejects.toMatchObject({
      status: 502,
      response: { code: "KBTT_PROVIDER_INVALID_RESPONSE" },
    });
  });

  it("preserves provider nationality maQT verbatim without ISO conversion", async () => {
    const f = fixture();
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { maQT: "NON_ISO_COUNTRY_99", tenQT: "Quốc gia đặc thù", tenQTEn: "Special Country" },
    ]);
    await f.service.syncCatalog("user-1", "role-1", "hotel-1", "NATIONALITY");
    const list = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", { includeInactive: false, limit: 500 });
    expect(list[0].code).toBe("NON_ISO_COUNTRY_99");
  });

  it("uses local cache only for read queries with bounded limits and no provider declaration calls", async () => {
    const f = fixture();
    global.fetch = jest.fn().mockImplementation(() => {
      throw new Error("Provider should not be called on read");
    });

    // Prepopulate 3 items
    for (let i = 1; i <= 3; i++) {
      f.catalogItems.set(`DOCUMENT_TYPE::${i}::`, {
        id: `d-${i}`,
        kind: "DOCUMENT_TYPE",
        code: `${i}`,
        parentCodeNormalized: "",
        nameVi: `Loại giấy tờ ${i}`,
        nameEn: null,
        isActive: true,
        fetchedAt: new Date(),
      });
    }

    const items = await f.service.listCatalog("user-1", "role-1", "hotel-1", "DOCUMENT_TYPE", {
      limit: 2, includeInactive: false
    });
    expect(items).toHaveLength(2);
    expect(global.fetch).not.toHaveBeenCalled();

    // Verify no provider declaration endpoints were invoked
    expect(f.provider.login).not.toHaveBeenCalled();
    expect(f.provider.refresh).not.toHaveBeenCalled();
    expect(f.provider.revoke).not.toHaveBeenCalled();
  });

  it("verifies permissions registry and controller routing for catalog endpoints", async () => {
    expect(isBusinessPermissionKey("hotel.kbtt.declarations.view")).toBe(true);
    expect(isBusinessPermissionKey("hotel.kbtt.declarations.manage")).toBe(true);
    expect(BUSINESS_PERMISSIONS.some((p) => p.key === "hotel.kbtt.declarations.view")).toBe(true);
    expect(BUSINESS_PERMISSIONS.some((p) => p.key === "hotel.kbtt.declarations.manage")).toBe(true);

    const f = fixture();
    const controller = new KbttController(f.service);
    const req = { user: { userId: "user-1", roleId: "role-1" } } as any;

    f.provider.fetchCatalog.mockResolvedValueOnce([{ id: 1, name: "Thẻ CCCD" }]);

    // Test controller syncCatalog and syncCatalogByBody
    const syncRes1 = await controller.syncCatalog(req, "hotel-1", "DOCUMENT_TYPE");
    expect(syncRes1.kind).toBe("DOCUMENT_TYPE");

    f.provider.fetchCatalog.mockResolvedValueOnce([{ id: 1, name: "Du lịch" }]);
    const syncRes2 = await controller.syncCatalogByBody(req, "hotel-1", { kind: "STAY_REASON" });
    expect(syncRes2.kind).toBe("STAY_REASON");

    // Test controller listCatalog and listCatalogByQuery
    const list1 = await controller.listCatalog(req, "hotel-1", "DOCUMENT_TYPE");
    expect(list1).toHaveLength(1);

    const list2 = await controller.listCatalogByQuery(req, "hotel-1", "STAY_REASON");
    expect(list2).toHaveLength(1);

    // Cross-hotel access assertion
    f.access.assertHotelAccess.mockRejectedValueOnce(new NotFoundException("Hotel access denied"));
    await expect(controller.listCatalog(req, "hotel-forbidden", "DOCUMENT_TYPE")).rejects.toThrow();
  });
});

describe("KBTT provider API 4/5 wire contract", () => {
  it("verifies KbttProviderClient wire protocol: correct HTTP POST URLs for API 4 and API 5, Bearer header, bounded envelope, timeout, and network error classification", async () => {
    const client = new KbttProviderClient();
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    // Arity check: submitDeclaration takes exactly 3 arguments (declarationKind, payload, accessToken)
    expect(client.submitDeclaration.length).toBe(3);

    // 1. API 4 Foreign wire check
    fetchMock.mockResolvedValueOnce(Response.json({ code: "200", message: "Success", data: null }));
    const foreignRes = await client.submitDeclaration(
      "FOREIGN",
      [{ hoTen: "John Doe" }],
      "test_access_token_123",
    );
    expect(foreignRes.outcome).toBe("SUCCESS");
    expect(foreignRes.code).toBe("200");

    const foreignCall = fetchMock.mock.calls[0];
    const foreignUrl = foreignCall[0] as URL;
    const foreignOpts = foreignCall[1] as RequestInit;
    expect(foreignUrl.pathname).toBe("/client-service/kbtt/kbtt-3th");
    expect(foreignOpts.method).toBe("POST");
    expect((foreignOpts.headers as any).Authorization).toBe("Bearer test_access_token_123");
    expect((foreignOpts.headers as any)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(foreignOpts.body as string)).toEqual([{ hoTen: "John Doe" }]);
    expect(foreignOpts.signal).toBeInstanceOf(AbortSignal);

    // 2. API 5 Vietnamese wire check
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "200", message: "Success VN", data: null }),
    );
    const vnRes = await client.submitDeclaration(
      "VIETNAMESE",
      [{ hoTen: "Nguyen Van A" }],
      "test_access_token_456",
    );
    expect(vnRes.outcome).toBe("SUCCESS");
    expect(vnRes.code).toBe("200");

    const vnCall = fetchMock.mock.calls[1];
    const vnUrl = vnCall[0] as URL;
    const vnOpts = vnCall[1] as RequestInit;
    expect(vnUrl.pathname).toBe("/client-service/kbtt-vn/kbtt-3th");
    expect(vnOpts.method).toBe("POST");
    expect((vnOpts.headers as any).Authorization).toBe("Bearer test_access_token_456");
    expect(JSON.parse(vnOpts.body as string)).toEqual([{ hoTen: "Nguyen Van A" }]);
    expect(vnOpts.signal).toBeInstanceOf(AbortSignal);

    // 3. Business rejection check
    fetchMock.mockResolvedValueOnce(Response.json({ code: "400", message: "Số CCCD đã tồn tại" }));
    const bizRes = await client.submitDeclaration("VIETNAMESE", [{}], "tok");
    expect(bizRes.outcome).toBe("BUSINESS_REJECTION");
    expect(bizRes.code).toBe("400");
    expect(bizRes.message).toBe("Số CCCD đã tồn tại");

    // 4. Network error check - must never classify as local TIMEOUT
    const timeoutErr = new Error("The operation was aborted due to timeout");
    timeoutErr.name = "TimeoutError";
    fetchMock.mockRejectedValueOnce(timeoutErr);
    const timeRes = await client.submitDeclaration("FOREIGN", [{}], "tok");
    expect(timeRes.outcome).toBe("AMBIGUOUS");
    expect(timeRes.code).toBe("NETWORK_ERROR");
    expect(timeRes.code).not.toBe("TIMEOUT");
    expect(timeRes.message).toBe("Lỗi kết nối mạng khi gửi hồ sơ khai báo đến cơ quan quản lý.");

    // 5. 502 Bad Gateway check
    fetchMock.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    const badGatewayRes = await client.submitDeclaration("VIETNAMESE", [{}], "tok");
    expect(badGatewayRes.outcome).toBe("AMBIGUOUS");
  });
});

describe("KBTT submit response framing (BOM, whitespace, non-JSON)", () => {
  it("parses BOM-prefixed JSON as SUCCESS", async () => {
    const client = new KbttProviderClient();
    const bom = "\uFEFF";
    const body = bom + JSON.stringify({ code: "200", message: "OK", data: null });
    global.fetch = jest.fn().mockResolvedValueOnce(new Response(body, { status: 200 }));
    const res = await client.submitDeclaration("VIETNAMESE", [{}], "tok");
    expect(res.outcome).toBe("SUCCESS");
    expect(res.code).toBe("200");
  });

  it("parses whitespace-framed JSON as SUCCESS", async () => {
    const client = new KbttProviderClient();
    const body = "  \n" + JSON.stringify({ code: "200", message: "OK", data: null }) + "\n  ";
    global.fetch = jest.fn().mockResolvedValueOnce(new Response(body, { status: 200 }));
    const res = await client.submitDeclaration("VIETNAMESE", [{}], "tok");
    expect(res.outcome).toBe("SUCCESS");
    expect(res.code).toBe("200");
  });

  it("returns AMBIGUOUS for HTML error page without false SUBMITTED", async () => {
    const client = new KbttProviderClient();
    const html = "<html><body><h1>502 Bad Gateway</h1></body></html>";
    global.fetch = jest.fn().mockResolvedValueOnce(new Response(html, { status: 502 }));
    const res = await client.submitDeclaration("VIETNAMESE", [{}], "tok");
    expect(res.outcome).toBe("AMBIGUOUS");
    expect(res.code).toBe("HTTP_502");
    expect(res.message).toContain("không đúng định dạng JSON");
  });

  it("returns BUSINESS_REJECTION and clear message for HTTP 403 Forbidden HTML or non-JSON", async () => {
    const client = new KbttProviderClient();
    const html = "<html><body><h1>403 Forbidden</h1></body></html>";
    global.fetch = jest.fn().mockResolvedValueOnce(new Response(html, { status: 403 }));
    const res = await client.submitDeclaration("VIETNAMESE", [{}], "tok");
    expect(res.outcome).toBe("BUSINESS_REJECTION");
    expect(res.code).toBe("HTTP_403");
    expect(res.message).toContain("403 Forbidden");
  });

  it("returns AMBIGUOUS and clear message for HTTP 401 Unauthorized", async () => {
    const client = new KbttProviderClient();
    const html = "<html><body><h1>401 Unauthorized</h1></body></html>";
    global.fetch = jest.fn().mockResolvedValueOnce(new Response(html, { status: 401 }));
    const res = await client.submitDeclaration("VIETNAMESE", [{}], "tok");
    expect(res.outcome).toBe("AMBIGUOUS");
    expect(res.code).toBe("HTTP_401");
    expect(res.message).toContain("401 Unauthorized");
  });

  it("returns AMBIGUOUS for empty body", async () => {
    const client = new KbttProviderClient();
    global.fetch = jest.fn().mockResolvedValueOnce(new Response(null, { status: 200 }));
    const res = await client.submitDeclaration("VIETNAMESE", [{}], "tok");
    expect(res.outcome).toBe("AMBIGUOUS");
  });
});

describe("KBTT dev tools intervention", () => {
  it("resets all submitted declarations back to DRAFT", async () => {
    const { service, declarations } = fixture();
    declarations.set("decl-sub-1", {
      id: "decl-sub-1",
      hotelId: "hotel-1",
      stayId: "stay-1",
      occupantId: "occ-1",
      status: "SUBMITTED",
      providerCode: "200",
      providerMessage: "Thành công",
      submittedAt: new Date(),
      version: 1,
    });

    const res = await service.devResetDeclarations("user-1", "role-1", "hotel-1");
    expect(res.success).toBe(true);
    expect(res.resetCount).toBe(1);
    expect(declarations.get("decl-sub-1")?.status).toBe("DRAFT");
    expect(declarations.get("decl-sub-1")?.submittedAt).toBeNull();
  });

  it("updates occupant identity numbers directly in DB via devUpdateOccupants", async () => {
    const { service, occupants, declarations } = fixture();
    occupants.set("occ-test-1", {
      id: "occ-test-1",
      hotelId: "hotel-1",
      stayId: "stay-1",
      fullName: "Nguyễn Văn A",
      identityNumber: "001095000001",
      citizenshipKind: "VIETNAMESE",
    });
    declarations.set("decl-test-1", {
      id: "decl-test-1",
      hotelId: "hotel-1",
      occupantId: "occ-test-1",
      revision: 1,
      version: 1,
      status: "SUBMITTED",
      draftPayloadJson: { hoTen: "Nguyễn Văn A", soGiayTo: "001095000001" },
    });

    const res = await service.devUpdateOccupants("user-1", "role-1", "hotel-1", [
      {
        occupantId: "occ-test-1",
        identityNumber: "001095999999",
        resetToDraft: true,
      },
    ]);

    expect(res.success).toBe(true);
    expect(res.updatedCount).toBe(1);
    expect(occupants.get("occ-test-1")?.identityNumber).toBe("001095999999");
    expect(declarations.get("decl-test-1")?.draftPayloadJson?.soGiayTo).toBe("001095999999");
    expect(declarations.get("decl-test-1")?.status).toBe("DRAFT");
  });

  it("allows editing a SUBMITTED declaration when allowSubmittedEdit is true", async () => {
    const { service, occupants, declarations } = fixture();
    occupants.set("occ-sub-edit", {
      id: "occ-sub-edit",
      hotelId: "hotel-1",
      stayId: "stay-1",
      fullName: "Trần Văn B",
      identityNumber: "001095111111",
      citizenshipKind: "VIETNAMESE",
    });
    declarations.set("decl-sub-edit", {
      id: "decl-sub-edit",
      hotelId: "hotel-1",
      occupantId: "occ-sub-edit",
      revision: 1,
      version: 1,
      status: "SUBMITTED",
      declarationKind: "VIETNAMESE",
      draftPayloadJson: { hoTen: "Trần Văn B", soGiayTo: "001095111111" },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Without allowSubmittedEdit, throws conflict
    await expect(
      service.saveDraft("user-1", "role-1", "hotel-1", "occ-sub-edit", {
        citizenshipKind: "VIETNAMESE",
        soGiayTo: "001095222222",
      }),
    ).rejects.toThrow();

    // With allowSubmittedEdit, succeeds and resets status to DRAFT
    const saved = await service.saveDraft("user-1", "role-1", "hotel-1", "occ-sub-edit", {
      citizenshipKind: "VIETNAMESE",
      allowSubmittedEdit: true,
      soGiayTo: "001095222222",
    });

    expect(saved.status).toBe("DRAFT");
    expect(declarations.get("decl-sub-edit")?.status).toBe("DRAFT");
    expect(occupants.get("occ-sub-edit")?.identityNumber).toBe("001095222222");
  });
});

describe("KBTT Reliability Slice (2026-09-16)", () => {
  describe("isBcaDuplicateConflict", () => {
    it("reconciles when normalized identity and departure date match BCA message", () => {
      const draft = {
        soGiayTo: "001090012345",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
      };
      const message =
        "Bản khai báo 1: Số giấy tờ '001090012345' đang tạm trú tại CSLT đến 2026-09-15.";
      expect(isBcaDuplicateConflict(message, draft)).toBe(true);
    });

    it("reconciles with no arrival-date requirement even if arrival date in message differs or is absent", () => {
      const draft = {
        soGiayTo: "001090012345",
        ngayDenCsltStr: "2026-09-10 10:00:00",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
      };
      const message =
        "Khách đã có khai báo tạm trú từ 2026-09-14 đến 2026-09-15 tại cơ sở lưu trú này (Số giấy tờ: 001090012345).";
      expect(isBcaDuplicateConflict(message, draft)).toBe(true);
    });

    it("fails closed if identity is missing or empty in draft", () => {
      const draft = {
        soGiayTo: "",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
      };
      const message = "Khách đã có khai báo tạm trú từ 2026-09-14 đến 2026-09-15.";
      expect(isBcaDuplicateConflict(message, draft)).toBe(false);
    });

    it("fails closed if departure / stay expiry date is missing in draft", () => {
      const draft = {
        soGiayTo: "001090012345",
      };
      const message = "Số giấy tờ '001090012345' đang tạm trú tại CSLT.";
      expect(isBcaDuplicateConflict(message, draft)).toBe(false);
    });

    it("fails closed if identity does not match in message", () => {
      const draft = {
        soGiayTo: "001090012345",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
      };
      const message = "Số giấy tờ '999999999999' đang tạm trú tại CSLT đến 2026-09-15.";
      expect(isBcaDuplicateConflict(message, draft)).toBe(false);
    });

    it("fails closed if departure date does not match in message", () => {
      const draft = {
        soGiayTo: "001090012345",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
      };
      const message = "Số giấy tờ '001090012345' đang tạm trú tại CSLT đến 2026-09-20.";
      expect(isBcaDuplicateConflict(message, draft)).toBe(false);
    });

    it("fails closed if no conflict keywords exist", () => {
      const draft = {
        soGiayTo: "001090012345",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
      };
      const message = "Lỗi định dạng họ tên cho giấy tờ 001090012345 ngày 2026-09-15.";
      expect(isBcaDuplicateConflict(message, draft)).toBe(false);
    });
  });

  describe("bulk auto-submit reliability and retries", () => {
    it("retries transient outcome up to 3 attempts and succeeds on second attempt", async () => {
      const f = fixture();
      f.occupants.set("occ-vn", primaryOccupant);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);
      f.declarations.set("decl-1", {
        id: "decl-1",
        hotelId: "hotel-1",
        occupantId: "occ-vn",
        version: 1,
        declarationKind: "VIETNAMESE",
        status: "DRAFT",
        draftPayloadJson: {
          hoTen: "Nguyen Van A",
          gioiTinh: "M",
          ngayThangNamSinhStr: "1990-01-01",
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
          soPhong: "101",
          lyDoCuTru: 1,
          loaiGiayTo: 1,
          soGiayTo: "001090012345",
        },
      });

      f.provider.submitDeclaration
        .mockResolvedValueOnce({
          outcome: "AMBIGUOUS",
          code: "HTTP_504",
          message: "Gateway Timeout",
        })
        .mockResolvedValueOnce({
          outcome: "SUCCESS",
          code: "200",
          message: "Thành công",
          data: { id: "bca-123" },
        });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(2);
      expect(f.declarations.get("decl-1")?.status).toBe("SUBMITTED");
      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({
          status: "COMPLETED",
          totalCount: 1,
          successCount: 1,
          failedCount: 0,
          unknownCount: 0,
        }),
      );
    });

    it("reconciles duplicate conflict on retry attempt without double-counting", async () => {
      const f = fixture();
      f.occupants.set("occ-vn", primaryOccupant);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);
      f.declarations.set("decl-1", {
        id: "decl-1",
        hotelId: "hotel-1",
        occupantId: "occ-vn",
        version: 1,
        declarationKind: "VIETNAMESE",
        status: "DRAFT",
        draftPayloadJson: {
          hoTen: "Nguyen Van A",
          gioiTinh: "M",
          ngayThangNamSinhStr: "1990-01-01",
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
          soPhong: "101",
          lyDoCuTru: 1,
          loaiGiayTo: 1,
          soGiayTo: "001090012345",
        },
      });

      f.provider.submitDeclaration
        .mockResolvedValueOnce({
          outcome: "AMBIGUOUS",
          code: "HTTP_504",
          message: "Gateway Timeout",
        })
        .mockResolvedValueOnce({
          outcome: "BUSINESS_REJECTION",
          code: "400",
          message:
            "Bản khai báo 1: Số giấy tờ '001090012345' đang tạm trú tại CSLT đến 2026-09-15.",
        });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(2);
      expect(f.declarations.get("decl-1")?.status).toBe("SUBMITTED");
      expect(f.declarations.get("decl-1")?.providerCode).toBe("200");
      expect(f.declarations.get("decl-1")?.providerMessage).toContain("Tự động đối soát");
    });

    it("stops after 3 transient attempts without calling a 4th time and marks UNKNOWN", async () => {
      const f = fixture();
      f.occupants.set("occ-vn", primaryOccupant);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);
      f.declarations.set("decl-1", {
        id: "decl-1",
        hotelId: "hotel-1",
        occupantId: "occ-vn",
        version: 1,
        declarationKind: "VIETNAMESE",
        status: "DRAFT",
        draftPayloadJson: {
          hoTen: "Nguyen Van A",
          gioiTinh: "M",
          ngayThangNamSinhStr: "1990-01-01",
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
          soPhong: "101",
          lyDoCuTru: 1,
          loaiGiayTo: 1,
          soGiayTo: "001090012345",
        },
      });

      f.provider.submitDeclaration.mockResolvedValue({
        outcome: "AMBIGUOUS",
        code: "HTTP_500",
        message: "Internal server error",
      });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(3);
      expect(f.declarations.get("decl-1")?.status).toBe("UNKNOWN");
      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({
          status: "COMPLETED",
          totalCount: 1,
          successCount: 0,
          failedCount: 0,
          unknownCount: 1,
        }),
      );
    });

    it("does not retry permanent BUSINESS_REJECTION (attempt count is 1)", async () => {
      const f = fixture();
      f.occupants.set("occ-vn", primaryOccupant);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);
      f.declarations.set("decl-1", {
        id: "decl-1",
        hotelId: "hotel-1",
        occupantId: "occ-vn",
        version: 1,
        declarationKind: "VIETNAMESE",
        status: "DRAFT",
        draftPayloadJson: {
          hoTen: "Nguyen Van A",
          gioiTinh: "M",
          ngayThangNamSinhStr: "1990-01-01",
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
          soPhong: "101",
          lyDoCuTru: 1,
          loaiGiayTo: 1,
          soGiayTo: "001090012345",
        },
      });

      f.provider.submitDeclaration.mockResolvedValueOnce({
        outcome: "BUSINESS_REJECTION",
        code: "400",
        message: "Dữ liệu địa chỉ không tồn tại trong danh mục C06",
      });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
      expect(f.declarations.get("decl-1")?.status).toBe("FAILED");
      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({
          successCount: 0,
          failedCount: 1,
          unknownCount: 0,
        }),
      );
    });

    it("skips previously SUBMITTED declarations and skips FAILED if fingerprint unchanged", async () => {
      const f = fixture();
      const occ1 = { ...primaryOccupant, id: "occ-1" };
      const occ2 = { ...primaryOccupant, id: "occ-2" };
      f.occupants.set(occ1.id, occ1);
      f.occupants.set(occ2.id, occ2);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      f.declarations.set("decl-1", {
        id: "decl-1",
        hotelId: "hotel-1",
        occupantId: "occ-1",
        status: "SUBMITTED",
        declarationKind: "VIETNAMESE",
      });

      const draft2 = {
        hoTen: "Nguyen Van A",
        gioiTinh: "M",
        ngayThangNamSinhStr: "1990-01-01",
        ngayDenCsltStr: "2026-09-14 10:00:00",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
        soPhong: "101",
        lyDoCuTru: 1,
        loaiGiayTo: 1,
        soGiayTo: "001090012345",
      };
      const fp2 = createHash("sha256")
        .update(JSON.stringify([draft2]))
        .digest("hex");
      f.declarations.set("decl-2", {
        id: "decl-2",
        hotelId: "hotel-1",
        occupantId: "occ-2",
        status: "FAILED",
        declarationKind: "VIETNAMESE",
        draftPayloadJson: draft2,
        submittedPayloadFingerprint: fp2,
        providerCode: "LOCAL_VALIDATION",
      });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({
          totalCount: 0,
          successCount: 0,
        }),
      );
    });

    it("recovers stale SENDING declarations", async () => {
      const f = fixture();
      f.occupants.set("occ-vn", primaryOccupant);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      f.declarations.set("decl-stale", {
        id: "decl-stale",
        hotelId: "hotel-1",
        occupantId: "occ-vn",
        version: 1,
        status: "SENDING",
        declarationKind: "VIETNAMESE",
        draftPayloadJson: {
          hoTen: "Nguyen Van A",
          gioiTinh: "M",
          ngayThangNamSinhStr: "1990-01-01",
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
          soPhong: "101",
          lyDoCuTru: 1,
          loaiGiayTo: 1,
          soGiayTo: "001090012345",
        },
        updatedAt: new Date(Date.now() - 15 * 60 * 1000),
      });

      f.provider.submitDeclaration.mockResolvedValueOnce({
        outcome: "SUCCESS",
        code: "200",
        message: "Thành công",
      });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
      expect(f.declarations.get("decl-stale")?.status).toBe("SUBMITTED");
    });

    it("proves auto-submit reads occupants via bounded paged path and never calls unbounded getActiveStayOccupants", async () => {
      const f = fixture();
      const credentials = { username: "owner", password: "password" };
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      const pagedMock = jest.fn().mockResolvedValue({
        items: [
          {
            id: "occ-page-1",
            occupantId: "occ-page-1",
            stayId: "stay-1",
            hotelId: "hotel-1",
            roomId: "room-1",
            roomNumber: "101",
            isPrimary: true,
            fullName: "Nguyen Van A",
            phone: null,
            identityNumber: "001090012345",
            dateOfBirth: "1990-01-01",
            gender: "M",
            nationality: "VNM",
            residencePlace: null,
            citizenshipKind: "VIETNAMESE",
            plannedCheckInAt: new Date("2026-09-14T10:00:00Z"),
            plannedCheckOutAt: new Date("2026-09-15T12:00:00Z"),
            checkedInAt: new Date("2026-09-14T10:00:00Z"),
            stayStatus: "ACTIVE",
            reservationCode: "RES-01",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        nextCursor: null,
      });
      (f.occupantsReadService as any).getActiveStayOccupantsPaged = pagedMock;

      f.provider.submitDeclaration.mockResolvedValueOnce({
        outcome: "SUCCESS",
        code: "200",
        message: "Thành công",
      });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);

      expect(pagedMock).toHaveBeenCalledWith(
        "hotel-1",
        expect.objectContaining({ take: expect.any(Number) }),
      );
      expect(f.occupantsReadService.getActiveStayOccupants).not.toHaveBeenCalled();
    });

    it("renews lease between pages and halts BCA calls immediately if lease renewal fails", async () => {
      const f = fixture();
      const credentials = { username: "owner", password: "password" };
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      const pagedMock = jest
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              id: "occ-1",
              stayId: "stay-1",
              hotelId: "hotel-1",
              roomNumber: "101",
              isPrimary: true,
              fullName: "Nguyen Van A",
              identityNumber: "001090012345",
              dateOfBirth: "1990-01-01",
              gender: "M",
              nationality: "VNM",
              citizenshipKind: "VIETNAMESE",
              plannedCheckInAt: new Date("2026-09-14T10:00:00Z"),
              plannedCheckOutAt: new Date("2026-09-15T12:00:00Z"),
              stayStatus: "ACTIVE",
            },
          ],
          nextCursor: "occ-1",
        })
        .mockResolvedValueOnce({
          items: [
            {
              id: "occ-2",
              stayId: "stay-2",
              hotelId: "hotel-1",
              roomNumber: "102",
              isPrimary: true,
              fullName: "Nguyen Van B",
              identityNumber: "001090012346",
              dateOfBirth: "1991-01-01",
              gender: "M",
              nationality: "VNM",
              citizenshipKind: "VIETNAMESE",
              plannedCheckInAt: new Date("2026-09-14T10:00:00Z"),
              plannedCheckOutAt: new Date("2026-09-15T12:00:00Z"),
              stayStatus: "ACTIVE",
            },
          ],
          nextCursor: null,
        });
      (f.occupantsReadService as any).getActiveStayOccupantsPaged = pagedMock;

      let renewCount = 0;
      (f.repository as any).renewAutoSubmitRunLease = jest.fn(async () => {
        renewCount++;
        return renewCount === 1; // fails on second page renewal
      });

      f.provider.submitDeclaration.mockResolvedValue({
        outcome: "SUCCESS",
        code: "200",
        message: "Thành công",
      });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);

      expect((f.repository as any).renewAutoSubmitRunLease).toHaveBeenCalled();
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
      expect(f.repository.finalizeAutoSubmitRun).not.toHaveBeenCalled();
    });

    it("proves aggregate counters are reduced per page/chunk and no settledResults array accumulates across the whole hotel", async () => {
      const src = readFileSync(resolve(__dirname, "../application/kbtt.service.ts"), "utf8");
      expect(src).not.toContain("settledResults");
    });

    it("persists fingerprint on newly created local-validation failure and skips it unchanged on next run", async () => {
      const f = fixture();
      const credentials = { username: "owner", password: "password" };
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      const invalidOccupant = {
        id: "occ-invalid-new",
        stayId: "stay-1",
        hotelId: "hotel-1",
        isPrimary: true,
        fullName: "Missing Identity",
        identityNumber: null,
        dateOfBirth: "1990-01-01",
        gender: "M",
        nationality: "VNM",
        citizenshipKind: "VIETNAMESE",
        plannedCheckInAt: new Date("2026-09-14T10:00:00Z"),
        plannedCheckOutAt: new Date("2026-09-15T12:00:00Z"),
        stayStatus: "ACTIVE",
      };

      const pagedMock = jest.fn().mockResolvedValue({
        items: [invalidOccupant],
        nextCursor: null,
      });
      (f.occupantsReadService as any).getActiveStayOccupantsPaged = pagedMock;

      // Run 1: occupant has no declaration yet
      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);

      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();

      const createdDecl = [...f.declarations.values()].find(
        (d) => d.occupantId === "occ-invalid-new",
      );
      expect(createdDecl).toBeDefined();
      expect(createdDecl.status).toBe("FAILED");
      expect(createdDecl.providerCode).toBe("LOCAL_VALIDATION");
      expect(createdDecl.submittedPayloadFingerprint).toBeTruthy();

      // Run 2: same unchanged occupant should be skipped
      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    });

    it("processes bulk declarations in parallel waves, retries only transient failures up to 3 waves, and never retries permanent errors", async () => {
      const f = fixture();
      const occ1 = {
        ...primaryOccupant,
        id: "occ-1",
        fullName: "Guest One",
        identityNumber: "001090000001",
      };
      const occ2 = {
        ...primaryOccupant,
        id: "occ-2",
        fullName: "Guest Two",
        identityNumber: "001090000002",
      };
      const occ3 = {
        ...primaryOccupant,
        id: "occ-3",
        fullName: "Guest Three",
        identityNumber: "001090000003",
      };
      f.occupants.set(occ1.id, occ1);
      f.occupants.set(occ2.id, occ2);
      f.occupants.set(occ3.id, occ3);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      const pagedMock = jest.fn().mockResolvedValue({
        items: [occ1, occ2, occ3],
        nextCursor: null,
      });
      (f.occupantsReadService as any).getActiveStayOccupantsPaged = pagedMock;

      const callsPerOccupant: Record<string, number> = { "occ-1": 0, "occ-2": 0, "occ-3": 0 };
      let initialCallsCount = 0;
      let wave1Completed = false;

      f.provider.submitDeclaration.mockImplementation(
        async (_kind: any, payload: any, _token: any) => {
          const item = (payload as any[])[0];
          const occId =
            item.hoTen === "Guest One" ? "occ-1" : item.hoTen === "Guest Two" ? "occ-2" : "occ-3";
          callsPerOccupant[occId]++;

          // Check wave boundary: retries must only happen after wave 1 finished for all declarations
          if (callsPerOccupant[occId] > 1 && !wave1Completed) {
            throw new Error(
              "Violation: retry initiated before Wave 1 completed for all declarations in the page",
            );
          }

          // Simulate small delay on initial wave to test concurrent wave barrier
          if (callsPerOccupant[occId] === 1) {
            await new Promise((r) => setTimeout(r, 20));
            initialCallsCount++;
            if (initialCallsCount === 3) {
              wave1Completed = true;
            }
          }

          if (occId === "occ-1") {
            return { outcome: "SUCCESS", code: "200", message: "Thành công" };
          }
          if (occId === "occ-2") {
            return {
              outcome: "BUSINESS_REJECTION",
              code: "400",
              message: "Sai định dạng số giấy tờ",
            };
          }
          // occ-3: transient on attempts 1 and 2, succeeds on attempt 3
          if (callsPerOccupant["occ-3"] < 3) {
            return { outcome: "AMBIGUOUS", code: "HTTP_504", message: "Gateway Timeout" };
          }
          return { outcome: "SUCCESS", code: "200", message: "Thành công" };
        },
      );

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);

      // Verify wave call counts
      expect(callsPerOccupant["occ-1"]).toBe(1);
      expect(callsPerOccupant["occ-2"]).toBe(1);
      expect(callsPerOccupant["occ-3"]).toBe(3);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(5);

      // Verify no attempt-specific caller timeout overrides were passed
      for (const call of f.provider.submitDeclaration.mock.calls) {
        expect((call as any)[3]).toBeUndefined();
      }

      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({
          status: "COMPLETED",
          totalCount: 3,
          successCount: 2,
          failedCount: 1,
          unknownCount: 0,
        }),
      );
    });

    it("sends final Telegram summary exactly once after all pages and waves, never per wave", async () => {
      const f = fixture();
      const sendTelegramMock = jest.fn().mockResolvedValue(true);
      (f.service as any).telegramNotificationService = {
        sendKbttAutoSubmitSummary: sendTelegramMock,
      };

      const occ1 = {
        ...primaryOccupant,
        id: "occ-1",
        fullName: "Guest One",
        identityNumber: "001090000001",
      };
      const occ2 = {
        ...primaryOccupant,
        id: "occ-2",
        fullName: "Guest Two",
        identityNumber: "001090000002",
      };
      f.occupants.set(occ1.id, occ1);
      f.occupants.set(occ2.id, occ2);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      const pagedMock = jest.fn().mockResolvedValue({
        items: [occ1, occ2],
        nextCursor: null,
      });
      (f.occupantsReadService as any).getActiveStayOccupantsPaged = pagedMock;

      let occ2Calls = 0;
      f.provider.submitDeclaration.mockImplementation(async (_kind, payload) => {
        const item = (payload as any[])[0];
        if (item.hoTen === "Guest One") {
          return { outcome: "SUCCESS", code: "200", message: "Thành công" };
        }
        occ2Calls++;
        if (occ2Calls === 1) {
          return { outcome: "AMBIGUOUS", code: "HTTP_504", message: "Gateway Timeout" };
        }
        return { outcome: "SUCCESS", code: "200", message: "Thành công" };
      });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);

      expect(sendTelegramMock).toHaveBeenCalledTimes(1);
      expect(sendTelegramMock).toHaveBeenCalledWith(
        "hotel-1",
        expect.objectContaining({
          totalEligible: 2,
          successCount: 2,
          failureCount: 0,
          unknownCount: 0,
          directSuccessCount: 2,
        }),
      );
    });

    it("processes at most 100 eligible declarations in one run even when >100 exist (test 1)", async () => {
      const f = fixture();
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      for (let i = 1; i <= 150; i++) {
        const id = `occ-${i}`;
        f.occupants.set(id, {
          ...primaryOccupant,
          id,
          fullName: "Nguyen Van " + String.fromCharCode(65 + (i % 26)),
          identityNumber: `001090${String(i).padStart(6, "0")}`,
        });
      }

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), true);

      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({
          status: "COMPLETED",
          totalCount: 100,
          successCount: 100,
        }),
      );
    });

    it("scanner skips excluded occupants and continues keyset pages until it gathers 100 eligible or reaches EOF (test 2)", async () => {
      const f = fixture();
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      for (let i = 1; i <= 100; i++) {
        const id = `occ-p1-${i}`;
        f.occupants.set(id, {
          ...primaryOccupant,
          id,
          fullName: "Nguyen Van " + String.fromCharCode(65 + (i % 26)),
          identityNumber: `001091${String(i).padStart(6, "0")}`,
        });
        if (i <= 80) {
          f.declarations.set(`decl-p1-${i}`, {
            id: `decl-p1-${i}`,
            hotelId: "hotel-1",
            occupantId: id,
            status: "SUBMITTED",
            declarationKind: "VIETNAMESE",
            revision: 1,
            version: 1,
          });
        }
      }

      for (let i = 1; i <= 50; i++) {
        const id = `occ-p2-${i}`;
        f.occupants.set(id, {
          ...primaryOccupant,
          id,
          fullName: "Tran Van " + String.fromCharCode(65 + (i % 26)),
          identityNumber: `001092${String(i).padStart(6, "0")}`,
        });
      }

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), true);

      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({
          status: "COMPLETED",
          totalCount: 70,
          successCount: 70,
        }),
      );
    });

    it("completed daily batch with backlog creates exactly one persistent +30m continuation; no backlog creates none (test 3)", async () => {
      const f = fixture();
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      for (let i = 1; i <= 120; i++) {
        const id = `occ-cont-${i}`;
        f.occupants.set(id, {
          ...primaryOccupant,
          id,
          fullName: "Nguyen Thi " + String.fromCharCode(65 + (i % 26)),
          identityNumber: `001093${String(i).padStart(6, "0")}`,
        });
      }

      const scheduledDate = new Date("2026-09-16T04:30:00.000Z");
      await f.service.executeAutoSubmitForHotel("hotel-1", scheduledDate, true);

      expect(f.repository.createScheduledAutoSubmitRun).toHaveBeenCalledTimes(1);
      expect(f.repository.createScheduledAutoSubmitRun).toHaveBeenCalledWith(
        "hotel-1",
        new Date("2026-09-16T05:00:00.000Z"),
        true,
        "CONTINUATION_30M",
      );

      // Part B: No backlog -> no continuation
      (f.repository.createScheduledAutoSubmitRun as jest.Mock).mockClear();
      for (let i = 1; i <= 100; i++) {
        f.declarations.set(`decl-cont-${i}`, {
          id: `decl-cont-${i}`,
          hotelId: "hotel-1",
          occupantId: `occ-cont-${i}`,
          status: "SUBMITTED",
          declarationKind: "VIETNAMESE",
          revision: 1,
          version: 1,
        });
      }

      await f.service.executeAutoSubmitForHotel(
        "hotel-1",
        new Date("2026-09-16T05:00:00.000Z"),
        true,
      );
      expect(f.repository.createScheduledAutoSubmitRun).not.toHaveBeenCalled();
    });

    it("manual 15s batch is capped at 100 and does not create an automatic 30m continuation even when backlog remains (test 5)", async () => {
      const f = fixture();
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      for (let i = 1; i <= 120; i++) {
        const id = `occ-man-${i}`;
        f.occupants.set(id, {
          ...primaryOccupant,
          id,
          fullName: "Le Van " + String.fromCharCode(65 + (i % 26)),
          identityNumber: `001094${String(i).padStart(6, "0")}`,
        });
      }

      (f.repository.claimAutoSubmitRunLease as jest.Mock).mockResolvedValueOnce({
        id: "run-manual-15s",
        hotelId: "hotel-1",
        scheduledFor: new Date(),
        status: "RUNNING",
        leaseExpiresAt: new Date(Date.now() + 600_000),
        dryRun: true,
        summaryJson: { trigger: "MANUAL_DELAYED" },
      });

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), true);

      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-manual-15s",
        expect.objectContaining({
          status: "COMPLETED",
          totalCount: 100,
          successCount: 100,
        }),
      );
      expect(f.repository.createScheduledAutoSubmitRun).not.toHaveBeenCalled();
    });
  });
});
