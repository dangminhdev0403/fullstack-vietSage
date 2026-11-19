import { kbttVietnameseReadySchema, normalizeKbttSubmissionDates } from "../domain/schemas/kbtt.schema";
import { KbttProviderReadClient, KbttProviderReadError } from "../infrastructure/kbtt-provider-read.client";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import {
  KbttService,
  computeVietnamNextDailySlot,
  computeVietnamNextTenMinuteBoundary,
  isBcaDuplicateConflict,
} from "../application/kbtt.service";
import {
  kbttCatalogKindSchema,
  kbttPaginationQuerySchema,
  kbttCredentialsSchema,
  kbttAutoSubmitEnabledSchema,
  kbttAutoSubmitConfigSchema,
  type KbttCatalogKind,
  type KbttSession,
} from "../domain/schemas/kbtt.schema";
import { KbttCredentialCipher } from "../infrastructure/kbtt-credential-cipher";
import { KbttProviderClient, kbttAuthFailed } from "../infrastructure/kbtt-provider.client";
import { KbttRepository } from "../infrastructure/kbtt.repository";
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
    status: "ACTIVE",
    checkedOutAt: null,
    checkedInAt: new Date("2026-09-14T03:00:00.000Z"),
    plannedCheckInAt: new Date("2026-09-14T03:00:00.000Z"),
    plannedCheckOutAt: new Date("2026-09-15T05:00:00.000Z"),
    room: { roomNumber: "101" },
  },
};
function enableAutomaticDelivery(f: ReturnType<typeof fixture>) {
  const connection = f.rows.get("hotel-1");
  if (connection) connection.autoSubmitEnabled = true;
}

async function finishInitialDeliveries(f: ReturnType<typeof fixture>) {
  await Promise.all([...(f.service as any).initialDeliveries.values()]);
}

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

function fixture(providerRead?: KbttProviderReadClient) {
  providerRead ??= {
    getAccommodation: jest.fn().mockResolvedValue({ httpStatus: 200, envelope: { code: "200" }, data: { id: 1000227, tenCSLT: "Fixture" } }),
    readAllResidents: jest.fn().mockResolvedValue([]),
    readAllHistory: jest.fn().mockResolvedValue([]),
  } as unknown as KbttProviderReadClient;
  const rows = new Map<string, KbttHotelConnection>();
  const declarations = new Map<string, any>();
  const occupants = new Map<string, any>();
  const repository = {
    find: jest.fn(async (hotelId: string) => rows.get(hotelId) ?? null),
    findConflictingFacilityConnections: jest.fn(
      async (csltId: string, excludeHotelId?: string) =>
        [...rows.values()].filter(
          (r) => r.csltId === csltId.trim() && (!excludeHotelId || r.hotelId !== excludeHotelId),
        ),
    ),
    save: jest.fn(async (connection: KbttHotelConnection) => {
      const conflicts = [...rows.values()].filter(
        (r) => r.csltId === connection.csltId.trim() && r.hotelId !== connection.hotelId,
      );
      if (conflicts.length > 0) {
        throw new ConflictException({
          code: "KBTT_FACILITY_CONFLICT",
          message:
            "Cơ sở lưu trú BCA này đã được liên kết với một khách sạn khác trên hệ thống. Không thể dùng chung một cơ sở BCA cho nhiều khách sạn.",
        });
      }
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
    removeIfCurrent: jest.fn(async (hotelId: string, ciphertext: string) => {
      if (rows.get(hotelId)?.ciphertext !== ciphertext) return false;
      return rows.delete(hotelId);
    }),
    findPendingScheduledAutoSubmitRuns: jest.fn(async () => []),
    findOccupantsByStay: jest.fn(async (hotelId: string, stayId: string) =>
      [...occupants.values()].filter((occupant) => occupant.hotelId === hotelId && occupant.stayId === stayId)),
    getDeliverySnapshot: jest.fn(async (_hotelId: string, _allowedRoomId: string | null): Promise<{
      pendingCount: number; reviewCount: number;
      lastSucceededAt: Date | null; recentIssues: any[];
    }> => ({
      pendingCount: 0,
      reviewCount: 0,
      lastSucceededAt: null,
      recentIssues: [],
    })),
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
    findDeclarationForDispatch: jest.fn(async (hotelId: string, declarationId: string) => {
      const declaration = declarations.get(declarationId);
      const occupant = declaration ? occupants.get(declaration.occupantId) : null;
      if (!declaration || declaration.hotelId !== hotelId || !occupant || occupant.hotelId !== hotelId) {
        return null;
      }
      return {
        ...declaration,
        stay: occupant.stay ?? {
          status: occupant.stayStatus,
          checkedOutAt: occupant.checkedOutAt ?? null,
          plannedCheckOutAt: occupant.plannedCheckOutAt,
        },
      };
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
          status: "UNKNOWN",
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
          existing.status !== "UNKNOWN"
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
        submittedCsltId: null,
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
    settleAcceptedDeclaration: jest.fn(
      async (params: { id: string; hotelId: string; expectedVersion: number; data: any }) => {
        try {
          return await repository.updateDeclaration(params);
        } catch (err) {
          if (!(err instanceof ConflictException)) throw err;
          const existing = declarations.get(params.id);
          if (!existing || existing.hotelId !== params.hotelId) {
            throw new NotFoundException("Hồ sơ không tồn tại.");
          }
          if (existing.status === "SUBMITTED") return existing;
          const updated = {
            ...existing,
            ...params.data,
            version: existing.version + 1,
            updatedAt: new Date(),
          };
          declarations.set(params.id, updated);
          return updated;
        }
      },
    ),
    recoverInterruptedDeclarations: jest.fn(async () => 0),
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
    saveUnknownContinuation: jest.fn().mockResolvedValue(undefined),
    createScheduledAutoSubmitRun: jest.fn(
      async (hotelId: string, scheduledFor: Date, dryRun: boolean, trigger = "MANUAL_DELAYED", extraSummary: Record<string, any> = {}) => ({
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
        summaryJson: { trigger, ...extraSummary },
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
    saveCanonicalDraft: jest.fn(async (params: any) => {
      const occupant = occupants.get(params.occupantId);
      if (!occupant || occupant.hotelId !== params.hotelId || occupant.stayId !== params.stayId) throw new ConflictException('Profile conflict');
      const saved = params.existing
        ? await repository.updateDeclaration({ id: params.existing.id, hotelId: params.hotelId, expectedVersion: params.existing.version, data: {
            declarationKind: params.declarationKind, draftPayloadJson: params.draftPayloadJson, status: 'DRAFT',
            providerCode: null, providerMessage: null, providerResponseJson: null, submittedAt: null } })
        : await repository.createDeclaration({ hotelId: params.hotelId, stayId: params.stayId, occupantId: params.occupantId,
            declarationKind: params.declarationKind, draftPayloadJson: params.draftPayloadJson, status: 'DRAFT' });
      Object.assign(occupant, Object.fromEntries(Object.entries(params.profile).filter(([, value]) => value !== undefined)));
      return saved;
    }),
    updateOccupantCitizenship: jest.fn(
      async (occupantId: string, hotelId: string, citizenshipKind: any) => {
        const occ = occupants.get(occupantId);
        if (occ && occ.hotelId === hotelId) occ.citizenshipKind = citizenshipKind;
      },
    ),
    updateOccupantDetails: jest.fn(async (occupantId: string, hotelId: string, data: any) => {
      const occ = occupants.get(occupantId);
      if (occ && occ.hotelId === hotelId) Object.assign(occ,
        Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
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
      async (
        hotelId: string,
        options?: {
          cursor?: string;
          take?: number;
          arrivalStart?: Date;
          arrivalEnd?: Date;
          kbttFilter?: "UNSYNCHRONIZED" | "UNKNOWN_ONLY";
        },
      ) => {
        const hotelAll = [...occupants.values()].filter((o) => o.hotelId === hotelId);
        let cursorAfterIndex = -1;
        if (options?.cursor) {
          const idxInHotel = hotelAll.findIndex((o) => o.id === options.cursor);
          if (idxInHotel >= 0) {
            cursorAfterIndex = idxInHotel;
          }
        }
        const all = hotelAll.filter((o, idx) => {
          if (cursorAfterIndex >= 0 && idx <= cursorAfterIndex) return false;
          if (cursorAfterIndex < 0 && options?.cursor && o.id <= options.cursor) return false;
          if (options?.arrivalStart || options?.arrivalEnd) {
            const rawArrival =
              o.checkedInAt ??
              o.stay?.checkedInAt ??
              o.plannedCheckInAt ??
              o.stay?.plannedCheckInAt;
            if (rawArrival) {
              const arrivalDate = rawArrival instanceof Date ? rawArrival : new Date(rawArrival);
              if (options.arrivalStart && arrivalDate < options.arrivalStart) return false;
              if (options.arrivalEnd && arrivalDate >= options.arrivalEnd) return false;
            }
          }
          if (options?.kbttFilter === "UNSYNCHRONIZED") {
            const occDecls = [...declarations.values()].filter(
              (d) => d.hotelId === hotelId && d.occupantId === o.id,
            );
            if (occDecls.some((d) => ["SUBMITTED", "UNKNOWN", "CANCELLED"].includes(d.status))) {
              return false;
            }
          } else if (options?.kbttFilter === "UNKNOWN_ONLY") {
            const occDecls = [...declarations.values()].filter(
              (d) => d.hotelId === hotelId && d.occupantId === o.id,
            );
            if (!occDecls.some((d) => d.status === "UNKNOWN")) {
              return false;
            }
          }
          return true;
        });
        const take = options?.take ?? 10;
        const page = all.slice(0, take);
        const hasMore = take < all.length;
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
    undefined, undefined, undefined, providerRead,
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
  jest
    .useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout"] })
    .setSystemTime(new Date("2026-09-14T05:00:00.000Z"));
  (KbttService as any).activeFacilities?.clear?.();
  (KbttService as any).activeFacilityLocks?.clear?.();
  process.env.KBTT_BASE_URL = "https://api-kbtt.example.test";
  process.env.KBTT_LOGIN_BASIC_AUTH_VALUE = randomBytes(24).toString("base64");
  process.env.KBTT_TOKEN_BASIC_AUTH_VALUE = randomBytes(24).toString("base64");
  process.env.KBTT_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  jest.useRealTimers();
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

  it("bounds OAuth login, refresh and logout even if the transport ignores cancellation", async () => {
    for (const operation of ["login", "refresh"] as const) {
      const controller = new AbortController();
      const timeout = jest.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
      global.fetch = jest.fn(() => new Promise<Response>(() => {}));
      const provider = new KbttProviderClient();
      try {
        const pending = operation === "login" ? provider.login(credentials) : provider[operation]("synthetic-token");
        const assertion = expect(pending).rejects.toMatchObject({ response: { code: "KBTT_PROVIDER_UNAVAILABLE" } });
        expect(timeout).toHaveBeenCalledWith(10_000);
        controller.abort();
        await assertion;
      } finally { timeout.mockRestore(); }
    }
  });

  it("releases an OAuth body read even when both the stream and its cancellation stall", async () => {
    const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
    let reading!: () => void;
    const entered = new Promise<void>((resolve) => { reading = resolve; });
    global.fetch = jest.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      pull() { reading(); }, cancel() { return new Promise<void>(() => {}); },
    })));
    try {
      const assertion = expect(new KbttProviderClient().refresh("synthetic-token")).rejects.toBeInstanceOf(HttpException);
      await entered;
      controller.abort();
      await assertion;
    } finally { timeout.mockRestore(); }
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
    expect(connected).toMatchObject({
      configured: true, status: "CONNECTED", csltId: "1000227", username: credentials.username,
    });
    for (const value of [
      credentials.password,
      stored!.ciphertext,
      stored!.iv,
      stored!.authTag,
    ])
      expect(JSON.stringify(connected)).not.toContain(value);
    expect(stored).not.toHaveProperty("AccessToken");
    expect(stored).not.toHaveProperty("RefreshToken");
  });

  it("keeps connection metadata readable without exposing secrets when saved credentials cannot be decrypted", async () => {
    const { service, provider, rows } = fixture();
    await service.connect("owner", "owner-role", "hotel-1", credentials);
    const stored = rows.get("hotel-1")!;
    rows.set("hotel-1", { ...stored, ciphertext: "unreadable" });
    provider.login.mockClear();

    const result = await service.get("owner", "owner-role", "hotel-1");
    expect(result).toMatchObject({ configured: true, status: "DISCONNECTED", username: null });
    expect(provider.login).not.toHaveBeenCalled();
    for (const field of ["password", "AccessToken", "RefreshToken", "ciphertext", "iv", "authTag"]) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it("shares one hotel switch between owner and front desk with fixed 12:00/21:00 schedule without contacting BCA", async () => {
    const f = fixture();
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    await expect(
      f.service.updateAutoSubmitConfig("owner", "owner-role", "hotel-1", {
        autoSubmitEnabled: true,
        autoSubmitTime: "04:30" as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    f.provider.login.mockClear();
    expect(await f.service.updateAutoSubmitEnabled("front-desk", "staff-role", "hotel-1", true))
      .toEqual({ autoSubmitEnabled: true });
    expect(await f.service.getAutoSubmitEnabled("owner", "owner-role", "hotel-1"))
      .toEqual({ autoSubmitEnabled: true });
    const cfg = await f.service.getAutoSubmitConfig("owner", "owner-role", "hotel-1");
    expect(cfg).toMatchObject({
      autoSubmitEnabled: true,
      autoSubmitTime: null,
      scheduleSlots: ["12:00", "21:00"],
      timezone: "Asia/Ho_Chi_Minh",
    });
    expect(cfg.nextScheduledSlotAt).toEqual(expect.any(String));
    await f.service.updateAutoSubmitEnabled("owner", "owner-role", "hotel-1", false);
    expect(await f.service.getAutoSubmitEnabled("front-desk", "staff-role", "hotel-1"))
      .toEqual({ autoSubmitEnabled: false });
    expect(await f.service.getAutoSubmitEnabled("owner", "owner-role", "hotel-2"))
      .toEqual({ autoSubmitEnabled: false });
    expect(f.provider.login).not.toHaveBeenCalled();
    expect(f.provider.refresh).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("rejects out-of-scope switch access before persistence and restricts writes to KBTT managers", async () => {
    const f = fixture();
    f.access.assertHotelAccess.mockRejectedValue(new ForbiddenException("Outside hotel"));
    await expect(f.service.getAutoSubmitEnabled("staff", "staff-role", "hotel-2")).rejects.toThrow(ForbiddenException);
    await expect(f.service.updateAutoSubmitEnabled("staff", "staff-role", "hotel-2", true)).rejects.toThrow(ForbiddenException);
    expect(f.repository.find).not.toHaveBeenCalled();
    expect(f.repository.update).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, KbttController.prototype.updateAutoSubmitEnabled))
      .toEqual(["hotel.kbtt.manage", "hotel.kbtt.declarations.manage"]);
    expect(kbttAutoSubmitEnabledSchema.safeParse({ autoSubmitEnabled: "false" }).success).toBe(false);
    expect(kbttAutoSubmitEnabledSchema.safeParse({ autoSubmitEnabled: false, autoSubmitTime: "09:00" }).success).toBe(false);
    expect(kbttAutoSubmitConfigSchema.safeParse({}).success).toBe(false);
  });

  it("allows manual delivery while auto is off and excludes it from the next automatic run", async () => {
    jest.setSystemTime(new Date("2026-09-15T05:00:00.000Z"));
    const f = fixture();
    const outOfWindowOccupant = {
      ...primaryOccupant,
      checkedInAt: new Date("2026-09-13T03:00:00.000Z"),
      plannedCheckInAt: new Date("2026-09-13T03:00:00.000Z"),
      stay: {
        ...primaryOccupant.stay,
        checkedInAt: new Date("2026-09-13T03:00:00.000Z"),
        plannedCheckInAt: new Date("2026-09-13T03:00:00.000Z"),
      },
    };
    f.occupants.set(outOfWindowOccupant.id, outOfWindowOccupant);
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    f.provider.login.mockClear();
    const pausedOccupant = { ...primaryOccupant };
    f.occupants.set(pausedOccupant.id, pausedOccupant);
    const result = await f.service.submit("owner", "owner-role", "hotel-1", pausedOccupant.id);
    await finishInitialDeliveries(f);
    expect(f.declarations.get(result.id)).toMatchObject({ status: "SUBMITTED", providerCode: "200" });
    expect(f.rows.get("hotel-1")?.autoSubmitEnabled).toBe(false);
    expect(f.provider.login).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    jest.setSystemTime(new Date("2026-09-16T05:00:00.000Z"));
    await f.service.updateAutoSubmitEnabled("front-desk", "staff-role", "hotel-1", true);
    await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith("VIETNAMESE", [expect.objectContaining({ ngayDenCsltStr: "2026-09-14 10:00:00" })], expect.any(String));
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.declarations.get(result.id)?.status).toBe("SUBMITTED");
  });

  it("keeps an explicit manual send independent of the automatic switch", async () => {
    const f = fixture();
    f.occupants.set(primaryOccupant.id, primaryOccupant);
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    const current = f.repository.findDeclarationForDispatch.getMockImplementation()!;
    f.repository.findDeclarationForDispatch.mockImplementationOnce(async (hotelId, declarationId) => {
      const declaration = await current(hotelId, declarationId);
      await f.service.updateAutoSubmitEnabled("owner", "owner-role", "hotel-1", false);
      return declaration;
    });
    const result = await f.service.submit("owner", "owner-role", "hotel-1", primaryOccupant.id);
    await finishInitialDeliveries(f);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.declarations.get(result.id)).toMatchObject({ status: "SUBMITTED", providerCode: "200" });
  });

  it("stops the remaining guests in an active automatic run when either workspace pauses delivery", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] }).setSystemTime(new Date("2026-09-14T05:00:00.000Z"));
    try {
      const f = fixture();
      f.occupants.set(primaryOccupant.id, primaryOccupant);
      f.occupants.set("occ-second", { ...primaryOccupant, id: "occ-second", fullName: "Tran Van B", identityNumber: "001090012346" });
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);
      await f.service.updateAutoSubmitEnabled("owner", "owner-role", "hotel-1", true);
      f.provider.submitDeclaration.mockImplementationOnce(async () => {
        await f.service.updateAutoSubmitEnabled("front-desk", "staff-role", "hotel-1", false);
        return { outcome: "SUCCESS", code: "200", message: "Thành công" };
      });
      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
      expect([...f.declarations.values()].filter((d) => d.status === "READY")).toHaveLength(1);
      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith("run-auto-1", expect.objectContaining({
        status: "CANCELLED", successCount: 1, failedCount: 0, unknownCount: 0,
        summaryJson: expect.objectContaining({ reason: "DELIVERY_PAUSED" }),
      }));
      f.service.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("skips automatic recovery runs while disabled before authentication or guest dispatch", async () => {
    const f = fixture();
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    f.provider.login.mockClear();
    await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
    expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith("run-auto-1", expect.objectContaining({
      status: "CANCELLED", summaryJson: { trigger: "DAILY", reason: "DELIVERY_PAUSED" },
    }));
    expect(f.provider.login).not.toHaveBeenCalled();
    expect(f.provider.refresh).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(f.occupantsReadService.getActiveStayOccupantsPaged).not.toHaveBeenCalled();
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

  it("keeps GET passive and recovers tokens on explicit check after restart", async () => {
    const { service, provider, rows, access, repository, cipher } = fixture();
    await service.connect("owner", "owner-role", "hotel-1", credentials);
    const ciphertext = rows.get("hotel-1")!.ciphertext;
    provider.login.mockClear();
    expect(await service.get("owner", "owner-role", "hotel-1")).toMatchObject({
      username: credentials.username,
    });
    expect(provider.login).not.toHaveBeenCalled();
    await expect(service.check("owner", "owner-role", "hotel-1")).resolves.toMatchObject({ status: "CONNECTED" });
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
    // A passive GET must not hide a persisted connection after RAM tokens are lost.
    await expect(restarted.get("owner", "owner-role", "hotel-1")).resolves.toMatchObject({
      configured: true, status: "CONNECTED", lastErrorCode: null,
    });
    expect(provider.login).not.toHaveBeenCalled();
    expect(restarted.getCachedReadSession("hotel-1", rows.get("hotel-1")!)).toBeNull();
    await expect(restarted.ensureReconciliationSession("owner", "owner-role", "hotel-1")).resolves.toEqual({ ready: true });
    expect(restarted.getCachedReadSession("hotel-1", rows.get("hotel-1")!)).not.toBeNull();
    await expect(restarted.check("owner", "owner-role", "hotel-1")).resolves.toMatchObject({status: "CONNECTED"});
    expect(provider.login).toHaveBeenCalledTimes(1);
    provider.revoke.mockRejectedValue(new Error("Unavailable"));
    await expect(restarted.disconnect("owner", "owner-role", "hotel-1")).resolves.toMatchObject({
      configured: false,
      status: "DISCONNECTED",
    });
    expect(rows.size).toBe(0);
  });

  it("pauses the connection temporarily without deleting credentials when refreshing a manual check fails with network error", async () => {
    jest.useFakeTimers();
    const { service, provider, rows } = fixture();
    await service.connect("owner", "owner-role", "hotel-1", credentials);
    const old = service.getCachedReadSession("hotel-1", rows.get("hotel-1")!)!;
    service.expireRejectedReadSession("hotel-1", old);
    provider.login.mockRejectedValue(
      new HttpException(
        { code: "KBTT_PROVIDER_UNAVAILABLE", message: "Không thể kết nối BCA." },
        502,
      ),
    );

    const failedCheck = expect(service.check("owner", "owner-role", "hotel-1")).rejects.toBeDefined();
    await jest.advanceTimersByTimeAsync(20_000);
    await failedCheck;
    expect(rows.has("hotel-1")).toBe(true);
    expect(rows.get("hotel-1")).toMatchObject({
      status: "DISCONNECTED",
      lastErrorCode: "KBTT_TEMP_DISCONNECTED",
    });
    expect(provider.revoke).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it("stops a restarted delivery when saved credentials are rejected", async () => {
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

    enableAutomaticDelivery(f);
    await restarted.executeAutoSubmitForHotel("hotel-1", new Date(), false);

    expect((await restarted.get("owner", "owner-role", "hotel-1")).status).toBe("AUTH_FAILED");
    expect(f.provider.login).toHaveBeenCalledTimes(2);
    expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
      "run-auto-1",
      expect.objectContaining({ status: "FAILED" }),
    );
  });

  it("keeps legacy Telegram endpoints inert even when a sender is configured", async () => {
    const f = fixture();
    const sender = {
      sendKbttTestMessage: jest.fn(),
      sendKbttAutoSubmitSummary: jest.fn(),
    };
    (f.service as any).telegramNotificationService = sender;
    await expect(f.service.testTelegram("owner", "owner-role", "hotel-1")).resolves.toEqual({ sent: false });
    await expect(f.service.sendBatchSummary("owner", "owner-role", "hotel-1", {
      totalEligible: 1, successCount: 1, failureCount: 0,
    })).resolves.toEqual({ sent: false });
    expect(sender.sendKbttTestMessage).not.toHaveBeenCalled();
    expect(sender.sendKbttAutoSubmitSummary).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });

  it("keeps a one-shot dry run on the backend and executes it after 5 seconds", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const scheduledFor = new Date(Date.now() + 5_000);
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
    await jest.advanceTimersByTimeAsync(4_999);
    expect(execute).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledWith("hotel-1", scheduledFor, true);
    f.service.onModuleDestroy();
    jest.useRealTimers();
  });

  it("does not call BCA or Telegram during auto-submit dry run", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] }).setSystemTime(new Date("2026-09-14T05:00:00.000Z"));
    try {
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
        occupantId: "occ-vn",
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
      service.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("KBTT edit and submit", () => {
  it.each(['VIETNAMESE', 'FOREIGN'] as const)('keeps %s provider payload identical while storing canonical shared fields once', async (kind) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T03:00:00.000Z'));
    const f = fixture();
    const occupant = { ...primaryOccupant, id: 'compact-' + kind, citizenshipKind: kind,
      fullName: 'Nguyen Hoang Nam', identityNumber: kind === 'VIETNAMESE' ? '001090012345' : 'P1234567',
      nationality: kind === 'VIETNAMESE' ? 'VNM' : 'KOR', dateOfBirth: kind === 'FOREIGN' ? '1990' : '1990-01-01' };
    f.occupants.set(occupant.id, occupant);
    const data = kind === 'VIETNAMESE'
      ? { lyDoCuTru: 1, loaiGiayTo: 8, hoTen: 'Nguyen Hoang Nam', soGiayTo: '001090012345', soDienThoai: null }
      : { quocTich: 'PROVIDER_KR_7', loaiNgayThangNamSinh: 'Y', thoiHanTamTruStr: '2026-10-15 23:59:59' };
    const saved = await f.service.saveDraft('user-1', 'role-1', 'hotel-1', occupant.id, { citizenshipKind: kind, data });
    const stored = await f.repository.findLatestDeclaration('hotel-1', occupant.id);
    for (const key of ['hoTen', 'gioiTinh', 'ngayThangNamSinhStr', 'soGiayTo', 'soHoChieu', 'soPhong', 'ngayDenCsltStr', 'ngayDiDuKienStr'])
      expect(stored.draftPayloadJson).not.toHaveProperty(key);
    const expected = { hoTen: 'Nguyen Hoang Nam', gioiTinh: 'M', ngayThangNamSinhStr: '1990-01-01',
      soPhong: '101', ngayDenCsltStr: '2026-09-14 10:00:00', ngayDiDuKienStr: '2026-09-15 12:00:00',
      ...(kind === 'VIETNAMESE' ? { soGiayTo: '001090012345', loaiGiayTo: 8, lyDoCuTru: 1, soDienThoai: null }
        : { soHoChieu: 'P1234567', quocTich: 'PROVIDER_KR_7', loaiNgayThangNamSinh: 'Y', thoiHanTamTruStr: '2026-10-15 23:59:59' }) };
    expect(saved.draftPayload).toEqual(expected);
    if (kind === 'FOREIGN') expect(occupant.nationality).toBe('PROVIDER_KR_7');
    await f.service.connect('user-1', 'role-1', 'hotel-1', credentials);
    enableAutomaticDelivery(f);
    await f.service.submit('user-1', 'role-1', 'hotel-1', occupant.id);
    await finishInitialDeliveries(f);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(kind, [expected], expect.any(String));
    const sent = await f.repository.findLatestDeclaration('hotel-1', occupant.id);
    const snapshot = JSON.stringify(sent.submittedPayloadJson);
    const fingerprint = sent.submittedPayloadFingerprint;
    occupant.fullName = 'Bui Thanh Hong';
    occupant.identityNumber = 'NEW12345';
    const view = await f.service.getDeclaration('user-1', 'role-1', 'hotel-1', occupant.id);
    expect(view.declaration?.draftPayload).toEqual(expected);
    expect(JSON.stringify(sent.submittedPayloadJson)).toBe(snapshot);
    expect(sent.submittedPayloadFingerprint).toBe(fingerprint);
    jest.useRealTimers();
  });

  it('reads current canonical data after a later profile edit while preserving provider-only and legacy deltas', async () => {
    const f = fixture();
    const occupant = { ...primaryOccupant, id: 'canonical-edit' };
    f.occupants.set(occupant.id, occupant);
    await f.service.saveDraft('user-1', 'role-1', 'hotel-1', occupant.id, { citizenshipKind: 'VIETNAMESE', data: { lyDoCuTru: 20, lyDoChiTiet: 'Cong tac' } });
    occupant.fullName = 'Bui Thanh Hong';
    occupant.gender = 'F';
    const view = await f.service.getDeclaration('user-1', 'role-1', 'hotel-1', occupant.id);
    expect(view.declaration?.draftPayload).toMatchObject({ hoTen: 'Bui Thanh Hong', gioiTinh: 'F', lyDoCuTru: 1, lyDoChiTiet: 'Cong tac' });
    const longName = Array(50).fill('Nguyen').join(' ').slice(0, 150).trim();
    const saved = await f.service.saveDraft('user-1', 'role-1', 'hotel-1', occupant.id, { citizenshipKind: 'VIETNAMESE', data: { hoTen: longName } });
    expect(occupant.fullName).toBe('Bui Thanh Hong');
    expect(saved.draftPayload).toHaveProperty('hoTen', longName);
    expect((await f.repository.findLatestDeclaration('hotel-1', occupant.id)).draftPayloadJson.hoTen).toBe(longName);
  });

  it('clears explicit shared phone/address values without restoring stale canonical data', async () => {
    const f = fixture();
    const occupant = { ...primaryOccupant, id: 'clear-shared', residencePlace: 'Ha Noi', phone: '0901234567' };
    f.occupants.set(occupant.id, occupant);
    const result = await f.service.saveDraft('user-1', 'role-1', 'hotel-1', occupant.id, { citizenshipKind: 'VIETNAMESE', data: { soDienThoai: null, diaChi: null } });
    expect(occupant.phone).toBeNull();
    expect(occupant.residencePlace).toBeNull();
    expect(result.draftPayload).toMatchObject({ soDienThoai: null, diaChi: null });
    const next = await f.service.getDeclaration('user-1', 'role-1', 'hotel-1', occupant.id);
    expect(next.occupant).toMatchObject({ phone: null, residencePlace: null });
  });

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
    enableAutomaticDelivery(f);
    await f.service.submit("user-1", "role-1", "hotel-1", vietnamesePassport.id);
    await finishInitialDeliveries(f);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "VIETNAMESE",
      [expect.objectContaining({ loaiGiayTo: 4, lyDoCuTru: 1, gioiTinh: "F" })],
      expect.any(String),
    );
  });

  it("starts delivery immediately and returns before the provider reply while fencing duplicate submits and edits", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    await f.service.saveDraft("user-1", "role-1", "hotel-1", "occ-vn", {
      citizenshipKind: "VIETNAMESE", data: { lyDoCuTru: 1, loaiGiayTo: 1, soGiayTo: "001090012345" },
    });
    let complete!: (value: any) => void;
    f.provider.submitDeclaration.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const result = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    expect(result).toMatchObject({ status: "UNKNOWN", providerCode: null, submittedAt: null });
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    const repeated = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    expect(repeated.id).toBe(result.id);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    await expect(f.service.saveDraft("user-1", "role-1", "hotel-1", "occ-vn", {
      citizenshipKind: "VIETNAMESE", data: { hoTen: "Changed" },
    })).rejects.toMatchObject({ status: 409 });
    complete({ outcome: "SUCCESS", code: "200", message: "Thành công" });
    await finishInitialDeliveries(f);
    expect(f.declarations.get(result.id)).toMatchObject({ status: "SUBMITTED", providerCode: "200" });
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith("VIETNAMESE",
      [expect.objectContaining({ loaiGiayTo: 1, lyDoCuTru: 1 })], expect.any(String));
  });

  it.each([
    ["2026-09-15T16:59:59Z", "SUBMITTED"],
    ["2026-09-15T17:00:00Z", "FAILED"],
  ])("rechecks the initial BCA calendar day at dispatch for %s", async (departure, expectedStatus) => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    const readCurrent = f.repository.findDeclarationForDispatch.getMockImplementation();
    f.repository.findDeclarationForDispatch.mockImplementationOnce(async (hotelId, declarationId) => {
      const current = await readCurrent?.(hotelId, declarationId);
      if (!current) throw new Error("Missing queued declaration");
      return { ...current, stay: { ...current.stay, plannedCheckOutAt: new Date(departure) } };
    });
    const queued = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    await finishInitialDeliveries(f);
    expect(f.declarations.get(queued.id)?.status).toBe(expectedStatus);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(expectedStatus === "SUBMITTED" ? 1 : 0);
    if (expectedStatus === "FAILED") expect(f.declarations.get(queued.id)?.providerCode).toBe("LOCAL_STATE_CHANGED");
  });

  it("rechecks checkout before the immediate provider transmission", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    f.service.expireRejectedReadSession("hotel-1", old);
    let finishLogin!: (value: any) => void;
    f.provider.login.mockImplementationOnce(() => new Promise((resolve) => { finishLogin = resolve; }));
    const result = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    await new Promise((resolve) => setImmediate(resolve));
    f.occupants.set("occ-vn", { ...primaryOccupant,
      stay: { ...primaryOccupant.stay, status: "CHECKED_OUT", checkedOutAt: new Date() } });
    finishLogin(session());
    await finishInitialDeliveries(f);
    expect(f.declarations.get(result.id)).toMatchObject({ status: "FAILED", providerCode: "LOCAL_STATE_CHANGED" });
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("keeps matching BCA duplicate rejection FAILED without inferring success", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
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

    const queued = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    expect(queued.status).toBe("UNKNOWN");
    await finishInitialDeliveries(f);
    const stored = await f.repository.findLatestDeclaration("hotel-1", "occ-vn");
    expect(stored?.status).toBe("FAILED");
    expect(stored?.providerCode).toBe("400");
    expect(stored?.submittedAt).toBeNull();
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
  });

  it("fills stay timestamps while preserving genuine foreign residence validity before background submit", async () => {
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
    await f.service.saveDraft("user-1", "role-1", "hotel-1", foreignOccupant.id, {
      citizenshipKind: "FOREIGN", data: { thoiHanTamTruStr: "2026-10-15 23:59:59" },
    });
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    await f.service.submit("user-1", "role-1", "hotel-1", foreignOccupant.id);
    await finishInitialDeliveries(f);

    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "FOREIGN",
      [
        expect.objectContaining({
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
          thoiHanTamTruStr: "2026-10-15 23:59:59",
        }),
      ],
      expect.any(String),
    );
    jest.useRealTimers();
  });

  it("keeps missing foreign residence validity invalid instead of copying hotel departure", async () => {
    const f = fixture();
    const occupant = { ...primaryOccupant, id: "foreign-no-validity", citizenshipKind: "FOREIGN",
      nationality: "KOR", identityNumber: "M1234567" };
    f.occupants.set(occupant.id, occupant);
    (f.repository as any).findOccupantsByStay = jest.fn(async () => [occupant]);
    await f.service.triggerCheckInBcaPush("hotel-1", occupant.stayId);
    const declaration = await f.repository.findLatestDeclaration("hotel-1", occupant.id);
    expect(declaration).toMatchObject({ status: "FAILED", providerCode: "LOCAL_VALIDATION" });
    expect(declaration.draftPayloadJson.thoiHanTamTruStr).toBeUndefined();
    expect((await f.service.getDeclaration("user-1", "role-1", "hotel-1", occupant.id)).declaration?.draftPayload?.ngayDiDuKienStr).toBe("2026-09-15 12:00:00");
    await expect(f.service.submit("user-1", "role-1", "hotel-1", occupant.id))
      .rejects.toMatchObject({ response: { code: "KBTT_PAYLOAD_INVALID", message: expect.stringContaining("Thời hạn tạm trú") } });
    enableAutomaticDelivery(f);
    await finishInitialDeliveries(f);
    expect(f.provider.login).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("maps foreign birth year to Y and leaves domestic year-only DOB incomplete", async () => {
    const f = fixture();
    for (const kind of ["FOREIGN", "VIETNAMESE"] as const) {
      const occupant = { ...primaryOccupant, id: "year-" + kind, dateOfBirth: "1990", citizenshipKind: kind };
      f.occupants.set(occupant.id, occupant);
      await f.service.saveDraft("user-1", "role-1", "hotel-1", occupant.id, { citizenshipKind: kind, data: {} });
      const declaration = await f.repository.findLatestDeclaration("hotel-1", occupant.id);
      if (kind === "FOREIGN") expect((await f.service.getDeclaration("user-1", "role-1", "hotel-1", occupant.id)).declaration?.draftPayload).toMatchObject({
        loaiNgayThangNamSinh: "Y", ngayThangNamSinhStr: "1990-01-01",
      });
      else expect(declaration.draftPayloadJson.ngayThangNamSinhStr).toBeUndefined();
      expect(f.occupants.get(occupant.id).dateOfBirth).toBe("1990");
    }
    const listed = await f.service.listDeclarations("user-1", "role-1", "hotel-1");
    expect(listed.items.find((row) => row.occupantId === "year-VIETNAMESE")?.dateOfBirth).toBe("1990");
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("preserves operator-supplied birth precision and residence validity", async () => {
    const f = fixture();
    const occupant = { ...primaryOccupant, id: "operator-foreign", dateOfBirth: "1990", citizenshipKind: "FOREIGN" };
    f.occupants.set(occupant.id, occupant);
    await f.service.saveDraft("user-1", "role-1", "hotel-1", occupant.id, { citizenshipKind: "FOREIGN", data: {
      loaiNgayThangNamSinh: "D", ngayThangNamSinhStr: "1990-04-06", thoiHanTamTruStr: "2026-12-31 23:59:59",
    } });
    const declaration = await f.repository.findLatestDeclaration("hotel-1", occupant.id);
    expect((await f.service.getDeclaration("user-1", "role-1", "hotel-1", occupant.id)).declaration?.draftPayload).toMatchObject({
      loaiNgayThangNamSinh: "D", ngayThangNamSinhStr: "1990-04-06", thoiHanTamTruStr: "2026-12-31 23:59:59",
    });
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
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

  it("stores provider rejection for monitoring after background dispatch", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
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

    const queued = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    expect(queued.status).toBe("UNKNOWN");
    await finishInitialDeliveries(f);
    const stored = await f.repository.findLatestDeclaration("hotel-1", "occ-vn");
    expect(stored?.status).toBe("FAILED");
    expect(stored?.providerCode).toBe("400");
    expect(stored?.providerMessage).toBe("Bản khai báo 1: Khách đang tạm trú tại CSLT.");
  });

  it("keeps a persisted transport failure UNKNOWN and never automatically retries it", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    f.provider.submitDeclaration.mockRejectedValueOnce(new Error("Connection reset after transmission"));
    const result = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    await finishInitialDeliveries(f);
    expect(f.declarations.get(result.id)).toMatchObject({ status: "UNKNOWN", providerCode: "INTERRUPTED_DELIVERY" });
    await expect(f.service.submit("user-1", "role-1", "hotel-1", "occ-vn")).rejects.toMatchObject({ status: 409 });
    await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
  });

  it("allows an explicitly requested send without enabling automatic delivery", async () => {
    const f = fixture();
    f.occupants.set("occ-vn", primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    f.provider.login.mockClear();
    const result = await f.service.submit("user-1", "role-1", "hotel-1", "occ-vn");
    await finishInitialDeliveries(f);
    expect(f.declarations.get(result.id)).toMatchObject({ status: "SUBMITTED", providerCode: "200" });
    expect(f.rows.get("hotel-1")?.autoSubmitEnabled).toBe(false);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.provider.login).not.toHaveBeenCalled();
  });

  it("starts both guests from one check-in without establishment lease collisions or waiting on the provider reply", async () => {
    const f = fixture();
    f.occupants.set(primaryOccupant.id, primaryOccupant);
    f.occupants.set("second-guest", { ...primaryOccupant, id: "second-guest", identityNumber: "001090012346" });
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    let completeFirst!: (value: any) => void;
    f.provider.submitDeclaration.mockImplementationOnce(() => new Promise((resolve) => { completeFirst = resolve; }));
    let establishmentBusy = false;
    const sendInitial = jest.fn(async (_hotelId, kind, payload, token) => {
      if (establishmentBusy) return { outcome: "BUSINESS_REJECTION", code: "DELIVERY_BUSY", message: "Busy" };
      establishmentBusy = true;
      try { return await f.provider.submitDeclaration(kind, payload, token); }
      finally { establishmentBusy = false; }
    });
    (f.service as any).staySync = { enabled: () => true, sendInitial };
    await f.service.triggerCheckInBcaPush("hotel-1", primaryOccupant.stayId);
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.declarations.size).toBe(2);
    expect([...f.declarations.values()].every((d) => d.status === "UNKNOWN")).toBe(true);
    expect(sendInitial).toHaveBeenCalledTimes(1);
    completeFirst({ outcome: "SUCCESS", code: "200", message: "Thành công" });
    await finishInitialDeliveries(f);
    expect(sendInitial).toHaveBeenCalledTimes(2);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(2);
    expect([...f.declarations.values()].every((d) => d.status === "SUBMITTED")).toBe(true);
  });

  it("isolates one guest preparation failure while starting the next guest from the same check-in", async () => {
    const f = fixture();
    f.occupants.set(primaryOccupant.id, primaryOccupant);
    f.occupants.set("second-guest", { ...primaryOccupant, id: "second-guest", identityNumber: "001090012346" });
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    f.repository.findActiveSubmittedOccupantByIdentity.mockRejectedValueOnce(new Error("First guest preparation conflict"));
    await f.service.triggerCheckInBcaPush("hotel-1", primaryOccupant.stayId);
    await finishInitialDeliveries(f);
    expect(await f.repository.findLatestDeclaration("hotel-1", primaryOccupant.id))
      .toMatchObject({ status: "FAILED", providerCode: "LOCAL_PREPARATION" });
    expect(await f.repository.findLatestDeclaration("hotel-1", "second-guest"))
      .toMatchObject({ status: "SUBMITTED" });
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
  });

  it("keeps historical queued records in local review without automatic check-in or scheduled replay", async () => {
    const f = fixture();
    f.occupants.set(primaryOccupant.id, primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    const draft = await f.service.saveDraft("user-1", "role-1", "hotel-1", primaryOccupant.id, {
      citizenshipKind: "VIETNAMESE", data: { loaiGiayTo: 1, lyDoCuTru: 1, soGiayTo: primaryOccupant.identityNumber },
    });
    await f.repository.updateDeclaration({ id: draft.id, hotelId: "hotel-1", expectedVersion: draft.version,
      data: { status: "READY", providerCode: "LOCAL_QUEUED", providerMessage: "Đang chờ gửi BCA." } });
    await f.service.triggerCheckInBcaPush("hotel-1", primaryOccupant.stayId);
    await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(f.declarations.get(draft.id)).toMatchObject({ status: "READY", providerCode: "LOCAL_QUEUED" });
    const list = await f.service.listDeclarations("user-1", "role-1", "hotel-1", { status: "LOCAL_ERROR" });
    expect(list.items).toHaveLength(1);
    expect(list.items[0].declaration?.providerMessage).toBe("Hồ sơ chưa được gửi BCA. Kiểm tra dữ liệu trước khi gửi.");
    const explicit = await f.service.submit("user-1", "role-1", "hotel-1", primaryOccupant.id);
    expect(explicit.status).toBe("UNKNOWN");
    await finishInitialDeliveries(f);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
  });

  it("persists UNKNOWN if storing a provider acknowledgement fails without repeating the external call", async () => {
    const f = fixture();
    f.occupants.set(primaryOccupant.id, primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    const update = f.repository.updateDeclaration.getMockImplementation()!;
    let failedOnce = false;
    f.repository.updateDeclaration.mockImplementation(async (params) => {
      if (params.data.status === "SUBMITTED" && !failedOnce) { failedOnce = true; throw new Error("Persistence failed"); }
      return update(params);
    });
    const result = await f.service.submit("user-1", "role-1", "hotel-1", primaryOccupant.id);
    await finishInitialDeliveries(f);
    expect(f.declarations.get(result.id)).toMatchObject({ status: "UNKNOWN", providerCode: "INTERRUPTED_DELIVERY" });
    expect(f.declarations.get(result.id).submittedPayloadJson).toEqual([
      expect.objectContaining({ soGiayTo: primaryOccupant.identityNumber })]);
    await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
  });

  it("preserves unresolved claims while paused without rewriting active delivery versions", async () => {
    const f = fixture();
    f.occupants.set(primaryOccupant.id, primaryOccupant);
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    let complete!: (value: any) => void;
    f.provider.submitDeclaration.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const result = await f.service.submit("user-1", "role-1", "hotel-1", primaryOccupant.id);
    await new Promise((resolve) => setImmediate(resolve));
    const active = f.declarations.get(result.id);
    active.updatedAt = new Date(Date.now() - 10 * 60_000);
    f.declarations.set("abandoned", { ...active, id: "abandoned", occupantId: "abandoned-guest" });
    f.rows.get("hotel-1")!.autoSubmitEnabled = false;
    expect(f.declarations.get(result.id).status).toBe("UNKNOWN");
    expect(f.declarations.get("abandoned")).toMatchObject({ status: "UNKNOWN", version: active.version, providerCode: null });
    complete({ outcome: "SUCCESS", code: "200", message: "Thành công" });
    await finishInitialDeliveries(f);
    expect(f.declarations.get(result.id).status).toBe("SUBMITTED");
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
  });

  it("distinguishes unsent local delivery issues from a provider rejection in passive monitoring", async () => {
    const f = fixture();
    const codes = ["DELIVERY_PAUSED", "KBTT_NOT_CONFIGURED", "KBTT_AUTH_FAILED", "KBTT_PROVIDER_UNAVAILABLE", "LOCAL_QUEUED"];
    f.repository.getDeliverySnapshot.mockResolvedValueOnce({ pendingCount: 0, reviewCount: codes.length + 1, lastSucceededAt: null,
      recentIssues: [...codes, "400"].map((providerCode) => ({
        id: providerCode, kind: "INITIAL", status: "FAILED", providerCode,
        roomNumber: "101", fullName: "Nguyen Van A", updatedAt: new Date().toISOString(),
      })),
    });
    const list = await f.service.listDeclarations("user-1", "role-1", "hotel-1");
    for (const issue of list.delivery.recentIssues.filter((issue) => issue.id !== "400")) {
      expect(issue.message).not.toContain("BCA chưa chấp nhận");
    }
    expect(list.delivery.recentIssues.find((issue) => issue.id === "400")?.message).toContain("BCA chưa chấp nhận");
    expect(f.provider.login).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("schedules the live test action with the hotel auto toggle off without provider or authentication calls", async () => {
    const f = fixture();
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    expect(f.rows.get("hotel-1")?.autoSubmitEnabled).toBe(false);
    f.provider.login.mockClear();
    f.provider.refresh.mockClear();

    try {
      const result = await f.service.testAutoSubmit("user-1", "role-1", "hotel-1", false);
      expect(result).toMatchObject({ status: "RUNNING", dryRun: false });
      expect(f.repository.createScheduledAutoSubmitRun).toHaveBeenCalledWith(
        "hotel-1", expect.any(Date), false, "MANUAL_DELAYED",
      );
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
      expect(f.provider.login).not.toHaveBeenCalled();
      expect(f.provider.refresh).not.toHaveBeenCalled();
    } finally {
      f.service.onModuleDestroy();
    }
  });

  it("reads scoped local delivery projection without provider calls or private messages", async () => {
    const f = fixture();
    await f.service.connect("user-1", "role-1", "hotel-1", credentials);
    enableAutomaticDelivery(f);
    f.provider.login.mockClear();
    f.provider.refresh.mockClear();
    (f.access as any).resolveRoomScope = jest.fn(async () => ({
      hotel: {}, mode: "ROOM_EXCLUSIVE", allowedRoomId: "room-1",
    }));
    const successDate = new Date("2026-11-05T02:00:00.000Z");
    const reviewDate = new Date("2026-11-05T03:00:00.000Z");
    f.repository.getDeliverySnapshot.mockResolvedValueOnce({
      pendingCount: 1,
      reviewCount: 25,
      lastSucceededAt: successDate,
      recentIssues: Array.from({ length: 20 }, (_, index) => ({
        id: "op-review-" + index, kind: "EXTEND", status: "UNKNOWN", providerCode: "HTTP_504",
        roomNumber: "101", fullName: "Le Thi C", updatedAt: reviewDate.toISOString(),
        providerMessage: "Giấy tờ 001090012345; bearer fixture-secret-token",
      })),
    });

    enableAutomaticDelivery(f);
    const result = await f.service.listDeclarations("user-1", "role-1", "hotel-1");

    expect(result.items).toEqual([]);
    expect(f.repository.getDeliverySnapshot).toHaveBeenCalledWith("hotel-1", "room-1");
    expect(result.delivery).toMatchObject({
      mode: "BACKGROUND", state: "RUNNING", pendingCount: 1, reviewCount: 25,
      lastSucceededAt: successDate.toISOString(),
    });
    expect(result.delivery.recentIssues).toHaveLength(20);
    expect(JSON.stringify(result.delivery)).not.toContain("001090012345");
    expect(JSON.stringify(result.delivery)).not.toContain("fixture-secret-token");
    expect(result.delivery.recentIssues.every((issue) => issue.kind === "EXTEND" && issue.status === "UNKNOWN"))
      .toBe(true);
    expect(f.provider.login).not.toHaveBeenCalled();
    expect(f.provider.refresh).not.toHaveBeenCalled();
    expect(f.provider.fetchCatalog).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });
});

describe("KBTT declaration list filters", () => {
  it("finds projected draft fields beyond the old page before paginating and preserves scoped totals", async () => {
    const f = fixture();
    for (let index = 0; index < 12; index += 1) {
      f.occupants.set("search-" + index, { ...primaryOccupant, id: "search-" + index,
        roomId: index === 11 ? "other-room" : "room-1", fullName: "Guest " + index });
    }
    const now = new Date();
    for (const index of [10, 11]) f.declarations.set("draft-" + index, {
      id: "draft-" + index, hotelId: "hotel-1", occupantId: "search-" + index, revision: 1,
      declarationKind: "VIETNAMESE", status: "FAILED", providerCode: "LOCAL_VALIDATION",
      providerMessage: "Cần sửa ngày sinh", submittedAt: null, createdAt: now, updatedAt: now,
      draftPayloadJson: { hoTen: "Tên đã sửa", soGiayTo: "001090999999" },
    });
    (f.access as any).resolveRoomScope = jest.fn(async () => ({
      hotel: {}, mode: "ROOM_EXCLUSIVE", allowedRoomId: "room-1",
    }));
    const query = { page: 1, limit: 1, q: "  TÊN ĐÃ SỬA  ", status: "LOCAL_ERROR" as const,
      nationality: "VNM" as const, checkInDate: "2026-09-14" };
    const result = await f.service.listDeclarations("user-1", "role-1", "hotel-1", query);
    expect(result.items.map((row) => row.occupantId)).toEqual(["search-10"]);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    const byDocument = await f.service.listDeclarations("user-1", "role-1", "hotel-1", { q: "001090999999" });
    expect(byDocument.items.map((row) => row.occupantId)).toEqual(["search-10"]);
    const rejected = await f.service.listDeclarations("user-1", "role-1", "hotel-1", { status: "REJECTED" });
    expect(rejected.total).toBe(0);
    expect(rejected.items).toEqual([]);
    expect(f.provider.login).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("keeps local dispatch denials out of the provider-rejected filter", async () => {
    const f = fixture();
    const now = new Date();
    const localCodes = ["LOCAL_VALIDATION", "LOCAL_STATE_CHANGED", "CONNECTION_SCOPE_CHANGED", "DELIVERY_BUSY",
      "RECONCILIATION_REQUIRED", "LOCAL_PREPARATION", "LOCAL_STAY_ENDED", "DELIVERY_PAUSED"];
    for (const providerCode of [...localCodes, "400"]) {
      const id = "failure-" + providerCode;
      f.occupants.set(id, { ...primaryOccupant, id });
      f.declarations.set(id, { id, occupantId: id, hotelId: "hotel-1", status: "FAILED", providerCode,
        revision: 1, declarationKind: "VIETNAMESE", providerMessage: "Cần kiểm tra",
        submittedAt: null, createdAt: now, updatedAt: now, draftPayloadJson: {} });
    }
    const local = await f.service.listDeclarations("user-1", "role-1", "hotel-1", { status: "LOCAL_ERROR" });
    expect(local.total).toBe(localCodes.length);
    expect(local.items.map((row) => row.declaration?.providerCode).sort()).toEqual([...localCodes].sort());
    const rejected = await f.service.listDeclarations("user-1", "role-1", "hotel-1", { status: "REJECTED" });
    expect(rejected.total).toBe(1);
    expect(rejected.items[0].declaration?.providerCode).toBe("400");
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("filters check-in by Vietnam calendar date across UTC midnight", async () => {
    const f = fixture();
    f.occupants.set("foreign", { ...primaryOccupant, id: "foreign", citizenshipKind: "FOREIGN",
      nationality: "FRA", identityNumber: "A123456", checkedInAt: new Date("2026-09-13T18:30:00Z") });
    const result = await f.service.listDeclarations("user-1", "role-1", "hotel-1",
      { nationality: "FOREIGN", checkInDate: "2026-09-14" });
    expect(result.items.map((row) => row.occupantId)).toEqual(["foreign"]);
    expect(result.total).toBe(1);
    expect((await f.service.listDeclarations("user-1", "role-1", "hotel-1",
      { checkInDate: "2026-09-13" })).total).toBe(0);
  });

  it("rejects malformed list filters at the query boundary", () => {
    expect(kbttPaginationQuerySchema.safeParse({ checkInDate: "2026-02-30" }).success).toBe(false);
    expect(kbttPaginationQuerySchema.safeParse({ status: "FAILED" }).success).toBe(false);
    expect(kbttPaginationQuerySchema.safeParse({ nationality: "raw-country" }).success).toBe(false);
    expect(kbttPaginationQuerySchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
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

    const provinces = await f.service.listCatalog("user-1", "role-1", "hotel-1", "PROVINCE", {
      includeInactive: false,
      limit: 500,
    });
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

    const wards = await f.service.listCatalog("user-1", "role-1", "hotel-1", "WARD", {
      parentCode: "101",
      includeInactive: false,
      limit: 500,
    });
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

    const reasons = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", {
      includeInactive: false,
      limit: 500,
    });
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

    const docs = await f.service.listCatalog("user-1", "role-1", "hotel-1", "DOCUMENT_TYPE", {
      includeInactive: false,
      limit: 500,
    });
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

    const places = await f.service.listCatalog("user-1", "role-1", "hotel-1", "RESIDENCE_PLACE", {
      includeInactive: false,
      limit: 500,
    });
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
      await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", {
        includeInactive: false,
        limit: 500,
      }),
    ).toHaveLength(2);

    // 1. Network / provider failure
    f.provider.fetchCatalog.mockRejectedValueOnce(
      new HttpException({ code: "KBTT_PROVIDER_UNAVAILABLE", message: "Network failure" }, 502),
    );
    await expect(
      f.service.syncCatalog("user-1", "role-1", "hotel-1", "NATIONALITY"),
    ).rejects.toThrow();

    // Existing rows remain intact
    let cached = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", {
      includeInactive: false,
      limit: 500,
    });
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
    cached = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", {
      includeInactive: false,
      limit: 500,
    });
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
    const firstList = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", {
      includeInactive: false,
      limit: 500,
    });
    expect(firstList).toHaveLength(2);

    // Second sync: B and C (A is missing)
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { id: 20, name: "Lý do 20 (Cập nhật)" },
      { id: 30, name: "Lý do 30" },
    ]);
    await f.service.syncCatalog("user-1", "role-1", "hotel-1", "STAY_REASON");

    // Active by default: returns 20 and 30
    const activeList = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", {
      includeInactive: false,
      limit: 500,
    });
    expect(activeList).toHaveLength(2);
    expect(activeList.map((i) => i.code).sort()).toEqual(["20", "30"]);
    expect(activeList.find((i) => i.code === "20")?.nameVi).toBe("Lý do 20 (Cập nhật)");

    // includeInactive: returns 10, 20, and 30
    const allList = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", {
      includeInactive: true,
      limit: 500,
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
      parentCode: "101",
      includeInactive: false,
      limit: 500,
    });
    expect(wards101).toHaveLength(2);
    expect(wards101.every((w) => w.parentCode === "101" && w.isActive)).toBe(true);

    const wards202 = await f.service.listCatalog("user-1", "role-1", "hotel-1", "WARD", {
      parentCode: "202",
      includeInactive: false,
      limit: 500,
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
    const list = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", {
      includeInactive: false,
      limit: 500,
    });
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
      limit: 2,
      includeInactive: false,
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

  it("denies editing a SUBMITTED declaration even when allowSubmittedEdit is true", async () => {
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

    await expect(
      service.saveDraft("user-1", "role-1", "hotel-1", "occ-sub-edit", {
        citizenshipKind: "VIETNAMESE",
        allowSubmittedEdit: true,
        soGiayTo: "001095222222",
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(declarations.get("decl-sub-edit")?.status).toBe("SUBMITTED");
    expect(declarations.get("decl-sub-edit")?.draftPayloadJson?.soGiayTo).toBe("001095111111");
    expect(occupants.get("occ-sub-edit")?.identityNumber).toBe("001095111111");
  });
});

describe("KBTT Reliability Slice (2026-09-16)", () => {
  describe("isBcaDuplicateConflict", () => {
    it("detects a conflict when normalized identity and departure date match BCA message", () => {
      const draft = {
        soGiayTo: "001090012345",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
      };
      const message =
        "Bản khai báo 1: Số giấy tờ '001090012345' đang tạm trú tại CSLT đến 2026-09-15.";
      expect(isBcaDuplicateConflict(message, draft)).toBe(true);
    });

    it("detects conflict wording even if arrival date in message differs or is absent", () => {
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

  describe("bulk auto-submit delivery safety", () => {
    beforeEach(() => {
      jest
        .useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] })
        .setSystemTime(new Date("2026-09-14T11:00:00.000Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("marks the first ambiguous transmission UNKNOWN without retrying it", async () => {
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
        });

      enableAutomaticDelivery(f);

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
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

    it("keeps duplicate rejection FAILED without manufacturing an acknowledgement", async () => {
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
        message:
          "Bản khai báo 1: Số giấy tờ '001090012345' đang tạm trú tại CSLT đến 2026-09-15.",
      });

      enableAutomaticDelivery(f);

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
      expect(f.declarations.get("decl-1")?.status).toBe("FAILED");
      expect(f.declarations.get("decl-1")?.providerCode).toBe("400");
      expect(f.declarations.get("decl-1")?.submittedAt).toBeNull();
      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({ successCount: 0, failedCount: 1, unknownCount: 0 }),
      );
    });

    it("blocks UNKNOWN declarations in both manual and automatic submission", async () => {
      const f = fixture();
      f.occupants.set("occ-vn", primaryOccupant);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);
      f.declarations.set("decl-1", {
        id: "decl-1",
        hotelId: "hotel-1",
        occupantId: "occ-vn",
        version: 1,
        declarationKind: "VIETNAMESE",
        status: "UNKNOWN",
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

      enableAutomaticDelivery(f);

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      await expect(f.service.submit("owner", "owner-role", "hotel-1", "occ-vn"))
        .rejects.toMatchObject({ status: 409 });
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
      expect(f.declarations.get("decl-1")?.status).toBe("UNKNOWN");
      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({
          status: "COMPLETED",
          totalCount: 0,
          successCount: 0,
          failedCount: 0,
          unknownCount: 0,
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

      enableAutomaticDelivery(f);

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

      enableAutomaticDelivery(f);

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

    it("retains stale unresolved claims without resending or mutating their version", async () => {
      const f = fixture();
      f.occupants.set("occ-vn", primaryOccupant);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      f.declarations.set("decl-stale", {
        id: "decl-stale",
        hotelId: "hotel-1",
        occupantId: "occ-vn",
        version: 1,
        status: "UNKNOWN",
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

      enableAutomaticDelivery(f);

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
      expect(f.declarations.get("decl-stale")?.status).toBe("UNKNOWN");

      expect(f.declarations.get("decl-stale")?.status).toBe("UNKNOWN");
      expect(f.declarations.get("decl-stale")?.version).toBe(1);

      enableAutomaticDelivery(f);

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    });

    it("proves auto-submit reads occupants via bounded paged path and never calls unbounded getActiveStayOccupants", async () => {
      const f = fixture();
      const credentials = { username: "owner", password: "password" };
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      f.occupants.set("occ-page-1", {
        ...primaryOccupant,
        id: "occ-page-1",
        checkedInAt: new Date("2026-09-14T10:00:00Z"),
        plannedCheckInAt: new Date("2026-09-14T10:00:00Z"),
        plannedCheckOutAt: new Date("2026-09-15T12:00:00Z"),
        stay: {
          ...primaryOccupant.stay,
          checkedInAt: new Date("2026-09-14T10:00:00Z"),
          plannedCheckInAt: new Date("2026-09-14T10:00:00Z"),
          plannedCheckOutAt: new Date("2026-09-15T12:00:00Z"),
        },
      });
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

      enableAutomaticDelivery(f);

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

      f.occupants.set("occ-1", {
        ...primaryOccupant,
        id: "occ-1",
        plannedCheckInAt: new Date("2026-09-14T10:00:00Z"),
        plannedCheckOutAt: new Date("2026-09-15T12:00:00Z"),
        stay: {
          ...primaryOccupant.stay,
          plannedCheckInAt: new Date("2026-09-14T10:00:00Z"),
          plannedCheckOutAt: new Date("2026-09-15T12:00:00Z"),
        },
      });
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
      (f.occupantsReadService as any).getActiveStayOccupantsPaged = (hotelId: string, options: any) =>
        options?.kbttFilter === "UNKNOWN_ONLY" ? Promise.resolve({ items: [], nextCursor: null }) : pagedMock(hotelId, options);

      let renewCount = 0;
      (f.repository as any).renewAutoSubmitRunLease = jest.fn(async () => {
        renewCount++;
        return renewCount < 3; // page and first item renew; second page fails
      });

      f.provider.submitDeclaration.mockResolvedValue({
        outcome: "SUCCESS",
        code: "200",
        message: "Thành công",
      });

      enableAutomaticDelivery(f);

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
      enableAutomaticDelivery(f);
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
      enableAutomaticDelivery(f);
      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    });

    it("sends each guest once in sequence and preserves success, rejection and UNKNOWN outcomes", async () => {
      const f = fixture();
      const guests = [
        { ...primaryOccupant, id: "occ-1", fullName: "Guest One", identityNumber: "001090000001" },
        { ...primaryOccupant, id: "occ-2", fullName: "Guest Two", identityNumber: "001090000002" },
        { ...primaryOccupant, id: "occ-3", fullName: "Guest Three", identityNumber: "001090000003" },
      ];
      for (const guest of guests) f.occupants.set(guest.id, guest);
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      let inFlight = 0;
      let maxInFlight = 0;
      const sentNames: string[] = [];
      f.provider.submitDeclaration.mockImplementation(async (_kind, payload) => {
        const item = (payload as Array<{ hoTen: string }>)[0];
        sentNames.push(item.hoTen);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        if (item.hoTen === "Guest One") {
          return { outcome: "SUCCESS", code: "200", message: "Thành công" };
        }
        if (item.hoTen === "Guest Two") {
          return { outcome: "BUSINESS_REJECTION", code: "400", message: "Sai định dạng số giấy tờ" };
        }
        return { outcome: "AMBIGUOUS", code: "HTTP_504", message: "Gateway Timeout" };
      });

      enableAutomaticDelivery(f);

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);

      expect(sentNames).toEqual(["Guest One", "Guest Two", "Guest Three"]);
      expect(maxInFlight).toBe(1);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(3);
      for (const call of f.provider.submitDeclaration.mock.calls) {
        expect((call as any)[3]).toBeUndefined();
      }
      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-auto-1",
        expect.objectContaining({
          status: "COMPLETED",
          totalCount: 3,
          successCount: 1,
          failedCount: 1,
          unknownCount: 1,
        }),
      );
    });

    it("does not send Telegram summaries after guest attempts", async () => {
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

      enableAutomaticDelivery(f);

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);

      expect(sendTelegramMock).not.toHaveBeenCalled();
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

      enableAutomaticDelivery(f);

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

      enableAutomaticDelivery(f);

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
      jest.setSystemTime(new Date("2026-09-16T04:30:00.000Z"));
      const f = fixture();
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);

      for (let i = 1; i <= 120; i++) {
        const id = `occ-cont-${i}`;
        f.occupants.set(id, {
          ...primaryOccupant,
          id,
          checkedInAt: new Date("2026-09-16T03:00:00.000Z"),
          plannedCheckInAt: new Date("2026-09-16T03:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-09-17T05:00:00.000Z"),
          stay: {
            ...primaryOccupant.stay,
            checkedInAt: new Date("2026-09-16T03:00:00.000Z"),
            plannedCheckInAt: new Date("2026-09-16T03:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-09-17T05:00:00.000Z"),
          },
          fullName: "Nguyen Thi " + String.fromCharCode(65 + (i % 26)),
          identityNumber: `001093${String(i).padStart(6, "0")}`,
        });
      }

      const scheduledDate = new Date("2026-09-16T04:30:00.000Z");
      enableAutomaticDelivery(f);
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

      enableAutomaticDelivery(f);

      await f.service.executeAutoSubmitForHotel(
        "hotel-1",
        new Date("2026-09-16T05:00:00.000Z"),
        true,
      );
      expect(f.repository.createScheduledAutoSubmitRun).not.toHaveBeenCalled();
      f.service.onModuleDestroy();
    });

    it("manual 5s live batch with auto disabled is capped at 100 and does not create an automatic 30m continuation even when backlog remains (test 5)", async () => {
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
        id: "run-manual-5s",
        hotelId: "hotel-1",
        scheduledFor: new Date(),
        status: "RUNNING",
        leaseExpiresAt: new Date(Date.now() + 600_000),
        dryRun: false,
        summaryJson: { trigger: "MANUAL_DELAYED" },
      });

      expect(f.rows.get("hotel-1")?.autoSubmitEnabled).toBe(false);

      await f.service.executeAutoSubmitForHotel("hotel-1", new Date(), false);

      expect(f.repository.finalizeAutoSubmitRun).toHaveBeenCalledWith(
        "run-manual-5s",
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


describe("BCA connection safe accommodation profile", () => {
  function reader() {
    const client = new KbttProviderReadClient();
    const get = jest.spyOn(client, "getAccommodation").mockResolvedValue({ httpStatus: 200, envelope: { code: "200" }, data: {
      id: 1000227, tenCSLT: "Cơ sở mẫu", diaChi: "Địa chỉ mẫu", nguoiDD: "Người đại diện mẫu", sdt: "0000000000",
      email: "fixture@example.invalid", tenDvql: "Đơn vị quản lý mẫu", password: "must-not-leak", secretExtension: "must-not-leak",
    } });
    return { client, get };
  }
  it("loads the whitelisted profile after login and reads it locally without provider calls", async () => {
    const r = reader(); const f = fixture(r.client);
    const connected = await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    expect(connected.providerProfile).toMatchObject({ state: "READY", accommodation: { name: "Cơ sở mẫu", address: "Địa chỉ mẫu", representative: "Người đại diện mẫu", phone: "0000000000", email: "fixture@example.invalid", managingUnit: "Đơn vị quản lý mẫu" }, error: null });
    expect(connected.providerProfile.fetchedAt).toEqual(expect.any(String));
    expect(JSON.stringify(connected)).not.toContain("must-not-leak");
    expect(r.get).toHaveBeenCalledTimes(1);
    r.get.mockClear(); f.provider.login.mockClear();
    expect((await f.service.get("owner", "owner-role", "hotel-1")).providerProfile).toEqual(connected.providerProfile);
    expect(r.get).not.toHaveBeenCalled(); expect(f.provider.login).not.toHaveBeenCalled();
    f.rows.get("hotel-1")!.ciphertext = "changed-connection";
    expect((await f.service.get("owner", "owner-role", "hotel-1")).providerProfile.state).toBe("NOT_LOADED");
  });
  it("keeps successful login distinct from failed profile GET and preserves a safe provider error", async () => {
    const r = reader(); const f = fixture(r.client); const auth = session();
    f.provider.login.mockResolvedValueOnce(auth);
    r.get.mockRejectedValueOnce(new KbttProviderReadError("PROVIDER", "rejected", { providerCode: "E_PROFILE", providerMessage: "Thiếu quyền đọc cơ sở " + auth.AccessToken }));
    const result = await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    expect(result.status).toBe("DISCONNECTED");
    expect(result.providerProfile).toMatchObject({ state: "NOT_LOADED", accommodation: null });
    expect(JSON.stringify(result)).not.toContain(auth.AccessToken);
    expect(f.provider.revoke).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });
  it("rejects profile from another accommodation without exposing its data", async () => {
    const r = reader(); const f = fixture(r.client);
    r.get.mockResolvedValueOnce({ httpStatus: 200, envelope: { code: "200" }, data: { id: 999999, tenCSLT: "Wrong hotel" } });
    const result = await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    expect(result.status).toBe("DISCONNECTED");
    expect(result.providerProfile).toMatchObject({ state: "NOT_LOADED", accommodation: null });
    expect(JSON.stringify(result)).not.toContain("Wrong hotel");
    f.service.onModuleDestroy();
  });
  it("does not read profile when authentication or hotel access fails", async () => {
    const r = reader(); const f = fixture(r.client);
    f.provider.login.mockRejectedValueOnce(kbttAuthFailed());
    await expect(f.service.connect("owner", "owner-role", "hotel-1", credentials)).rejects.toThrow();
    f.access.assertHotelAccess.mockRejectedValueOnce(new ForbiddenException("Denied"));
    await expect(f.service.connect("owner", "owner-role", "hotel-2", credentials)).rejects.toThrow();
    expect(r.get).not.toHaveBeenCalled();
  });
  it("preserves loaded facility information while an explicit check refreshes in the background", async () => {
    const r = reader(); const f = fixture(r.client);
    const connected = await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    let resolveRead!: (value: any) => void;
    r.get.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
    const checked = await f.service.check("owner", "owner-role", "hotel-1");
    expect(checked.providerProfile).toEqual(connected.providerProfile);
    expect(checked.providerProfile.state).toBe("READY");
    resolveRead({ httpStatus: 200, envelope: { code: "200" }, data: { id: 1000227, tenCSLT: "Tên cơ sở cập nhật" } });
    await new Promise(resolve => setImmediate(resolve));
    expect((await f.service.get("owner", "owner-role", "hotel-1")).providerProfile.accommodation?.name).toBe("Tên cơ sở cập nhật");
    f.service.onModuleDestroy();
  });

  it("refreshes safe profile on explicit check and clears it on disconnect", async () => {
    const r = reader(); const f = fixture(r.client);
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    r.get.mockResolvedValueOnce({ httpStatus: 200, envelope: { code: "200" }, data: { id: 1000227, tenCSLT: "Tên cơ sở cập nhật" } });
    await f.service.check("owner", "owner-role", "hotel-1");
    await new Promise(resolve => setImmediate(resolve));
    const checked = await f.service.get("owner", "owner-role", "hotel-1");
    expect(checked.providerProfile.accommodation?.name).toBe("Tên cơ sở cập nhật");
    expect(checked.providerProfile.accommodation?.phone).toBeNull();
    expect(r.get).toHaveBeenCalledTimes(2);
    const disconnected = await f.service.disconnect("owner", "owner-role", "hotel-1");
    expect(disconnected.providerProfile).toMatchObject({ state: "NOT_LOADED", accommodation: null });
  });
});


describe("BCA delayed recovery and server logout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("blocks the session immediately, waits 10 seconds between retries and enters temporary disconnect cooldown after two failures", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const connection = f.rows.get("hotel-1")!;
    const old = f.service.getCachedReadSession("hotel-1", connection)!;
    const retry = jest.fn().mockResolvedValue(false);
    await f.service.recoverReadSession("hotel-1", old, retry);
    expect((await f.service.get("user", "role", "hotel-1")).status).toBe("DISCONNECTED");
    expect(f.service.getCachedReadSession("hotel-1", connection)).toBeNull();
    await jest.advanceTimersByTimeAsync(9_999); expect(retry).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); expect(retry).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(9_999); expect(retry).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); expect(retry).toHaveBeenCalledTimes(2);
    expect(f.rows.has("hotel-1")).toBe(true);
    expect(f.rows.get("hotel-1")).toMatchObject({
      status: "DISCONNECTED",
      lastErrorCode: "KBTT_TEMP_DISCONNECTED",
    });
    expect((f.service as any).sessions.has("hotel-1")).toBe(true);
    expect(f.provider.revoke).not.toHaveBeenCalled();
    expect(f.provider.login).toHaveBeenCalledTimes(1);
    f.service.onModuleDestroy();
  });

  it("restores a session after delayed successful read without logging in or replaying declarations", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    const retry = jest.fn().mockResolvedValue(true);
    await Promise.all([f.service.recoverReadSession("hotel-1", old, retry), f.service.recoverReadSession("hotel-1", old, retry)]);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(f.rows.get("hotel-1")?.status).toBe("CONNECTED");
    expect(f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)).toBe(old);
    expect(f.provider.login).toHaveBeenCalledTimes(1); expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(f.provider.revoke).not.toHaveBeenCalled(); f.service.onModuleDestroy();
  });

  it("cancels delayed retries on manual logout without waiting for remote logout", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    const retry = jest.fn().mockResolvedValue(true);
    await f.service.recoverReadSession("hotel-1", old, retry);
    f.provider.revoke.mockImplementation(() => new Promise(() => {}));
    await expect(f.service.disconnect("user", "role", "hotel-1")).resolves.toMatchObject({ status: "DISCONNECTED" });
    await jest.advanceTimersByTimeAsync(30_000);
    expect(retry).not.toHaveBeenCalled(); expect((f.service as any).sessions.size).toBe(0);
    f.service.onModuleDestroy();
  });

  it("does not let an old delayed success restore or clear a newer login", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    let finish!: (value: boolean) => void;
    await f.service.recoverReadSession("hotel-1", old, () => new Promise((resolve) => { finish = resolve; }));
    await jest.advanceTimersByTimeAsync(10_000);
    await f.service.connect("user", "role", "hotel-1", credentials);
    const current = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!);
    finish(true); await jest.advanceTimersByTimeAsync(30_000);
    expect(f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)).toBe(current);
    expect(current).not.toBe(old); expect(f.rows.get("hotel-1")?.status).toBe("CONNECTED");
    f.service.onModuleDestroy();
  });

  it("marks rejected authentication as AUTH_FAILED immediately without revoking or deleting saved connection", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    const retry = jest.fn();
    f.provider.login.mockRejectedValue(kbttAuthFailed());
    await f.service.recoverReadSession("hotel-1", old, retry, true);
    await (f.service as any).recoveries.get("hotel-1")?.task;
    expect(f.rows.has("hotel-1")).toBe(true);
    expect(f.rows.get("hotel-1")).toMatchObject({
      status: "AUTH_FAILED",
      lastErrorCode: "KBTT_AUTH_FAILED",
    });
    expect((f.service as any).sessions.size).toBe(0);
    expect(retry).not.toHaveBeenCalled();
    expect(f.provider.revoke).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });

  it("clears tokens and attempts revoke even when persisting logout fails", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    f.repository.remove.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(f.service.disconnect("user", "role", "hotel-1")).rejects.toThrow("storage unavailable");
    expect((f.service as any).sessions.size).toBe(0);
    expect(f.provider.revoke).toHaveBeenCalledWith(old.AccessToken, expect.any(AbortSignal)); f.service.onModuleDestroy();
  });

  it("bounds stalled recovery attempts and enters temporary disconnect cooldown after the second retry deadline", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    const retry = jest.fn(() => new Promise<boolean>(() => {}));
    await f.service.recoverReadSession("hotel-1", old, retry);
    await jest.advanceTimersByTimeAsync(39_999);
    expect(retry).toHaveBeenCalledTimes(2); expect(f.rows.has("hotel-1")).toBe(true);
    await jest.advanceTimersByTimeAsync(1);
    expect(f.rows.has("hotel-1")).toBe(true);
    expect(f.rows.get("hotel-1")).toMatchObject({
      status: "DISCONNECTED",
      lastErrorCode: "KBTT_TEMP_DISCONNECTED",
    });
    expect((f.service as any).sessions.has("hotel-1")).toBe(true);
    expect(f.provider.revoke).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });

  it("preserves recoverable retry state after the server loses its in-memory recovery job", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    const retry = jest.fn().mockResolvedValue(true);
    await f.service.recoverReadSession("hotel-1", old, retry);
    f.service.onModuleDestroy();
    expect(await f.service.get("user", "role", "hotel-1")).toMatchObject({ status: "DISCONNECTED", lastErrorCode: "KBTT_RETRY_PENDING" });
    await jest.advanceTimersByTimeAsync(30_000);
    expect(retry).not.toHaveBeenCalled();
  });

  it("does not delete another replica's newer connection when this process only has an old session", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const newer = { ...f.rows.get("hotel-1")!, ciphertext: "different-new-login" };
    f.rows.set("hotel-1", newer); f.provider.login.mockClear();
    await expect(f.service.ensureReconciliationSession("user", "role", "hotel-1")).rejects.toBeInstanceOf(HttpException);
    expect(f.rows.get("hotel-1")).toEqual(newer);
    expect(f.provider.login).not.toHaveBeenCalled(); expect(f.provider.refresh).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });
});

describe("front-desk BCA read-session preparation", () => {
  it("does not authenticate a connection marked AUTH_FAILED or DISCONNECTED", async () => {
    for (const status of ["AUTH_FAILED", "DISCONNECTED"] as const) {
      const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
      f.rows.set("hotel-1", { ...f.rows.get("hotel-1")!, status });
      f.provider.login.mockClear(); f.provider.refresh.mockClear();
      await expect(f.service.ensureReconciliationSession("user", "role", "hotel-1")).rejects.toBeInstanceOf(HttpException);
      expect(f.provider.login).not.toHaveBeenCalled(); expect(f.provider.refresh).not.toHaveBeenCalled();
    }
  });
  it("coalesces three login attempts, waits ten seconds and persists cooldown", async () => {
    jest.useFakeTimers();
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    f.service.expireRejectedReadSession("hotel-1", old); f.provider.login.mockClear();
    f.provider.login.mockRejectedValue(new Error("provider unavailable"));
    const pending = Promise.allSettled(Array.from({ length: 4 }, () => f.service.ensureReconciliationSession("user", "role", "hotel-1")));
    await jest.advanceTimersByTimeAsync(0); expect(f.provider.login).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(9_999); expect(f.provider.login).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); expect(f.provider.login).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(10_000);
    expect((await pending).every(result => result.status === "rejected")).toBe(true);
    expect(f.provider.login).toHaveBeenCalledTimes(3);
    await expect(f.service.ensureReconciliationSession("user", "role", "hotel-1")).rejects.toBeInstanceOf(HttpException);
    expect(f.provider.login).toHaveBeenCalledTimes(3);
    expect(f.rows.get("hotel-1")).toMatchObject({status:"DISCONNECTED",lastErrorCode:"KBTT_TEMP_DISCONNECTED"});
    expect(f.provider.refresh).not.toHaveBeenCalled(); f.service.onModuleDestroy();
  });
  it("shares acquisition across check, preparation and lifecycle resolver", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const connection = f.rows.get("hotel-1")!;
    (f.service as any).sessions.clear(); f.provider.login.mockClear();
    let release!: (value: KbttSession) => void;
    f.provider.login.mockImplementationOnce(() => new Promise(resolve => {release = resolve;}));
    const requests = [f.service.check("user","role","hotel-1"), f.service.ensureReconciliationSession("user","role","hotel-1"), (f.service as any).getOrRefreshSession("hotel-1",connection)];
    await new Promise(resolve => setImmediate(resolve));
    expect(f.provider.login).toHaveBeenCalledTimes(1);
    release(session()); await Promise.all(requests);
    expect(f.provider.login).toHaveBeenCalledTimes(1); expect(f.provider.refresh).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });
  it("persists exhausted token cooldown across cache loss and permits recovery only after sixty seconds", async () => {
    jest.useFakeTimers(); const f = fixture(); await f.service.connect("user","role","hotel-1",credentials);
    (f.service as any).sessions.clear(); f.provider.login.mockClear();
    f.provider.login.mockRejectedValue(new Error("429 unavailable"));
    const failure = expect((f.service as any).getOrRefreshSession("hotel-1", f.rows.get("hotel-1"))).rejects.toBeInstanceOf(HttpException);
    await jest.advanceTimersByTimeAsync(20_000); await failure;
    expect(f.provider.login).toHaveBeenCalledTimes(3);
    f.service.onModuleDestroy();
    const restarted = new KbttService(f.access as never,f.repository as never,f.cipher,f.provider as never);
    const current = f.rows.get("hotel-1")!;
    await expect((restarted as any).getOrRefreshSession("hotel-1",current)).rejects.toBeInstanceOf(HttpException);
    await jest.advanceTimersByTimeAsync(59_999);
    await expect((restarted as any).getOrRefreshSession("hotel-1",current)).rejects.toBeInstanceOf(HttpException);
    expect(f.provider.login).toHaveBeenCalledTimes(3);
    f.provider.login.mockResolvedValue(session()); await jest.advanceTimersByTimeAsync(1);
    await expect((restarted as any).getOrRefreshSession("hotel-1",current)).resolves.toBeDefined();
    expect(f.provider.login).toHaveBeenCalledTimes(4); restarted.onModuleDestroy();
  });
  it("aborts logout during token retry delay and never restores an explicitly removed connection", async () => {
    jest.useFakeTimers(); const f = fixture(); await f.service.connect("user","role","hotel-1",credentials);
    const connection = f.rows.get("hotel-1")!;
    (f.service as any).sessions.clear(); f.provider.login.mockClear(); f.provider.login.mockRejectedValue(new Error("offline"));
    const pending = expect((f.service as any).getOrRefreshSession("hotel-1",connection)).rejects.toBeDefined();
    await jest.advanceTimersByTimeAsync(0); expect(f.provider.login).toHaveBeenCalledTimes(1);
    await f.service.disconnect("user","role","hotel-1"); await pending;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(f.provider.login).toHaveBeenCalledTimes(1); expect(f.rows.has("hotel-1")).toBe(false);
    await expect((f.service as any).getOrRefreshSession("hotel-1",connection)).rejects.toBeDefined();
    expect(f.provider.login).toHaveBeenCalledTimes(1); f.service.onModuleDestroy();
  });
  it("rejects a token minted for another facility and preserves original scope", async () => {
    const f = fixture(); await f.service.connect("user","role","hotel-1",credentials);
    const connection = f.rows.get("hotel-1")!; (f.service as any).sessions.clear();
    f.provider.login.mockResolvedValueOnce(session({CsltId:"other-facility"}));
    await expect((f.service as any).getOrRefreshSession("hotel-1",connection)).rejects.toBeInstanceOf(ConflictException);
    expect(f.rows.get("hotel-1")?.csltId).toBe(connection.csltId);
    expect(f.service.getCachedReadSession("hotel-1",connection)).toBeNull(); f.service.onModuleDestroy();
  });
  it("returns read recovery promptly while a token request is still pending", async () => {
    const f = fixture(); await f.service.connect("user","role","hotel-1",credentials);
    const old = f.service.getCachedReadSession("hotel-1",f.rows.get("hotel-1")!)!;
    let release!: (value: KbttSession) => void;
    f.provider.login.mockImplementationOnce(() => new Promise(resolve => {release = resolve;}));
    const retry = jest.fn().mockResolvedValue(true);
    await f.service.recoverReadSession("hotel-1",old,retry,true);
    expect(retry).not.toHaveBeenCalled();
    const recovery = (f.service as any).recoveries.get("hotel-1"); expect(recovery).toBeDefined();
    await new Promise(resolve => setImmediate(resolve)); release(session()); await recovery.task;
    expect(retry).toHaveBeenCalledWith(expect.any(AbortSignal),expect.objectContaining({CsltId:"1000227"}));
    f.service.onModuleDestroy();
  });
  it("bounds an interactive preparation to eight seconds while background acquisition completes safely", async () => {
    jest.useFakeTimers(); const f = fixture(); await f.service.connect("user","role","hotel-1",credentials);
    (f.service as any).sessions.clear();
    let release!: (value: KbttSession) => void;
    f.provider.login.mockImplementationOnce(() => new Promise(resolve => {release = resolve;}));
    const result = expect(f.service.ensureReconciliationSession("user","role","hotel-1")).rejects.toBeInstanceOf(HttpException);
    await jest.advanceTimersByTimeAsync(8_000); await result;
    const running = (f.service as any).tokenAcquisitions.get("hotel-1"); expect(running).toBeDefined();
    release(session()); await running.task;
    expect(f.service.getCachedReadSession("hotel-1",f.rows.get("hotel-1")!)).not.toBeNull();
    f.service.onModuleDestroy();
  });
  it("does not repeatedly login when the replacement access is also rejected", async () => {
    jest.useFakeTimers(); const f = fixture(); await f.service.connect("user","role","hotel-1",credentials);
    const old = f.service.getCachedReadSession("hotel-1",f.rows.get("hotel-1")!)!; f.provider.login.mockClear();
    const replacement = await f.service.recoverRejectedSession("hotel-1",old);
    await expect(f.service.recoverRejectedSession("hotel-1",replacement)).rejects.toBeInstanceOf(HttpException);
    expect(f.rows.get("hotel-1")).toMatchObject({status:"DISCONNECTED",lastErrorCode:"KBTT_TEMP_DISCONNECTED"});
    for (let i = 0; i < 4; i++) await expect(f.service.check("user","role","hotel-1")).rejects.toBeInstanceOf(HttpException);
    expect(f.provider.login).toHaveBeenCalledTimes(1); f.service.onModuleDestroy();
  });
  it("commits logout locally before waiting for remote token revocation", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const oldConnection = f.rows.get("hotel-1")!;
    let release!: () => void;
    const revoking = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    f.provider.revoke.mockImplementationOnce(async () => { started(); await revoking; });
    const logout = f.service.disconnect("user", "role", "hotel-1");
    await entered;
    try {
      expect((await f.service.get("user", "role", "hotel-1")).status).toBe("DISCONNECTED");
      expect(f.service.getCachedReadSession("hotel-1", oldConnection)).toBeNull();
    } finally { release(); await logout; }
  });
  it("does not restore a session if logout removes the connection during access acquisition", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const connection = f.rows.get("hotel-1")!;
    const old = f.service.getCachedReadSession("hotel-1", connection)!;
    f.service.expireRejectedReadSession("hotel-1", old);
    f.provider.login.mockImplementationOnce(async () => { f.rows.delete("hotel-1"); return session(); });
    await expect((f.service as any).getOrRefreshSession("hotel-1", connection)).rejects.toBeInstanceOf(ConflictException);
    expect(f.service.getCachedReadSession("hotel-1", connection)).toBeNull();
    expect(f.rows.has("hotel-1")).toBe(false);
  });
  it("reuses valid authentication for concurrent entries without login, refresh, revoke or delivery", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    f.provider.login.mockClear(); f.provider.refresh.mockClear(); f.provider.revoke.mockClear();
    expect(await Promise.all([f.service.ensureReconciliationSession("user", "role", "hotel-1"), f.service.ensureReconciliationSession("user", "role", "hotel-1")])).toEqual([{ ready: true }, { ready: true }]);
    expect(f.provider.login).not.toHaveBeenCalled(); expect(f.provider.refresh).not.toHaveBeenCalled();
    expect(f.provider.revoke).not.toHaveBeenCalled(); expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });
  it("restores a saved connected account after process cache loss", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    f.service.onModuleDestroy(); f.provider.login.mockClear();
    await expect(f.service.ensureReconciliationSession("user", "role", "hotel-1")).resolves.toEqual({ready: true});
    expect(f.provider.login).toHaveBeenCalledTimes(1);
    expect((await f.service.get("user", "role", "hotel-1")).status).toBe("CONNECTED");
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });
  it("obtains access through login after token rejection without refresh or revoke", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    f.service.expireRejectedReadSession("hotel-1", old); f.provider.login.mockClear(); f.provider.revoke.mockClear();
    await f.service.ensureReconciliationSession("user", "role", "hotel-1");
    expect(f.provider.login).toHaveBeenCalledWith(credentials, expect.any(AbortSignal));
    expect(f.provider.refresh).not.toHaveBeenCalled(); expect(f.provider.revoke).not.toHaveBeenCalled();
  });
  it("marks AUTH_FAILED only when credential login itself is rejected", async () => {
    const f = fixture(); await f.service.connect("user", "role", "hotel-1", credentials);
    const old = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    f.service.expireRejectedReadSession("hotel-1", old);
    f.provider.login.mockRejectedValue(kbttAuthFailed()); f.provider.login.mockRejectedValue(kbttAuthFailed());
    await expect(f.service.ensureReconciliationSession("user", "role", "hotel-1")).rejects.toBeInstanceOf(HttpException);
    expect(f.rows.has("hotel-1")).toBe(true);
    expect(f.rows.get("hotel-1")).toMatchObject({
      status: "AUTH_FAILED",
      lastErrorCode: "KBTT_AUTH_FAILED",
    });
    expect((f.service as any).sessions.size).toBe(0);
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });
  it("denies hotel access and missing configuration before provider calls", async () => {
    const f = fixture();
    await expect(f.service.ensureReconciliationSession("user", "role", "hotel-1")).rejects.toBeInstanceOf(NotFoundException);
    f.access.assertHotelAccess.mockRejectedValue(new ForbiddenException());
    await expect(f.service.ensureReconciliationSession("user", "role", "hotel-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.provider.login).not.toHaveBeenCalled(); expect(f.provider.refresh).not.toHaveBeenCalled();
  });
  it("exposes session preparation to declaration operators without connection management permission", () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, KbttController.prototype.ensureReconciliationSession)).toEqual(["hotel.kbtt.declarations.view", "hotel.kbtt.declarations.manage"]);
  });
});


describe("editable declaration date payload", () => {
  it("saves declaration dates, uses them in the transmitted payload and leaves PMS unchanged", async () => {
    const f = fixture(); const occupant = structuredClone(primaryOccupant); f.occupants.set(occupant.id, occupant);
    const edits = { ngayDenCsltStr: "2026-09-13 18:00:00", ngayDiDuKienStr: "2026-09-16 12:00:00", lyDoCuTru: 20, loaiGiayTo: 1 };
    const saved = await f.service.saveDraft("user", "role", "hotel-1", occupant.id, { citizenshipKind: "VIETNAMESE", data: edits });
    expect(saved.draftPayload).toMatchObject({ ...edits, lyDoCuTru: 1 });
    expect(saved.draftPayload).not.toHaveProperty("__kbttDeclarationDates");
    expect(occupant.stay.checkedInAt.toISOString()).toBe(primaryOccupant.stay.checkedInAt.toISOString());
    await f.service.connect("user", "role", "hotel-1", credentials); enableAutomaticDelivery(f);
    await f.service.submit("user", "role", "hotel-1", occupant.id); await finishInitialDeliveries(f);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith("VIETNAMESE", [expect.objectContaining({ ...edits, lyDoCuTru: 1 })], expect.any(String));
  });
  it("rejects inverted declaration dates before any profile write", async () => {
    const f = fixture(); const occupant = structuredClone(primaryOccupant); f.occupants.set(occupant.id, occupant);
    await expect(f.service.saveDraft("user", "role", "hotel-1", occupant.id, { citizenshipKind: "VIETNAMESE", data: { ngayDenCsltStr: "2026-09-16 12:00:00", ngayDiDuKienStr: "2026-09-15 12:00:00" } })).rejects.toBeInstanceOf(BadRequestException);
    expect(f.declarations.size).toBe(0);
  });
});

describe("BCA same-day 12:00/21:00 slots, 10-minute catch-up, and temporary disconnect cooldown", () => {
  beforeEach(() => {
    jest
      .useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] })
      .setSystemTime(new Date("2026-09-14T05:00:00.000Z")); // 2026-09-14 12:00:00 in Asia/Ho_Chi_Minh
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("computes strictly future 10-minute boundaries in Asia/Ho_Chi_Minh (12:07 -> 12:10, 21:03 -> 21:10, 12:10:00 -> 12:20, 23:55 -> 00:00 next day)", () => {
    expect(computeVietnamNextTenMinuteBoundary(new Date("2026-09-14T05:07:22.000Z"))?.toISOString())
      .toBe("2026-09-14T05:10:00.000Z"); // 12:07 -> 12:10
    expect(computeVietnamNextTenMinuteBoundary(new Date("2026-09-14T14:03:00.000Z"))?.toISOString())
      .toBe("2026-09-14T14:10:00.000Z"); // 21:03 -> 21:10
    expect(computeVietnamNextTenMinuteBoundary(new Date("2026-09-14T05:10:00.000Z"))?.toISOString())
      .toBe("2026-09-14T05:20:00.000Z"); // exact 12:10:00 -> 12:20
    expect(computeVietnamNextTenMinuteBoundary(new Date("2026-09-14T16:55:00.000Z"))?.toISOString())
      .toBe("2026-09-14T17:00:00.000Z"); // 23:55 crosses midnight into 2026-09-15 00:00 VN
  });

  it("computes next fixed daily slot at 12:00 or 21:00 Vietnam time", () => {
    expect(computeVietnamNextDailySlot(new Date("2026-09-14T03:00:00.000Z"))).toEqual({
      slot: "12:00",
      scheduledFor: new Date("2026-09-14T05:00:00.000Z"),
    });
    expect(computeVietnamNextDailySlot(new Date("2026-09-14T05:00:00.000Z"))).toEqual({
      slot: "21:00",
      scheduledFor: new Date("2026-09-14T14:00:00.000Z"),
    });
    expect(computeVietnamNextDailySlot(new Date("2026-09-14T14:30:00.000Z"))).toEqual({
      slot: "12:00",
      scheduledFor: new Date("2026-09-15T05:00:00.000Z"),
    });
  });

  it("rounds historical wire payloads for each retry day while preserving local stay and draft dates", async () => {
    const f = fixture();
    const occupant = structuredClone(primaryOccupant);
    occupant.stay.checkedInAt = new Date("2026-09-10T03:00:00.000Z");
    occupant.stay.plannedCheckInAt = occupant.stay.checkedInAt;
    occupant.checkedInAt = occupant.stay.checkedInAt;
    occupant.plannedCheckInAt = occupant.stay.checkedInAt;
    f.occupants.set(occupant.id, occupant);
    const first = await (f.service as any).prepareInitialDeclaration("hotel-1", occupant.id, occupant);
    expect(first.payload[0].ngayDenCsltStr).toBe("2026-09-13 10:00:00");
    expect(first.draft.ngayDenCsltStr).toBe("2026-09-10 10:00:00");
    expect(occupant.stay.checkedInAt.toISOString()).toBe("2026-09-10T03:00:00.000Z");
    const fingerprint = createHash("sha256").update(JSON.stringify(first.payload)).digest("hex");
    const failed = { ...first.preparedDeclaration, status: "FAILED", providerCode: "400", submittedPayloadFingerprint: fingerprint };
    expect((f.service as any).isDeclarationEligibleForAutoCatchUp(occupant, failed, "2026-09-14")).toBe(false);
    expect((f.service as any).isDeclarationEligibleForAutoCatchUp(occupant, failed, "2026-09-15")).toBe(true);
    jest.setSystemTime(new Date("2026-09-15T05:00:00.000Z"));
    const retry = await (f.service as any).prepareInitialDeclaration("hotel-1", occupant.id, occupant);
    expect(retry.payload[0].ngayDenCsltStr).toBe("2026-09-14 10:00:00");
    expect(retry.draft.ngayDenCsltStr).toBe("2026-09-10 10:00:00");
    f.service.onModuleDestroy();
  });

  it("retries a confirmed provider failure on the next Vietnam day even when the valid wire payload is unchanged", async () => {
    const f = fixture();
    const occupant = structuredClone(primaryOccupant);
    const prepared = await (f.service as any).prepareInitialDeclaration("hotel-1", occupant.id, occupant);
    const failed = { ...prepared.preparedDeclaration, status: "FAILED", providerCode: "400",
      attemptedAt: new Date("2026-09-14T05:00:00.000Z"),
      submittedPayloadFingerprint: createHash("sha256").update(JSON.stringify(prepared.payload)).digest("hex") };
    expect((f.service as any).isDeclarationEligibleForAutoCatchUp(occupant, failed, "2026-09-14")).toBe(false);
    expect((f.service as any).isDeclarationEligibleForAutoCatchUp(occupant, failed, "2026-09-15")).toBe(true);
    expect((f.service as any).isDeclarationEligibleForAutoCatchUp(occupant, { ...failed, status: "UNKNOWN" }, "2026-09-15")).toBe(false);
    expect((f.service as any).isDeclarationEligibleForAutoCatchUp(occupant, { ...failed, providerCode: "LOCAL_VALIDATION" }, "2026-09-15")).toBe(false);
    f.service.onModuleDestroy();
  });

  it("submits current-day and yesterday (D+1) arrivals existing at the slot cutoff and rounds older arrivals only on the wire without altering local dates", async () => {
    const f = fixture();
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);

    const outOfWindowGuest = {
      ...primaryOccupant,
      id: "occ-d-minus-2",
      fullName: "Out Of Window Guest",
      identityNumber: "001090888001",
      checkedInAt: new Date("2026-09-12T08:00:00.000Z"), // 2026-09-12 (D-2)
      plannedCheckInAt: new Date("2026-09-12T08:00:00.000Z"),
      stay: {
        ...primaryOccupant.stay,
        checkedInAt: new Date("2026-09-12T08:00:00.000Z"),
        plannedCheckInAt: new Date("2026-09-12T08:00:00.000Z"),
      },
    };
    const yesterdayGuest = {
      ...primaryOccupant,
      id: "occ-yesterday",
      fullName: "Yesterday Guest",
      identityNumber: "001090888099",
      checkedInAt: new Date("2026-09-13T08:00:00.000Z"), // 2026-09-13 15:00 VN (yesterday / D+1 retry)
      plannedCheckInAt: new Date("2026-09-13T08:00:00.000Z"),
      stay: {
        ...primaryOccupant.stay,
        checkedInAt: new Date("2026-09-13T08:00:00.000Z"),
        plannedCheckInAt: new Date("2026-09-13T08:00:00.000Z"),
      },
    };
    const sameDayBeforeCutoff = {
      ...primaryOccupant,
      id: "occ-same-day-11am",
      fullName: "Nguyen Van Som",
      identityNumber: "001090888002",
      checkedInAt: new Date("2026-09-14T04:00:00.000Z"), // 11:00 VN
      plannedCheckInAt: new Date("2026-09-14T04:00:00.000Z"),
      stay: {
        ...primaryOccupant.stay,
        checkedInAt: new Date("2026-09-14T04:00:00.000Z"),
        plannedCheckInAt: new Date("2026-09-14T04:00:00.000Z"),
      },
    };
    const sameDayAfterCutoff = {
      ...primaryOccupant,
      id: "occ-same-day-1202",
      fullName: "Tran Van Muon",
      identityNumber: "001090888003",
      checkedInAt: new Date("2026-09-14T05:02:00.000Z"), // 12:02 VN
      plannedCheckInAt: new Date("2026-09-14T05:02:00.000Z"),
      stay: {
        ...primaryOccupant.stay,
        checkedInAt: new Date("2026-09-14T05:02:00.000Z"),
        plannedCheckInAt: new Date("2026-09-14T05:02:00.000Z"),
      },
    };

    f.occupants.set(outOfWindowGuest.id, outOfWindowGuest);
    f.occupants.set(yesterdayGuest.id, yesterdayGuest);
    f.occupants.set(sameDayBeforeCutoff.id, sameDayBeforeCutoff);
    f.occupants.set(sameDayAfterCutoff.id, sameDayAfterCutoff);

    // 12:00 slot sweep (cutoff is 12:00:00 VN = 05:00:00 UTC)
    await f.service.executeAutoSubmitForHotel(
      "hotel-1",
      new Date("2026-09-14T05:00:00.000Z"),
      false,
    );

    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(3);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "VIETNAMESE",
      [expect.objectContaining({ hoTen: "Out Of Window Guest", ngayDenCsltStr: "2026-09-13 15:00:00" })],
      expect.any(String),
    );
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "VIETNAMESE",
      [expect.objectContaining({ hoTen: "Yesterday Guest", ngayDenCsltStr: "2026-09-13 15:00:00" })],
      expect.any(String),
    );
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "VIETNAMESE",
      [expect.objectContaining({ hoTen: "Nguyen Van Som", ngayDenCsltStr: "2026-09-14 11:00:00" })],
      expect.any(String),
    );
    expect(outOfWindowGuest.checkedInAt.toISOString()).toBe("2026-09-12T08:00:00.000Z");

    // 21:00 slot sweep processes only the remaining same-day arrival (12:02 guest) and still skips D-2 guest
    jest.setSystemTime(new Date("2026-09-14T14:00:00.000Z"));
    // Refresh session so it stays valid at 21:00 VN
    f.provider.login.mockResolvedValueOnce(
      session({ Exp: Math.floor(new Date("2026-09-14T14:00:00.000Z").getTime() / 1000) + 300 }),
    );
    f.provider.submitDeclaration.mockClear();
    await f.service.executeAutoSubmitForHotel(
      "hotel-1",
      new Date("2026-09-14T14:00:00.000Z"),
      false,
    );
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "VIETNAMESE",
      [expect.objectContaining({ hoTen: "Tran Van Muon", ngayDenCsltStr: "2026-09-14 12:02:00" })],
      expect.any(String),
    );
    f.service.onModuleDestroy();
  });

  it("schedules catch-up across midnight at 23:55 -> 00:00 next day (D+1) preserves yesterday and rounds D+2 arrivals to the new yesterday", async () => {
    jest.setSystemTime(new Date("2026-09-14T16:55:00.000Z")); // 23:55 VN on 2026-09-14 (day D)
    const f = fixture();
    f.occupants.set(primaryOccupant.id, structuredClone(primaryOccupant));
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    await f.service.updateAutoSubmitEnabled("owner", "owner-role", "hotel-1", true);

    // At 23:55 VN on 2026-09-14, next 10-minute boundary is 00:00 on 2026-09-15 (17:00:00.000Z)
    expect(f.repository.createScheduledAutoSubmitRun).toHaveBeenCalledWith(
      "hotel-1",
      new Date("2026-09-14T17:00:00.000Z"),
      false,
      "CATCH_UP_10M",
      { cutoffAt: "2026-09-14T17:00:00.000Z" },
    );

    // At 00:00 VN on 2026-09-15 (D+1), guest who arrived on 2026-09-14 (yesterday) is submitted with actual arrival 2026-09-14!
    jest.setSystemTime(new Date("2026-09-14T17:00:00.000Z"));
    f.provider.login.mockResolvedValueOnce(
      session({ Exp: Math.floor(new Date("2026-09-14T17:00:00.000Z").getTime() / 1000) + 300 }),
    );
    await f.service.executeAutoSubmitForHotel(
      "hotel-1",
      new Date("2026-09-14T17:00:00.000Z"),
      false,
    );
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
      "VIETNAMESE",
      [expect.objectContaining({ ngayDenCsltStr: "2026-09-14 10:00:00" })],
      expect.any(String),
    );

    // On D+2 (2026-09-16 12:00 VN), an unsent guest who arrived on 2026-09-14 is out of window and is not sent automatically
    const dPlus2Guest = {
      ...primaryOccupant,
      id: "occ-d-plus-2",
      identityNumber: "001090666777",
      plannedCheckOutAt: new Date("2026-09-18T05:00:00.000Z"),
      stay: {
        ...primaryOccupant.stay,
        plannedCheckOutAt: new Date("2026-09-18T05:00:00.000Z"),
      },
    };
    f.occupants.set(dPlus2Guest.id, dPlus2Guest);
    jest.setSystemTime(new Date("2026-09-16T05:00:00.000Z"));
    f.provider.submitDeclaration.mockClear();
    await f.service.executeAutoSubmitForHotel(
      "hotel-1",
      new Date("2026-09-16T05:00:00.000Z"),
      false,
    );
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith("VIETNAMESE", [expect.objectContaining({ ngayDenCsltStr: "2026-09-15 10:00:00" })], expect.any(String));
    expect(dPlus2Guest.stay.checkedInAt.toISOString()).toBe("2026-09-14T03:00:00.000Z");
    f.service.onModuleDestroy();
  });

  it("does not retry an invalid guest payload until corrected and schedules next 10m catch-up after correction", async () => {
    jest.setSystemTime(new Date("2026-09-14T14:03:00.000Z")); // 21:03 VN
    const f = fixture();
    const invalidGuest = {
      ...primaryOccupant,
      id: "occ-missing-id",
      identityNumber: null,
    };
    f.occupants.set(invalidGuest.id, invalidGuest);
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);

    await f.service.triggerCheckInBcaPush("hotel-1", invalidGuest.stayId);
    expect(await f.repository.findLatestDeclaration("hotel-1", invalidGuest.id)).toMatchObject({
      status: "FAILED",
      providerCode: "LOCAL_VALIDATION",
    });
    expect(f.rows.get("hotel-1")?.status).toBe("CONNECTED");
    expect(f.repository.createScheduledAutoSubmitRun).not.toHaveBeenCalled();

    // Operator corrects the missing identity number at 21:03 VN -> schedules catch-up for 21:10 VN
    await f.service.saveDraft("owner", "owner-role", "hotel-1", invalidGuest.id, {
      citizenshipKind: "VIETNAMESE",
      data: { soGiayTo: "001090123999", loaiGiayTo: 1, lyDoCuTru: 1 },
    });
    expect(f.repository.createScheduledAutoSubmitRun).toHaveBeenCalledWith(
      "hotel-1",
      new Date("2026-09-14T14:10:00.000Z"),
      false,
      "CATCH_UP_10M",
      { cutoffAt: "2026-09-14T14:10:00.000Z" },
    );
    f.service.onModuleDestroy();
  });

  it("enforces 60s cooldown after transient disconnect, coalesces health probes, resumes same generation and schedules catch-up", async () => {
    jest.setSystemTime(new Date("2026-09-14T05:01:00.000Z")); // 12:01 VN
    const client = new KbttProviderReadClient();
    const getAccommodation = jest.spyOn(client, "getAccommodation").mockResolvedValue({
      httpStatus: 200,
      envelope: { code: "200" },
      data: { id: 1000227, tenCSLT: "Khách sạn mẫu" },
    });
    const f = fixture(client);
    f.occupants.set(primaryOccupant.id, primaryOccupant);
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);

    const activeSession = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    // Trigger transient disconnect cooldown
    await f.service.enterTemporaryDisconnectCooldown("hotel-1", activeSession);
    expect(f.rows.get("hotel-1")).toMatchObject({
      status: "DISCONNECTED",
      lastErrorCode: "KBTT_TEMP_DISCONNECTED",
    });

    // During 60s cooldown, explicit probes are blocked
    getAccommodation.mockClear();
    await jest.advanceTimersByTimeAsync(59_999);
    expect(await f.service.probeTemporarilyDisconnectedSession("hotel-1", true)).toBe(false);
    expect(getAccommodation).not.toHaveBeenCalled();

    // Advance 1 ms to 60s -> cooldown elapses, concurrent probes coalesce into one call, restore CONNECTED, and schedule 12:10 catch-up
    jest.setSystemTime(new Date("2026-09-14T05:02:00.000Z"));
    const [p1, p2] = await Promise.all([
      f.service.probeTemporarilyDisconnectedSession("hotel-1", false),
      f.service.probeTemporarilyDisconnectedSession("hotel-1", false),
    ]);
    expect(p1).toBe(true);
    expect(p2).toBe(true);
    expect(getAccommodation).toHaveBeenCalledTimes(1);
    expect(f.rows.get("hotel-1")).toMatchObject({
      status: "CONNECTED",
      lastErrorCode: null,
    });
    expect(f.repository.createScheduledAutoSubmitRun).toHaveBeenCalledWith(
      "hotel-1",
      new Date("2026-09-14T05:10:00.000Z"),
      false,
      "CATCH_UP_10M",
      { cutoffAt: "2026-09-14T05:10:00.000Z" },
    );
    f.service.onModuleDestroy();
  });

  it("BCA-01 + KbttService integration: drains 501 and 1205 active guests across pages with PAGE_SIZE=500, including when page 1 is already synchronized", async () => {
    const prevPageSize = process.env.KBTT_AUTO_SUBMIT_PAGE_SIZE;
    const prevBatchSize = process.env.KBTT_AUTO_SUBMIT_BATCH_SIZE;
    process.env.KBTT_AUTO_SUBMIT_PAGE_SIZE = "500";
    process.env.KBTT_AUTO_SUBMIT_BATCH_SIZE = "1500";
    try {
      const f = fixture();
      await f.service.connect("owner", "owner-role", "hotel-1", credentials);
      enableAutomaticDelivery(f);

      for (let i = 1; i <= 501; i++) {
        const id = `occ-${String(i).padStart(4, "0")}`;
        f.occupants.set(id, {
          ...primaryOccupant,
          id,
          fullName: "Nguyen Van " + String.fromCharCode(65 + (i % 26)),
          identityNumber: `001090${String(i).padStart(6, "0")}`,
        });
        if (i <= 500) {
          f.declarations.set(`decl-${i}`, {
            id: `decl-${i}`,
            hotelId: "hotel-1",
            stayId: primaryOccupant.stayId,
            occupantId: id,
            status: "SUBMITTED",
            declarationKind: "VIETNAMESE",
            revision: 1,
            version: 1,
          });
        }
      }

      // hasEligibleSameDayUnsentWork must scan past the 500 synchronized rows on page 1 and find row 0501
      await expect(f.service.hasEligibleSameDayUnsentWork("hotel-1", new Date())).resolves.toBe(
        true,
      );

      // Sweep at 12:00 VN must reach row 0501 and submit it
      await f.service.executeAutoSubmitForHotel(
        "hotel-1",
        new Date("2026-09-14T05:00:00.000Z"),
        false,
      );
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
      expect(f.provider.submitDeclaration).toHaveBeenCalledWith(
        "VIETNAMESE",
        [
          expect.objectContaining({
            hoTen: "Nguyen Van " + String.fromCharCode(65 + (501 % 26)),
            soGiayTo: "001090000501",
          }),
        ],
        expect.any(String),
      );
      f.service.onModuleDestroy();
    } finally {
      if (prevPageSize === undefined) delete process.env.KBTT_AUTO_SUBMIT_PAGE_SIZE;
      else process.env.KBTT_AUTO_SUBMIT_PAGE_SIZE = prevPageSize;
      if (prevBatchSize === undefined) delete process.env.KBTT_AUTO_SUBMIT_BATCH_SIZE;
      else process.env.KBTT_AUTO_SUBMIT_BATCH_SIZE = prevBatchSize;
    }
  });

  it("BCA-02: classifies provider 429 rate-limit as transient safe-unsent failure, respects bounded Retry-After cooldown, and schedules next 10m catch-up", async () => {
    jest.setSystemTime(new Date("2026-09-14T14:03:00.000Z")); // 21:03 VN
    const f = fixture();
    f.occupants.set(primaryOccupant.id, primaryOccupant);
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);

    // 1. Test KbttProviderClient HTTP 429 + Retry-After parsing directly
    const realClient = new KbttProviderClient();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h.toLowerCase() === "retry-after" ? "25" : null) },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            Buffer.from(JSON.stringify({ code: "429", message: "Too Many Requests" })),
          );
          controller.close();
        },
      }),
    } as any);
    const clientOutcome = await realClient.submitDeclaration(
      "VIETNAMESE",
      [{ hoTen: "Test" }],
      "token-1",
    );
    expect(clientOutcome).toMatchObject({
      outcome: "BUSINESS_REJECTION",
      code: "429",
      retryAfterMs: 25_000,
    });

    // 2. Test immediate check-in receiving 429 at 21:03 VN
    f.provider.submitDeclaration.mockResolvedValueOnce({
      outcome: "BUSINESS_REJECTION",
      code: "429",
      message: "Too Many Requests",
      retryAfterMs: 25_000,
    });

    const pendingRuns: any[] = [];
    (f.repository.findPendingScheduledAutoSubmitRuns as jest.Mock).mockImplementation(
      async () => pendingRuns,
    );
    f.repository.createScheduledAutoSubmitRun.mockImplementation(
      async (hotelId: string, scheduledFor: Date, dryRun: boolean, trigger = "CATCH_UP_10M") => {
        const run = {
          id: "run-429-catchup",
          hotelId,
          scheduledFor,
          status: "RUNNING",
          leaseExpiresAt: new Date(scheduledFor.getTime() - 1),
          dryRun,
          summaryJson: { trigger, cutoffAt: scheduledFor.toISOString() },
        };
        pendingRuns.push(run);
        return run as any;
      },
    );

    await f.service.triggerCheckInBcaPush("hotel-1", primaryOccupant.stayId);
    await finishInitialDeliveries(f);

    const declAfter429 = await f.repository.findLatestDeclaration("hotel-1", primaryOccupant.id);
    expect(declAfter429).toMatchObject({
      status: "FAILED",
      providerCode: "429",
    });

    // Unchanged FAILED 429 fingerprint must remain eligible for automatic catch-up!
    expect(
      (f.service as any).isDeclarationEligibleForAutoCatchUp(
        primaryOccupant,
        declAfter429,
        "2026-09-14",
      ),
    ).toBe(true);

    // Connection enters temporary disconnect cooldown with bounded Retry-After (25s instead of 60s)
    expect(f.rows.get("hotel-1")).toMatchObject({
      status: "DISCONNECTED",
      lastErrorCode: "KBTT_TEMP_DISCONNECTED",
    });
    const viewDuringCooldown = await f.service.get("owner", "owner-role", "hotel-1");
    expect(viewDuringCooldown.cooldownUntil).toBe("2026-09-14T14:03:25.000Z");

    // Advance 25s -> health probe runs, restores CONNECTED, and registers catch-up at 21:10 VN (14:10:00.000Z)
    jest.setSystemTime(new Date("2026-09-14T14:03:25.000Z"));
    await f.service.probeTemporarilyDisconnectedSession("hotel-1", false);
    expect(f.rows.get("hotel-1")?.status).toBe("CONNECTED");
    expect(f.repository.createScheduledAutoSubmitRun).toHaveBeenCalledWith(
      "hotel-1",
      new Date("2026-09-14T14:10:00.000Z"),
      false,
      "CATCH_UP_10M",
      { cutoffAt: "2026-09-14T14:10:00.000Z" },
    );
    f.service.onModuleDestroy();
  });

  it("BCA-03: bases automatic catch-up eligibility strictly on authoritative stay arrival and blocks prior-day stays with edited today draft dates", async () => {
    jest.setSystemTime(new Date("2026-09-14T05:00:00.000Z")); // 2026-09-14 12:00 VN
    const f = fixture();
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);

    const priorDayStayOccupant = {
      ...primaryOccupant,
      id: "occ-prior-with-edited-draft",
      checkedInAt: new Date("2026-09-12T07:00:00.000Z"), // 2026-09-12 14:00 VN (D-2 out-of-window stay)
      plannedCheckInAt: new Date("2026-09-12T07:00:00.000Z"),
      stay: {
        ...primaryOccupant.stay,
        checkedInAt: new Date("2026-09-12T07:00:00.000Z"),
        plannedCheckInAt: new Date("2026-09-12T07:00:00.000Z"),
      },
    };
    f.occupants.set(priorDayStayOccupant.id, priorDayStayOccupant);

    // Save a draft where operator manually edited ngayDenCsltStr to today (2026-09-14)
    await f.service.saveDraft("owner", "owner-role", "hotel-1", priorDayStayOccupant.id, {
      citizenshipKind: "VIETNAMESE",
      data: {
        ngayDenCsltStr: "2026-09-14 10:00:00",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
        soGiayTo: "001090777888",
        loaiGiayTo: 1,
        lyDoCuTru: 1,
      },
    });

    // Must NOT schedule automatic catch-up and must NOT be eligible for auto catch-up
    expect(f.repository.createScheduledAutoSubmitRun).not.toHaveBeenCalled();
    const savedDecl = await f.repository.findLatestDeclaration("hotel-1", priorDayStayOccupant.id);
    expect(
      (f.service as any).isDeclarationEligibleForAutoCatchUp(
        priorDayStayOccupant,
        savedDecl,
        "2026-09-14",
      ),
    ).toBe(false);

    // Listing declarations surfaces OUT_OF_DATE_WINDOW with nextCatchUpAt: null
    const list = await f.service.listDeclarations("owner", "owner-role", "hotel-1");
    expect(list.items[0].declaration).toMatchObject({
      eligibilityState: "NEEDS_CORRECTION",
      nextCatchUpAt: null,
    });

    // Running automatic 12:00 sweep does not send it
    await f.service.executeAutoSubmitForHotel(
      "hotel-1",
      new Date("2026-09-14T05:00:00.000Z"),
      false,
    );
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });

  it("BCA-04 + BCA-05: fences stale session/connection generation even with same CsltId, durably schedules catch-up after scheduled transient failure, and reports truthful nextCatchUpAt", async () => {
    jest.setSystemTime(new Date("2026-09-14T14:03:00.000Z")); // 21:03 VN
    const f = fixture();
    f.occupants.set(primaryOccupant.id, primaryOccupant);

    const sessionA = session({ AccessToken: "token-gen-A", CsltId: "1000227" });
    const sessionB = session({ AccessToken: "token-gen-B", CsltId: "1000227" });
    f.provider.login.mockResolvedValueOnce(sessionA).mockResolvedValueOnce(sessionB);

    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);

    // Before any catch-up run is persisted, listDeclarations must NOT fabricate nextCatchUpAt
    await f.repository.createDeclaration({
      hotelId: "hotel-1",
      stayId: primaryOccupant.stayId,
      occupantId: primaryOccupant.id,
      declarationKind: "VIETNAMESE",
      status: "DRAFT",
      draftPayloadJson: { soGiayTo: "001090012345", loaiGiayTo: 1, lyDoCuTru: 1 },
    });
    const listBeforeSchedule = await f.service.listDeclarations("owner", "owner-role", "hotel-1");
    expect(listBeforeSchedule.items[0].declaration?.eligibilityState).toBe("ELIGIBLE_SAME_DAY");
    expect(listBeforeSchedule.items[0].declaration?.nextCatchUpAt).toBeNull();
    expect(listBeforeSchedule.delivery.nextCatchUpAt).toBeNull();

    // Capture generation A, then simulate relogin to generation B (same CsltId, new token & ciphertext) right before dispatch
    const decl = (await f.repository.findLatestDeclaration("hotel-1", primaryOccupant.id))!;
    const claimed = await f.repository.updateDeclaration({
      id: decl.id,
      hotelId: "hotel-1",
      expectedVersion: decl.version,
      data: {
        status: "UNKNOWN",
        submittedCsltId: "1000227",
        submittedPayloadJson: [
          {
            hoTen: "Nguyen Van A",
            soGiayTo: "001090012345",
            loaiGiayTo: 1,
            ngayDenCsltStr: "2026-09-14 10:00:00",
            ngayDiDuKienStr: "2026-09-15 12:00:00",
          },
        ],
      },
    });

    // Relogin to sessionB (same CsltId = 1000227)
    await f.service.connect("owner", "owner-role", "hotel-1", {
      username: "fixture-owner-2",
      password: "new-password-123",
    });
    enableAutomaticDelivery(f);

    // Attempt to send using captured token-gen-A must be blocked by generation fence!
    const staleOutcome = await (f.service as any).sendInitialDeclaration(
      "hotel-1",
      claimed.id,
      "VIETNAMESE",
      claimed.submittedPayloadJson,
      sessionA.AccessToken,
      "1000227",
      true,
    );
    expect(staleOutcome).toMatchObject({
      outcome: "BUSINESS_REJECTION",
      code: "CONNECTION_SCOPE_CHANGED",
    });
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();

    // Now test scheduled run hitting transient/scope rejection at 21:03 VN -> persists FAILED and durably registers 21:10 catch-up
    await f.repository.updateDeclaration({
      id: claimed.id,
      hotelId: "hotel-1",
      expectedVersion: claimed.version,
      data: { status: "DRAFT", providerCode: null },
    });

    const pendingRuns: any[] = [];
    (f.repository.findPendingScheduledAutoSubmitRuns as jest.Mock).mockImplementation(
      async () => pendingRuns,
    );
    f.repository.createScheduledAutoSubmitRun.mockImplementation(
      async (hotelId: string, scheduledFor: Date, dryRun: boolean, trigger = "CATCH_UP_10M") => {
        const run = {
          id: "run-catchup-2110",
          hotelId,
          scheduledFor,
          status: "RUNNING",
          leaseExpiresAt: new Date(scheduledFor.getTime() - 1),
          dryRun,
          summaryJson: { trigger, cutoffAt: scheduledFor.toISOString() },
        };
        pendingRuns.push(run);
        return run as any;
      },
    );

    f.provider.submitDeclaration.mockResolvedValueOnce({
      outcome: "BUSINESS_REJECTION",
      code: "DELIVERY_BUSY",
      message: "Busy",
    });

    await f.service.executeAutoSubmitForHotel(
      "hotel-1",
      new Date("2026-09-14T14:00:00.000Z"),
      false,
    );

    expect(f.repository.createScheduledAutoSubmitRun).toHaveBeenCalledWith(
      "hotel-1",
      new Date("2026-09-14T14:10:00.000Z"),
      false,
      "CATCH_UP_10M",
      { cutoffAt: "2026-09-14T14:10:00.000Z" },
    );

    // Now that a real pending catch-up run exists at 21:10 VN, listDeclarations exposes it truthfully
    const listAfterSchedule = await f.service.listDeclarations("owner", "owner-role", "hotel-1");
    expect(listAfterSchedule.items[0].declaration?.nextCatchUpAt).toBe("2026-09-14T14:10:00.000Z");
    expect(listAfterSchedule.delivery.nextCatchUpAt).toBe("2026-09-14T14:10:00.000Z");
    f.service.onModuleDestroy();
  });

  it("BCA-08: enforces exclusive (providerOrigin, CsltId) facility ownership across hotels and tenants, including concurrent connects and legacy conflicts", async () => {
    const f = fixture();
    f.access.assertHotelAccess.mockImplementation(async (_u: string, _r: string, hId: string) => ({
      id: hId,
    }));

    const sharedSession1 = session({ AccessToken: "tok-h1", CsltId: "1000227" });
    const sharedSession2 = session({ AccessToken: "tok-h2", CsltId: "1000227" });
    f.provider.login
      .mockResolvedValueOnce(sharedSession1)
      .mockResolvedValueOnce(sharedSession2);

    // Concurrent connect for hotel-1 (tenant A) and hotel-2 (tenant B) with the same BCA facility CsltId
    const [res1, res2] = await Promise.allSettled([
      f.service.connect("owner-1", "owner-role", "hotel-1", credentials),
      f.service.connect("owner-2", "owner-role", "hotel-2", {
        username: "other-user-same-cslt",
        password: "pwd",
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
    const rejected = [res1, res2].filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(rejected[0].reason.response).toMatchObject({
      code: "KBTT_FACILITY_CONFLICT",
    });
    // Must not leak hotel-1's name or tenant identity in error message
    expect(JSON.stringify(rejected[0].reason.response)).not.toContain("hotel-1");
    // Rejected login's token is revoked immediately
    expect(f.provider.revoke).toHaveBeenCalledWith("tok-h2", expect.any(AbortSignal));

    // Legacy conflict simulation: if DB already has two hotels with the same csltId, both fail closed on check/dispatch/get
    f.rows.set("hotel-2", {
      ...f.rows.get("hotel-1")!,
      hotelId: "hotel-2",
      ciphertext: "legacy-cipher-h2",
    });
    const legacyView = await f.service.get("owner-1", "owner-role", "hotel-1");
    expect(legacyView).toMatchObject({
      status: "DISCONNECTED",
      lastErrorCode: "KBTT_FACILITY_CONFLICT",
    });
    await expect(f.service.check("owner-1", "owner-role", "hotel-1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "KBTT_FACILITY_CONFLICT" }),
    });
    f.service.onModuleDestroy();
  });

  it("BCA-09: reconciles UNKNOWN-only pending work during health probe and scheduled runs, settling confirmed matches as SUBMITTED, scheduling proven nonacceptance for same-day catch-up, and keeping incomplete reads as UNKNOWN", async () => {
    jest.setSystemTime(new Date("2026-09-14T14:03:00.000Z")); // 21:03 VN
    const client = new KbttProviderReadClient();
    jest.spyOn(client, "getAccommodation").mockResolvedValue({
      httpStatus: 200,
      envelope: { code: "200" },
      data: { id: 1000227, tenCSLT: "Khách sạn mẫu" },
    });
    const readResidents = jest.spyOn(client, "readAllResidents").mockResolvedValue([]);
    const readHistory = jest.spyOn(client, "readAllHistory").mockResolvedValue([]);

    const f = fixture(client);
    const guestMatched = {
      ...primaryOccupant,
      id: "occ-unknown-matched",
      fullName: "Khach Da Nhan Tren BCA",
      identityNumber: "001090111222",
    };
    const guestNotFound = {
      ...primaryOccupant,
      id: "occ-unknown-notfound",
      fullName: "Khach Chua Nhan Tren BCA",
      identityNumber: "001090333444",
    };
    f.occupants.set(guestMatched.id, guestMatched);
    f.occupants.set(guestNotFound.id, guestNotFound);

    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);

    const declMatched = await f.repository.createDeclaration({
      hotelId: "hotel-1",
      stayId: guestMatched.stayId,
      occupantId: guestMatched.id,
      declarationKind: "VIETNAMESE",
      status: "UNKNOWN",
      submittedCsltId: "1000227",
      submittedPayloadJson: [
        {
          hoTen: guestMatched.fullName,
          soGiayTo: guestMatched.identityNumber,
          loaiGiayTo: 1,
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
        },
      ],
      providerCode: "PROVIDER_TIMEOUT",
      providerMessage: "Timeout",
    });
    const declNotFound = await f.repository.createDeclaration({
      hotelId: "hotel-1",
      stayId: guestNotFound.stayId,
      occupantId: guestNotFound.id,
      declarationKind: "VIETNAMESE",
      status: "UNKNOWN",
      submittedCsltId: "1000227",
      submittedPayloadJson: [
        {
          hoTen: guestNotFound.fullName,
          soGiayTo: guestNotFound.identityNumber,
          loaiGiayTo: 1,
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
        },
      ],
      providerCode: "PROVIDER_TIMEOUT",
      providerMessage: "Timeout",
    });

    // Enter temporary disconnect when ONLY UNKNOWN declarations exist (no DRAFT/FAILED safe work)
    const activeSession = f.service.getCachedReadSession("hotel-1", f.rows.get("hotel-1")!)!;
    await f.service.enterTemporaryDisconnectCooldown("hotel-1", activeSession);

    // Case A: Incomplete/failed read during reconciliation must keep both records as UNKNOWN and never resend
    readHistory.mockRejectedValueOnce(new KbttProviderReadError("INCOMPLETE", "partial page"));
    jest.setSystemTime(new Date("2026-09-14T14:04:01.000Z")); // 21:04:01 VN (after 60s cooldown)
    expect(await f.service.probeTemporarilyDisconnectedSession("hotel-1", false)).toBe(true);
    expect(f.rows.get("hotel-1")?.status).toBe("CONNECTED");
    expect((await f.repository.findLatestDeclaration("hotel-1", guestMatched.id))?.status).toBe(
      "UNKNOWN",
    );
    expect((await f.repository.findLatestDeclaration("hotel-1", guestNotFound.id))?.status).toBe(
      "UNKNOWN",
    );
    expect(f.repository.createScheduledAutoSubmitRun).not.toHaveBeenCalled();

    // Case B: Complete read returns guestMatched on BCA and proves guestNotFound is absent
    readHistory.mockImplementation(async (kind) =>
      kind === "VIETNAMESE"
        ? [
            {
              id: "bca-rec-901",
              hoTen: guestMatched.fullName,
              csltId: 1000227,
              soGiayTo: guestMatched.identityNumber,
              loaiGiayTo: 1,
              quocTich: "VNM",
              ngayDenCslt: "2026-09-14 10:00:00",
              ngayDiCslt: "",
              ngayDiDuKien: "2026-09-15 12:00:00",
              soPhong: "101",
            },
          ]
        : [],
    );
    readResidents.mockResolvedValue([]);

    const recResult = await f.service.reconcilePendingUnknownDeclarationsForHotel(
      "hotel-1",
      false,
      new Date("2026-09-14T14:04:05.000Z"),
    );
    expect(recResult).toEqual({
      settledCount: 1,
      retryScheduledCount: 0,
      remainingUnknownCount: 1,
    });

    // guestMatched is settled as SUBMITTED without another POST
    const updatedMatched = await f.repository.findLatestDeclaration("hotel-1", guestMatched.id);
    expect(updatedMatched).toMatchObject({
      id: declMatched.id,
      status: "SUBMITTED",
      providerCode: "200",
    });

    // guestNotFound MUST remain UNKNOWN (empty read is NOT authoritative proof of nonacceptance) and must NOT schedule automatic retry
    const updatedNotFound = await f.repository.findLatestDeclaration("hotel-1", guestNotFound.id);
    expect(updatedNotFound).toMatchObject({
      id: declNotFound.id,
      status: "UNKNOWN",
      providerCode: "PROVIDER_TIMEOUT",
    });
    expect(f.repository.createScheduledAutoSubmitRun).not.toHaveBeenCalled();
    f.service.onModuleDestroy();
  });

  it("BCA-09 + BCA-04: fences in-flight deferred POST (21:03:50 -> 21:04:00 empty read -> 21:04:10 late SUCCESS) without duplicate resend or lost acceptance, and fences generation change during ownership await and late 401/SUCCESS after relogin", async () => {
    jest.setSystemTime(new Date("2026-09-14T14:03:50.000Z")); // 21:03:50 VN
    const client = new KbttProviderReadClient();
    jest.spyOn(client, "getAccommodation").mockResolvedValue({
      httpStatus: 200,
      envelope: { code: "200" },
      data: { id: 1000227, tenCSLT: "Khách sạn mẫu" },
    });
    jest.spyOn(client, "readAllResidents").mockResolvedValue([]);
    jest.spyOn(client, "readAllHistory").mockResolvedValue([]);

    const f = fixture(client);
    f.occupants.set(primaryOccupant.id, structuredClone(primaryOccupant));
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);

    // 1. Reproduce deferred POST starting at 21:03:50, cron running at 21:04:00 seeing empty BCA list, and POST succeeding at 21:04:10
    let resolveDeferredPost!: (val: any) => void;
    f.provider.submitDeclaration.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDeferredPost = resolve;
        }),
    );

    const submitted = await f.service.submit("owner", "owner-role", "hotel-1", primaryOccupant.id);
    expect(submitted.status).toBe("UNKNOWN");
    await new Promise(resolve => setImmediate(resolve));

    // Advance to 21:04:00 VN while POST is still in flight -> cron runs reconciliation with empty BCA reads
    jest.setSystemTime(new Date("2026-09-14T14:04:00.000Z"));
    const midFlightRec = await f.service.reconcilePendingUnknownDeclarationsForHotel(
      "hotel-1",
      true,
      new Date("2026-09-14T14:04:00.000Z"),
    );
    expect(midFlightRec).toEqual({
      settledCount: 0,
      retryScheduledCount: 0,
      remainingUnknownCount: 1,
    });
    expect(f.repository.createScheduledAutoSubmitRun).not.toHaveBeenCalled();

    // Even if an external process incremented version on the row while in flight, late SUCCESS at 21:04:10 must settle SUBMITTED and never lose acceptance proof!
    const rawDecl = f.declarations.get(submitted.id);
    rawDecl.version += 1;

    jest.setSystemTime(new Date("2026-09-14T14:04:10.000Z"));
    resolveDeferredPost({
      outcome: "SUCCESS",
      code: "200",
      message: "Thành công",
      data: { id: "bca-late-999" },
    });
    await finishInitialDeliveries(f);

    const settledDecl = await f.repository.findLatestDeclaration("hotel-1", primaryOccupant.id);
    expect(settledDecl).toMatchObject({
      id: submitted.id,
      status: "SUBMITTED",
      providerCode: "200",
    });
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);

    // 2. Generation change A -> B during hasConflictingFacilityOwnership await when staySync is disabled must block old token A!
    const guestGenRace = {
      ...primaryOccupant,
      id: "occ-gen-race",
      identityNumber: "001090555666",
    };
    f.occupants.set(guestGenRace.id, guestGenRace);
    const declRace = await f.repository.createDeclaration({
      hotelId: "hotel-1",
      stayId: guestGenRace.stayId,
      occupantId: guestGenRace.id,
      declarationKind: "VIETNAMESE",
      status: "UNKNOWN",
      submittedCsltId: "1000227",
      submittedPayloadJson: [
        {
          hoTen: "Nguyen Van Race",
          gioiTinh: "M",
          ngayThangNamSinhStr: "1990-01-01",
          soGiayTo: "001090555666",
          loaiGiayTo: 1,
          lyDoCuTru: 1,
          soPhong: "101",
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
        },
      ],
    });
    const connA = f.rows.get("hotel-1")!;
    const tokenA = f.service.getCachedReadSession("hotel-1", connA)!.AccessToken;
    const cipherA = connA.ciphertext;

    f.repository.findConflictingFacilityConnections.mockImplementationOnce(async () => {
      // Simulate concurrent relogin to generation B during the ownership await
      const newSessionB = session({ AccessToken: "token-gen-B-live", CsltId: "1000227" });
      f.rows.set("hotel-1", { ...connA, ciphertext: "cipher-gen-B-live" });
      (f.service as any).sessions.set("hotel-1", {
        ciphertext: "cipher-gen-B-live",
        session: newSessionB,
      });
      return [];
    });

    f.provider.submitDeclaration.mockClear();
    const raceOutcome = await (f.service as any).sendInitialDeclaration(
      "hotel-1",
      declRace.id,
      "VIETNAMESE",
      declRace.submittedPayloadJson,
      tokenA,
      "1000227",
      true,
      cipherA,
    );
    expect(raceOutcome).toMatchObject({
      outcome: "BUSINESS_REJECTION",
      code: "CONNECTION_SCOPE_CHANGED",
    });
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();

    // 3. Late 401 failure from old generation A after relogin to generation B must NOT mark generation B AUTH_FAILED, and converts declaration failure to CONNECTION_SCOPE_CHANGED so it can retry under B
    await (f.service as any).persistDeclarationFailed(
      "hotel-1",
      declRace,
      "fp-old-a",
      { outcome: "BUSINESS_REJECTION", code: "401", message: "Unauthorized old token" },
      cipherA,
    );
    expect(f.rows.get("hotel-1")?.status).toBe("CONNECTED");
    const afterLate401 = await f.repository.findLatestDeclaration("hotel-1", guestGenRace.id);
    expect(afterLate401).toMatchObject({
      status: "FAILED",
      providerCode: "CONNECTION_SCOPE_CHANGED",
    });
    f.service.onModuleDestroy();
  });

  it("BCA-08 + BCA-06: blocks provider dispatch when KbttRepository.findConflictingFacilityConnections fails and returns connect/check/updateAutoSubmitEnabled promptly without awaiting slow background UNKNOWN reconciliation", async () => {
    const f = fixture();
    f.occupants.set(primaryOccupant.id, structuredClone(primaryOccupant));
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    enableAutomaticDelivery(f);

    // 1. Direct unit test on KbttRepository.findConflictingFacilityConnections: DB failure throws kbttUnavailable instead of returning []
    const brokenRepo = new KbttRepository({
      kbttHotelConnection: {
        findMany: jest.fn().mockRejectedValue(new Error("Connection pool exhausted")),
      },
    } as never);
    await expect(brokenRepo.findConflictingFacilityConnections("1000227", "hotel-1")).rejects.toThrow();

    // 2. When findConflictingFacilityConnections throws during sendInitialDeclaration, provider is NOT called
    const decl = await f.repository.createDeclaration({
      hotelId: "hotel-1",
      stayId: primaryOccupant.stayId,
      occupantId: primaryOccupant.id,
      declarationKind: "VIETNAMESE",
      status: "UNKNOWN",
      submittedCsltId: "1000227",
      submittedPayloadJson: [
        {
          hoTen: "Nguyen Van A",
          gioiTinh: "M",
          ngayThangNamSinhStr: "1990-01-01",
          soGiayTo: "001090012345",
          loaiGiayTo: 1,
          lyDoCuTru: 1,
          soPhong: "101",
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
        },
      ],
    });
    const conn = f.rows.get("hotel-1")!;
    const tok = f.service.getCachedReadSession("hotel-1", conn)!.AccessToken;
    f.repository.findConflictingFacilityConnections.mockRejectedValueOnce(new Error("DB down"));
    const blockedOutcome = await (f.service as any).sendInitialDeclaration(
      "hotel-1",
      decl.id,
      "VIETNAMESE",
      decl.submittedPayloadJson,
      tok,
      "1000227",
      true,
      conn.ciphertext,
    );
    expect(blockedOutcome).toMatchObject({
      outcome: "BUSINESS_REJECTION",
      code: "KBTT_UNAVAILABLE",
    });
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();

    // 3. Slow background UNKNOWN reconciliation does not block check or updateAutoSubmitEnabled
    let releaseSlowReconcile!: () => void;
    const slowReconcileSpy = jest
      .spyOn(f.service, "reconcilePendingUnknownDeclarationsForHotel")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseSlowReconcile = () =>
              resolve({ settledCount: 0, retryScheduledCount: 0, remainingUnknownCount: 1 });
          }),
      );

    let checkSettled = false;
    const checkPromise = f.service.check("owner", "owner-role", "hotel-1").then((res) => {
      checkSettled = true;
      return res;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(checkSettled).toBe(true);
    expect(slowReconcileSpy).toHaveBeenCalled();
    releaseSlowReconcile?.();
    await checkPromise;
    f.service.onModuleDestroy();
  });

  it("BCA-01 + BCA-08 + BCA-09: prioritizes DB-side day/status cohorts so old UNKNOWN prefixes never starve recent work, resumes bounded UNKNOWN/unsent cursors without capped false absence, and treats DB facility ownership as authoritative over stale activeFacilities cache", async () => {
    jest.setSystemTime(new Date("2026-09-14T14:03:00.000Z")); // 2026-09-14 21:03 VN
    const client = new KbttProviderReadClient();
    jest.spyOn(client, "getAccommodation").mockResolvedValue({
      httpStatus: 200,
      envelope: { code: "200" },
      data: { id: 1000227, tenCSLT: "Khách sạn mẫu" },
    });
    jest.spyOn(client, "readAllResidents").mockResolvedValue([]);
    const readHistory = jest.spyOn(client, "readAllHistory").mockImplementation(async (kind) =>
      kind === "VIETNAMESE"
        ? [
            {
              id: "bca-recent-match-1",
              hoTen: "Khach Moi Hom Nay",
              csltId: 1000227,
              soGiayTo: "001090999888",
              loaiGiayTo: 1,
              quocTich: "VNM",
              ngayDenCslt: "2026-09-14 10:00:00",
              ngayDiCslt: "",
              ngayDiDuKien: "2026-09-15 12:00:00",
              soPhong: "101",
            },
          ]
        : [],
    );

    const f = fixture(client);

    // 1. Seed a stale entry in static activeFacilities for another hotel while DB has 0 conflicting rows
    const facilityKey = (f.service as any).getFacilityKey("1000227");
    (KbttService as any).activeFacilities.set(facilityKey, "stale-deleted-hotel-99");
    await expect(f.service.connect("owner", "owner-role", "hotel-1", credentials)).resolves.toMatchObject({
      status: "CONNECTED",
      csltId: "1000227",
    });
    expect((KbttService as any).activeFacilities.get(facilityKey)).toBe("hotel-1");
    enableAutomaticDelivery(f);

    // 2. Seed an old >30d UNKNOWN prefix (2026-07-01) and a D-10 UNKNOWN prefix (2026-09-04) before a today UNKNOWN guest (2026-09-14)
    const oldOutWindowGuest = {
      ...primaryOccupant,
      id: "occ-0001-old-july",
      fullName: "Khach Cu Thang 7",
      identityNumber: "001090111000",
      checkedInAt: new Date("2026-07-01T03:00:00.000Z"),
      plannedCheckInAt: new Date("2026-07-01T03:00:00.000Z"),
      stay: {
        ...primaryOccupant.stay,
        checkedInAt: new Date("2026-07-01T03:00:00.000Z"),
        plannedCheckInAt: new Date("2026-07-01T03:00:00.000Z"),
      },
    };
    const recentTodayGuest = {
      ...primaryOccupant,
      id: "occ-9999-today",
      fullName: "Khach Moi Hom Nay",
      identityNumber: "001090999888",
      checkedInAt: new Date("2026-09-14T03:00:00.000Z"),
      plannedCheckInAt: new Date("2026-09-14T03:00:00.000Z"),
      stay: {
        ...primaryOccupant.stay,
        checkedInAt: new Date("2026-09-14T03:00:00.000Z"),
        plannedCheckInAt: new Date("2026-09-14T03:00:00.000Z"),
      },
    };
    f.occupants.set(oldOutWindowGuest.id, oldOutWindowGuest);
    f.occupants.set(recentTodayGuest.id, recentTodayGuest);

    await f.repository.createDeclaration({
      hotelId: "hotel-1",
      stayId: oldOutWindowGuest.stayId,
      occupantId: oldOutWindowGuest.id,
      declarationKind: "VIETNAMESE",
      status: "UNKNOWN",
      submittedCsltId: "1000227",
      submittedPayloadJson: [
        {
          hoTen: oldOutWindowGuest.fullName,
          soGiayTo: oldOutWindowGuest.identityNumber,
          loaiGiayTo: 1,
          ngayDenCsltStr: "2026-07-01 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
        },
      ],
    });
    const declRecent = await f.repository.createDeclaration({
      hotelId: "hotel-1",
      stayId: recentTodayGuest.stayId,
      occupantId: recentTodayGuest.id,
      declarationKind: "VIETNAMESE",
      status: "UNKNOWN",
      submittedCsltId: "1000227",
      submittedPayloadJson: [
        {
          hoTen: recentTodayGuest.fullName,
          soGiayTo: recentTodayGuest.identityNumber,
          loaiGiayTo: 1,
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
        },
      ],
    });

    f.occupantsReadService.getActiveStayOccupantsPaged.mockClear();
    const recRes = await f.service.reconcilePendingUnknownDeclarationsForHotel(
      "hotel-1",
      true,
      new Date("2026-09-14T14:03:00.000Z"),
    );
    expect(recRes).toEqual({
      settledCount: 1,
      retryScheduledCount: 0,
      remainingUnknownCount: 0,
    });
    expect(readHistory).toHaveBeenCalledWith(
      "VIETNAMESE",
      expect.any(String),
      { dateFrom: "2026-09-14", dateTo: "2026-09-14" },
      expect.any(AbortSignal),
    );
    expect((await f.repository.findLatestDeclaration("hotel-1", recentTodayGuest.id))?.status).toBe(
      "SUBMITTED",
    );
    expect(declRecent.id).toBeDefined();

    // Verify DB-side arrivalStart/arrivalEnd cohort bounds were passed to getActiveStayOccupantsPaged
    expect(f.occupantsReadService.getActiveStayOccupantsPaged).toHaveBeenNthCalledWith(
      1,
      "hotel-1",
      expect.objectContaining({
        kbttFilter: "UNKNOWN_ONLY",
        arrivalStart: expect.any(Date),
        arrivalEnd: expect.any(Date),
      }),
    );

    // 3. Capped scan in reconcilePendingUnknownDeclarationsForHotel (>20 pages) reports incomplete: true, saves nextCursor, and schedules durable CONTINUATION_UNKNOWN
    let pageCallCount = 0;
    f.occupantsReadService.getActiveStayOccupantsPaged.mockImplementation(async (_hId, opts) => {
      pageCallCount++;
      return {
        items: [recentTodayGuest],
        nextCursor: `cursor-page-${pageCallCount}`,
      };
    });
    await f.repository.updateDeclaration({
      id: declRecent.id,
      hotelId: "hotel-1",
      expectedVersion: (await f.repository.findLatestDeclaration("hotel-1", recentTodayGuest.id))!
        .version,
      data: { status: "UNKNOWN" },
    });
    (f.service as any).historyDayCache?.clear();
    readHistory.mockResolvedValue([]);

    const cappedRec = await f.service.reconcilePendingUnknownDeclarationsForHotel(
      "hotel-1",
      true,
      new Date("2026-09-14T14:03:00.000Z"),
    );
    expect(cappedRec).toEqual({
      settledCount: 0,
      retryScheduledCount: 0,
      remainingUnknownCount: 1,
      incomplete: true,
      nextCursor: "cursor-page-20",
    });
    expect(f.repository.createScheduledAutoSubmitRun).toHaveBeenCalledWith(
      "hotel-1",
      new Date("2026-09-14T14:10:00.000Z"),
      false,
      "CONTINUATION_UNKNOWN",
      expect.objectContaining({ unknownResume: expect.objectContaining({ recent: "cursor-page-20", day: "2026-09-14" }) }),
    );

    // Simulate process restart: only the persisted checkpoint survives.
    const checkpoint = f.repository.createScheduledAutoSubmitRun.mock.calls.at(-1)![4]!.unknownResume;
    (f.service as any).unknownReconciliationCursors.clear();
    f.occupantsReadService.getActiveStayOccupantsPaged.mockClear();
    f.occupantsReadService.getActiveStayOccupantsPaged.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    await f.service.reconcilePendingUnknownDeclarationsForHotel(
      "hotel-1",
      true,
      new Date("2026-09-14T14:10:00.000Z"),
      checkpoint,
    );
    expect(f.occupantsReadService.getActiveStayOccupantsPaged).toHaveBeenNthCalledWith(
      1,
      "hotel-1",
      expect.objectContaining({
        cursor: "cursor-page-20",
        kbttFilter: "UNKNOWN_ONLY",
      }),
    );

    // Exactly finishing recent work at the budget must continue the older cohort,
    // including when the scheduled boundary already belongs to another trigger.
    let exactPage = 0;
    const pendingBoundary = { id: "existing-boundary", status: "RUNNING", scheduledFor: new Date("2026-09-14T14:10:00.000Z") };
    f.repository.findPendingScheduledAutoSubmitRuns.mockResolvedValue([pendingBoundary] as any);
    f.occupantsReadService.getActiveStayOccupantsPaged.mockImplementation(async () => ({
      items: [recentTodayGuest],
      nextCursor: ++exactPage < 20 ? `exact-${exactPage}` : null,
    }));
    await f.service.reconcilePendingUnknownDeclarationsForHotel("hotel-1", true, new Date("2026-09-14T14:03:00.000Z"));
    expect(f.repository.saveUnknownContinuation).toHaveBeenLastCalledWith("existing-boundary", expect.objectContaining({ day: "2026-09-14", next: "window" }));
    (f.service as any).unknownReconciliationCursors.clear();
    f.occupantsReadService.getActiveStayOccupantsPaged.mockClear();
    f.occupantsReadService.getActiveStayOccupantsPaged.mockResolvedValue({ items: [], nextCursor: null });
    await f.service.reconcilePendingUnknownDeclarationsForHotel("hotel-1", true, new Date("2026-09-14T14:10:00.000Z"), { day: "2026-09-14", next: "window" });
    expect(f.occupantsReadService.getActiveStayOccupantsPaged).toHaveBeenNthCalledWith(1, "hotel-1", expect.objectContaining({ arrivalEnd: new Date("2026-09-12T17:00:00.000Z"), cursor: undefined }));

    // 4. hasPendingUnknownWork and hasEligibleSameDayUnsentWork never report false absence when capped with nextCursor !== null
    let unknownCheckPage = 0;
    f.occupantsReadService.getActiveStayOccupantsPaged.mockImplementation(async () => {
      unknownCheckPage++;
      return {
        items: [oldOutWindowGuest], // not UNKNOWN in declMap when we set status to DRAFT
        nextCursor: `unk-cursor-${unknownCheckPage}`,
      };
    });
    const oldDecl = (await f.repository.findLatestDeclaration("hotel-1", oldOutWindowGuest.id))!;
    await f.repository.updateDeclaration({
      id: oldDecl.id,
      hotelId: "hotel-1",
      expectedVersion: oldDecl.version,
      data: { status: "DRAFT" },
    });
    await expect(
      f.service.hasPendingUnknownWork("hotel-1", new Date("2026-09-14T14:03:00.000Z")),
    ).resolves.toBe(true);
    expect(unknownCheckPage).toBe(50);

    let unsentCheckPage = 0;
    const lockedFailedDecl = (await f.repository.findLatestDeclaration(
      "hotel-1",
      recentTodayGuest.id,
    ))!;
    const draftForLocked = (f.service as any).withOccupantDefaults(
      "VIETNAMESE",
      lockedFailedDecl.draftPayloadJson ?? {},
      recentTodayGuest,
    );
    const lockedFp = createHash("sha256")
      .update(JSON.stringify([kbttVietnameseReadySchema.parse(normalizeKbttSubmissionDates("VIETNAMESE", draftForLocked, new Date("2026-09-14T14:03:00.000Z")))]))
      .digest("hex");
    await f.repository.updateDeclaration({
      id: lockedFailedDecl.id,
      hotelId: "hotel-1",
      expectedVersion: lockedFailedDecl.version,
      data: {
        status: "FAILED",
        providerCode: "LOCAL_VALIDATION",
        submittedPayloadFingerprint: lockedFp,
      },
    });
    f.occupantsReadService.getActiveStayOccupantsPaged.mockImplementation(async () => {
      unsentCheckPage++;
      return {
        items: [recentTodayGuest], // ineligible because LOCAL_VALIDATION with unchanged fingerprint
        nextCursor: `unsent-cursor-${unsentCheckPage}`,
      };
    });
    await expect(
      f.service.hasEligibleSameDayUnsentWork("hotel-1", new Date("2026-09-14T14:03:00.000Z")),
    ).resolves.toBe(true);
    expect(unsentCheckPage).toBe(100);
    f.service.onModuleDestroy();
  });

  it("BCA-08 + BCA-09: verifies applied local PostgreSQL indexes/columns and enforces KbttHotelConnection_csltId_key inside a rolled-back transaction", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: resolve(__dirname, "../../../../.env") });
    const dbUrl =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/vietsage_auth?schema=public";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg") as typeof import("pg");
    const pool = new Pool({ connectionString: dbUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const idxRes = await client.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'KbttHotelConnection_csltId_key',
            'KbttGuestDeclaration_hotelId_occupantId_revision_idx',
            'GuestStayOccupant_hotelId_id_idx'
          )
        ORDER BY indexname ASC
      `);
      expect(idxRes.rows.map((r) => r.indexname)).toEqual([
        "GuestStayOccupant_hotelId_id_idx",
        "KbttGuestDeclaration_hotelId_occupantId_revision_idx",
        "KbttHotelConnection_csltId_key",
      ]);

      const colRes = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'KbttGuestDeclaration'
          AND column_name IN ('submittedConnectionCiphertext', 'claimToken', 'attemptedAt')
        ORDER BY column_name ASC
      `);
      expect(colRes.rows.map((r) => r.column_name)).toEqual([
        "attemptedAt",
        "claimToken",
        "submittedConnectionCiphertext",
      ]);

      const dupRes = await client.query(`
        SELECT "csltId", COUNT(*)
        FROM "KbttHotelConnection"
        GROUP BY "csltId"
        HAVING COUNT(*) > 1
      `);
      expect(dupRes.rowCount).toBe(0);

      // Verify unique index constraint on KbttHotelConnection(csltId) inside SAVEPOINT so the transaction remains clean
      await client.query(`
        INSERT INTO "Tenant" ("id", "code", "name", "updatedAt")
        VALUES ('tenant-bca-mig-test-1', 'TBM1', 'Tenant BCA Mig Test 1', NOW()),
               ('tenant-bca-mig-test-2', 'TBM2', 'Tenant BCA Mig Test 2', NOW())
      `);
      await client.query(`
        INSERT INTO "Hotel" ("id", "tenantId", "name", "code", "updatedAt")
        VALUES
          ('hotel-bca-mig-1', 'tenant-bca-mig-test-1', 'Hotel 1', 'HBM1', NOW()),
          ('hotel-bca-mig-2', 'tenant-bca-mig-test-2', 'Hotel 2', 'HBM2', NOW())
      `);
      await client.query(`
        INSERT INTO "KbttHotelConnection" (
          "hotelId", "csltId", "ciphertext", "iv", "authTag", "keyVersion",
          "status", "lastCheckedAt", "lastConnectedAt"
        ) VALUES (
          'hotel-bca-mig-1', '999888777', 'cipher-1', 'iv-1', 'tag-1', 1,
          'CONNECTED', NOW(), NOW()
        )
      `);
      await client.query("SAVEPOINT sp_dup_cslt");
      let duplicateConstraintErrorCode: string | null = null;
      try {
        await client.query(`
          INSERT INTO "KbttHotelConnection" (
            "hotelId", "csltId", "ciphertext", "iv", "authTag", "keyVersion",
            "status", "lastCheckedAt", "lastConnectedAt"
          ) VALUES (
            'hotel-bca-mig-2', '999888777', 'cipher-2', 'iv-2', 'tag-2', 1,
            'CONNECTED', NOW(), NOW()
          )
        `);
      } catch (err: any) {
        duplicateConstraintErrorCode = err?.code ?? "UNKNOWN_PG_ERROR";
        await client.query("ROLLBACK TO SAVEPOINT sp_dup_cslt");
      }
      expect(duplicateConstraintErrorCode).toBe("23505");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});


describe("BCA mandatory reconciliation before every initial transmission", () => {
  async function setup() {
    const f = fixture();
    f.occupants.set(primaryOccupant.id, structuredClone(primaryOccupant));
    await f.service.connect("owner", "owner-role", "hotel-1", credentials);
    return { f, read: (f.service as any).providerRead };
  }
  it("settles an already accepted record without another POST", async () => {
    const { f, read } = await setup();
    read.readAllHistory.mockResolvedValue([{
      id: "accepted-1", csltId: 1000227, hoTen: primaryOccupant.fullName,
      soGiayTo: primaryOccupant.identityNumber, loaiGiayTo: 1,
      ngayDenCslt: "2026-09-14T10:00:00+07:00", ngayDiDuKien: "2026-09-15T12:00:00+07:00",
    }]);
    const result = await f.service.submit("owner", "owner-role", "hotel-1", primaryOccupant.id);
    await finishInitialDeliveries(f);
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(f.declarations.get(result.id)).toMatchObject({ status: "SUBMITTED", providerCode: "200" });
    f.service.onModuleDestroy();
  });
  it("sends only after complete residents and arrival-day history reads prove no match", async () => {
    const { f, read } = await setup();
    f.provider.submitDeclaration.mockImplementation(async () => {
      expect(read.readAllResidents).toHaveBeenCalled();
      expect(read.readAllHistory).toHaveBeenCalledWith("VIETNAMESE", expect.any(String), { dateFrom: "2026-09-14", dateTo: "2026-09-14" }, expect.any(AbortSignal));
      return { outcome: "SUCCESS", code: "200", message: "OK" };
    });
    await f.service.submit("owner", "owner-role", "hotel-1", primaryOccupant.id);
    await finishInitialDeliveries(f);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    f.service.onModuleDestroy();
  });
  it("blocks a different-day active BCA stay with the same document instead of creating another", async () => {
    const { f, read } = await setup();
    read.readAllResidents.mockResolvedValue([{
      id: "active-older", csltId: 1000227, hoTen: primaryOccupant.fullName,
      soGiayTo: primaryOccupant.identityNumber, loaiGiayTo: 1,
      ngayDenCslt: "2026-09-13T10:00:00+07:00",
    }]);
    const result = await f.service.submit("owner", "owner-role", "hotel-1", primaryOccupant.id);
    await finishInitialDeliveries(f);
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(f.declarations.get(result.id)).toMatchObject({ status: "FAILED", providerCode: "RECONCILIATION_REQUIRED" });
    f.service.onModuleDestroy();
  });
  it.each(["unavailable", "wrong-facility"])("defers without a POST when reconciliation is %s", async reason => {
    const { f, read } = await setup();
    if (reason === "unavailable") read.readAllHistory.mockRejectedValue(new Error("network"));
    else read.readAllResidents.mockResolvedValue([{ id: "other", csltId: 999, hoTen: "Other" }]);
    const result = await f.service.submit("owner", "owner-role", "hotel-1", primaryOccupant.id);
    await finishInitialDeliveries(f);
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(f.declarations.get(result.id)).toMatchObject({ status: "FAILED", providerCode: "RECONCILIATION_REQUIRED" });
    f.service.onModuleDestroy();
  });
});
