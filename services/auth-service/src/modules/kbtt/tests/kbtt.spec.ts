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
import { randomBytes } from "node:crypto";
import type { KbttHotelConnection } from "@prisma/client";
import { KbttController } from "../api/kbtt.controller";
import { KbttService } from "../application/kbtt.service";
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
const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function session(overrides: Partial<KbttSession> = {}): KbttSession {
  return {
    AccessToken: randomBytes(24).toString("base64"),
    RefreshToken: randomBytes(24).toString("base64"),
    TokenType: "bearer",
    Exp: Math.floor(Date.now() / 1000) + 300,
    Authorities: ["kbtt:create-3th"],
    ClientId: 7,
    LoaiTK: "CSLT",
    CsltId: "1000227",
    CsltKhuVuc: 86,
    CsltDonVi: 1332,
    MaTTCuaCslt: "101",
    MaPxCuaCslt: "101900256",
    IsCsltChinh: true,
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
      rows.set(connection.hotelId, connection);
      return connection;
    }),
    update: jest.fn(async (connection: KbttHotelConnection, data: Partial<KbttHotelConnection>) => {
      const updated = { ...connection, ...data };
      rows.set(connection.hotelId, updated);
      return updated;
    }),
    remove: jest.fn(async (hotelId: string) => {
      rows.delete(hotelId);
    }),
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
      async (params: {
        id: string;
        hotelId: string;
        expectedVersion: number;
        allowedStatuses: any[];
        data: any;
      }) => {
        const existing = declarations.get(params.id);
        if (!existing || existing.hotelId !== params.hotelId) {
          throw new NotFoundException("Hồ sơ không tồn tại.");
        }
        if (
          existing.version !== params.expectedVersion ||
          !params.allowedStatuses.includes(existing.status)
        ) {
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
    updateOccupantCitizenship: jest.fn(
      async (occupantId: string, hotelId: string, citizenshipKind: any) => {
        const occ = occupants.get(occupantId);
        if (occ && occ.hotelId === hotelId) occ.citizenshipKind = citizenshipKind;
      },
    ),
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
    fetchCatalog: jest.fn(async (_kind: string, _parentCode?: string) => []),
  };
  const occupantsReadService = {
    getActiveStayOccupants: jest.fn(async (hotelId: string) =>
      [...occupants.values()].filter((o) => o.hotelId === hotelId),
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
    const stored = rows.get("hotel-1");
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

  it("keeps GET passive, preserves credentials on failed manual check and re-logins after restart", async () => {
    const { service, provider, rows, access, repository, cipher } = fixture();
    await service.connect("owner", "owner-role", "hotel-1", credentials);
    const ciphertext = rows.get("hotel-1")!.ciphertext;
    provider.login.mockClear();
    await service.get("owner", "owner-role", "hotel-1");
    expect(provider.login).not.toHaveBeenCalled();
    provider.login.mockRejectedValueOnce(new Error(credentials.password));
    await expect(service.check("owner", "owner-role", "hotel-1")).rejects.toMatchObject({
      response: { code: "KBTT_AUTH_FAILED" },
    });
    expect(rows.get("hotel-1")).toMatchObject({ ciphertext, status: "AUTH_FAILED" });
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
});

describe("KBTT Phase 1 declaration ledger and API contract", () => {
  const primaryOccupant = {
    id: "occ-1",
    occupantId: "occ-1",
    stayId: "stay-1",
    hotelId: "hotel-1",
    roomId: "room-1",
    roomNumber: "101",
    isPrimary: true,
    fullName: "Nguyen Van A",
    phone: "0901234567",
    identityNumber: "001090012345",
    dateOfBirth: "1990-01-01",
    gender: "M",
    nationality: "Viet Nam",
    residencePlace: "Ha Noi",
    citizenshipKind: null,
    stayStatus: "ACTIVE",
    reservationCode: "RES-101",
    plannedCheckInAt: new Date("2026-09-13T07:00:00.000Z"),
    plannedCheckOutAt: new Date("2026-09-15T05:00:00.000Z"),
    checkedInAt: new Date("2026-09-13T07:00:00.000Z"),
    stay: {
      id: "stay-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      room: { id: "room-1", roomNumber: "101" },
      plannedCheckInAt: new Date("2026-09-13T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-09-15T05:00:00.000Z"),
      checkedInAt: new Date("2026-09-13T07:00:00.000Z"),
    },
  };

  const coGuestOccupant = {
    id: "occ-2",
    occupantId: "occ-2",
    stayId: "stay-1",
    hotelId: "hotel-1",
    roomId: "room-1",
    roomNumber: "101",
    isPrimary: false,
    fullName: "Smith John",
    phone: null,
    identityNumber: "P98765432",
    dateOfBirth: "1985-05-20",
    gender: "M",
    nationality: "USA",
    residencePlace: null,
    citizenshipKind: "FOREIGN",
    stayStatus: "ACTIVE",
    reservationCode: "RES-101",
    plannedCheckInAt: new Date("2026-09-13T07:00:00.000Z"),
    plannedCheckOutAt: new Date("2026-09-15T05:00:00.000Z"),
    checkedInAt: new Date("2026-09-13T07:00:00.000Z"),
    stay: {
      id: "stay-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      room: { id: "room-1", roomNumber: "101" },
      plannedCheckInAt: new Date("2026-09-13T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-09-15T05:00:00.000Z"),
      checkedInAt: new Date("2026-09-13T07:00:00.000Z"),
    },
  };

  it("combines active stay occupants with declaration rows, deriving MISSING_PROFILE for legacy/unclassified occupants", async () => {
    const { service, occupants, declarations, provider } = fixture();
    occupants.set("occ-1", primaryOccupant);
    occupants.set("occ-2", coGuestOccupant);

    declarations.set("decl-2", {
      id: "decl-2",
      hotelId: "hotel-1",
      stayId: "stay-1",
      occupantId: "occ-2",
      declarationKind: "FOREIGN",
      revision: 1,
      status: "READY",
      draftPayloadJson: { hoTen: "Smith John", quocTich: "USA", soHoChieu: "P98765432" },
      submittedPayloadJson: null,
      submittedPayloadFingerprint: null,
      providerCode: null,
      providerMessage: null,
      providerResponseJson: null,
      submittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const list = await service.listDeclarations("frontdesk-1", "role-frontdesk", "hotel-1");

    expect(list).toHaveLength(2);
    const row1 = list.find((item) => item.occupantId === "occ-1")!;
    expect(row1).toBeDefined();
    expect(row1.fullName).toBe("Nguyen Van A");
    expect(row1.isPrimary).toBe(true);
    expect(row1.derivedStatus).toBe("MISSING_PROFILE");
    expect(row1.declaration).toBeNull();

    const row2 = list.find((item) => item.occupantId === "occ-2")!;
    expect(row2).toBeDefined();
    expect(row2.fullName).toBe("Smith John");
    expect(row2.isPrimary).toBe(false);
    expect(row2.derivedStatus).toBe("READY");
    expect(row2.declaration?.status).toBe("READY");

    expect(provider.login).not.toHaveBeenCalled();
    expect(provider.refresh).not.toHaveBeenCalled();
  });

  it("strictly enforces hotel isolation on declaration access and mutations", async () => {
    const { service, access, occupants } = fixture();
    occupants.set("occ-1", primaryOccupant);

    access.assertHotelAccess.mockRejectedValueOnce(new Error("Hotel access denied"));
    await expect(
      service.listDeclarations("user-1", "role-1", "hotel-foreign"),
    ).rejects.toThrow("Hotel access denied");

    access.assertHotelAccess.mockRejectedValueOnce(new Error("Hotel access denied"));
    await expect(
      service.getDeclaration("user-1", "role-1", "hotel-foreign", "occ-1"),
    ).rejects.toThrow("Hotel access denied");

    access.assertHotelAccess.mockRejectedValueOnce(new Error("Hotel access denied"));
    await expect(
      service.saveDraft("user-1", "role-1", "hotel-foreign", "occ-1", {
        citizenshipKind: "VIETNAMESE",
        data: {},
      }),
    ).rejects.toThrow("Hotel access denied");

    access.assertHotelAccess.mockRejectedValueOnce(new Error("Hotel access denied"));
    await expect(
      service.markReady("user-1", "role-1", "hotel-foreign", "occ-1"),
    ).rejects.toThrow("Hotel access denied");

    await expect(
      service.getDeclaration("user-1", "role-1", "hotel-1", "non-existent-occupant"),
    ).rejects.toThrow();
  });

  it("creates and updates Vietnamese draft, rebuilding server-side from occupant and stay data", async () => {
    const { service, occupants, declarations } = fixture();
    occupants.set("occ-1", { ...primaryOccupant });

    const draft = await service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
      citizenshipKind: "VIETNAMESE",
      data: {
        lyDoCuTru: 1,
        loaiGiayTo: 1,
        soGiayTo: "001090012345",
      },
    });

    expect(draft).toMatchObject({
      hotelId: "hotel-1",
      occupantId: "occ-1",
      declarationKind: "VIETNAMESE",
      status: "DRAFT",
      revision: 1,
    });
    expect(draft.draftPayload).toMatchObject({
      hoTen: "Nguyen Van A",
      soPhong: "101",
      gioiTinh: "M",
      ngayThangNamSinhStr: "1990-01-01",
      soGiayTo: "001090012345",
      loaiGiayTo: 1,
      lyDoCuTru: 1,
    });
    expect(occupants.get("occ-1").citizenshipKind).toBe("VIETNAMESE");

    const updated = await service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
      citizenshipKind: "VIETNAMESE",
      data: {
        lyDoCuTru: 2,
        loaiGiayTo: 1,
        soGiayTo: "001090012345",
        diaChi: "456 Tran Phu, Da Nang",
      },
    });
    expect(updated.draftPayload).toMatchObject({
      lyDoCuTru: 2,
      diaChi: "456 Tran Phu, Da Nang",
    });
    expect(declarations.size).toBe(1);
  });

  it("strictly rejects incompatible and forbidden client fields in draft payloads", async () => {
    const { service, occupants } = fixture();
    occupants.set("occ-1", { ...primaryOccupant });

    await expect(
      service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
        citizenshipKind: "VIETNAMESE",
        data: {
          quocTich: "USA",
          thoiHanTamTruStr: "2026-09-15 12:00:00",
        },
      }),
    ).rejects.toThrow();

    await expect(
      service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
        citizenshipKind: "FOREIGN",
        data: {
          lyDoCuTru: 1,
          loaiGiayTo: 1,
        },
      }),
    ).rejects.toThrow();

    for (const forbidden of [
      { AccessToken: "secret" },
      { RefreshToken: "secret" },
      { password: "plain" },
      { status: "SUBMITTED" },
      { providerCode: "200" },
      { submittedAt: new Date().toISOString() },
    ]) {
      await expect(
        service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
          citizenshipKind: "VIETNAMESE",
          ...forbidden,
        }),
      ).rejects.toThrow();
    }
  });

  it("prevents mutation of SUBMITTED or SENDING declarations through draft APIs", async () => {
    const { service, occupants, declarations } = fixture();
    occupants.set("occ-1", { ...primaryOccupant });

    declarations.set("decl-submitted", {
      id: "decl-submitted",
      hotelId: "hotel-1",
      stayId: "stay-1",
      occupantId: "occ-1",
      declarationKind: "VIETNAMESE",
      revision: 1,
      status: "SUBMITTED",
      draftPayloadJson: {},
      submittedPayloadJson: { hoTen: "Nguyen Van A" },
      submittedPayloadFingerprint: "fingerprint123",
      providerCode: "200",
      providerMessage: "Thanh cong",
      providerResponseJson: {},
      submittedAt: new Date(),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
        citizenshipKind: "VIETNAMESE",
        data: { hoTen: "Hacked Name" },
      }),
    ).rejects.toThrow("SUBMITTED");

    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-1")).rejects.toThrow();

    declarations.get("decl-submitted").status = "SENDING";
    await expect(
      service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
        citizenshipKind: "VIETNAMESE",
        data: { hoTen: "Hacked Name" },
      }),
    ).rejects.toThrow("SENDING");

    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-1")).rejects.toThrow();
  });

  it("transitions draft to READY only when all required fields are complete and valid according to provider rules", async () => {
    const { service, occupants } = fixture();
    occupants.set("occ-1", { ...primaryOccupant });
    occupants.set("occ-2", { ...coGuestOccupant });

    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1 },
    });
    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-1")).rejects.toThrow(
      "chưa đủ điều kiện READY",
    );

    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
      citizenshipKind: "VIETNAMESE",
      data: {
        lyDoCuTru: 1,
        loaiGiayTo: 1,
        soGiayTo: "12345",
      },
    });
    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-1")).rejects.toThrow(
      "CCCD / Căn Cước phải có đúng 12 chữ số",
    );

    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
      citizenshipKind: "VIETNAMESE",
      data: {
        lyDoCuTru: 20,
        loaiGiayTo: 1,
        soGiayTo: "001090012345",
      },
    });
    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-1")).rejects.toThrow(
      "Lý do chi tiết là bắt buộc",
    );

    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
      citizenshipKind: "VIETNAMESE",
      data: {
        lyDoCuTru: 20,
        lyDoChiTiet: "Tham gia hội nghị quốc tế",
        loaiGiayTo: 1,
        soGiayTo: "001090012345",
      },
    });
    const readyVn = await service.markReady("user-1", "role-1", "hotel-1", "occ-1");
    expect(readyVn.status).toBe("READY");

    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-2", {
      citizenshipKind: "FOREIGN",
      data: {
        quocTich: "USA",
        soHoChieu: "P98765432",
        loaiNgayThangNamSinh: "D",
      },
    });
    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-2")).rejects.toThrow(
      "Thời hạn tạm trú",
    );

    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-2", {
      citizenshipKind: "FOREIGN",
      data: {
        quocTich: "USA",
        soHoChieu: "P98765432",
        loaiNgayThangNamSinh: "D",
        thoiHanTamTruStr: "2026-09-15 05:00:00",
      },
    });
    const readyForeign = await service.markReady("user-1", "role-1", "hotel-1", "occ-2");
    expect(readyForeign.status).toBe("READY");
  });

  it("verifies permissions registry splits declaration permissions from connection management", () => {
    expect(isBusinessPermissionKey("hotel.kbtt.declarations.view")).toBe(true);
    expect(isBusinessPermissionKey("hotel.kbtt.declarations.manage")).toBe(true);
    expect(isBusinessPermissionKey("hotel.kbtt.view")).toBe(true);
    expect(isBusinessPermissionKey("hotel.kbtt.manage")).toBe(true);

    const declView = BUSINESS_PERMISSIONS.find((p) => p.key === "hotel.kbtt.declarations.view");
    expect(declView?.risk).toBe("LOW");

    const declManage = BUSINESS_PERMISSIONS.find(
      (p) => p.key === "hotel.kbtt.declarations.manage",
    );
    expect(declManage?.risk).toBe("HIGH");
  });

  it("enforces CAS concurrency and deterministic uniqueness conflict handling", async () => {
    const { service, occupants, declarations, repository } = fixture();
    occupants.set("occ-1", { ...primaryOccupant });

    // 1. Initial draft creation
    const draft = await service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1 },
    });
    expect(draft.version).toBe(1);

    // 2. Uniqueness race condition on first draft: repository throws ConflictException
    const declId = draft.id;
    await expect(
      repository.createDeclaration({
        hotelId: "hotel-1",
        stayId: "stay-1",
        occupantId: "occ-1",
        declarationKind: "VIETNAMESE",
        revision: 1,
        status: "DRAFT",
        draftPayloadJson: {},
      }),
    ).rejects.toThrow(ConflictException);

    // 3. CAS conflict: simulate stale expectedVersion during update
    const staleVersion = 999;
    await expect(
      repository.updateDeclaration({
        id: declId,
        hotelId: "hotel-1",
        expectedVersion: staleVersion,
        allowedStatuses: ["DRAFT", "READY", "FAILED"],
        data: { status: "READY" },
      }),
    ).rejects.toThrow(ConflictException);

    // 4. CAS conflict: status not in allowed list
    declarations.get(declId).status = "SUBMITTED";
    await expect(
      repository.updateDeclaration({
        id: declId,
        hotelId: "hotel-1",
        expectedVersion: 1,
        allowedStatuses: ["DRAFT", "READY", "FAILED"],
        data: { status: "READY" },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("blocks UNKNOWN and CANCELLED statuses from draft editing and ready transition", async () => {
    const { service, occupants, declarations } = fixture();
    occupants.set("occ-1", { ...primaryOccupant });

    declarations.set("decl-unknown", {
      id: "decl-unknown",
      hotelId: "hotel-1",
      stayId: "stay-1",
      occupantId: "occ-1",
      declarationKind: "VIETNAMESE",
      revision: 1,
      status: "UNKNOWN",
      draftPayloadJson: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
        citizenshipKind: "VIETNAMESE",
        data: { hoTen: "Test" },
      }),
    ).rejects.toThrow("UNKNOWN");

    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-1")).rejects.toThrow(
      "UNKNOWN",
    );

    declarations.get("decl-unknown").status = "CANCELLED";
    await expect(
      service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
        citizenshipKind: "VIETNAMESE",
        data: { hoTen: "Test" },
      }),
    ).rejects.toThrow("CANCELLED");

    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-1")).rejects.toThrow(
      "CANCELLED",
    );
  });

  it("sanitizes list and detail responses, never leaking raw payloads, fingerprints, tokens, or credentials", async () => {
    const { service, occupants, declarations } = fixture();
    occupants.set("occ-1", { ...primaryOccupant });

    declarations.set("decl-1", {
      id: "decl-1",
      hotelId: "hotel-1",
      stayId: "stay-1",
      occupantId: "occ-1",
      declarationKind: "VIETNAMESE",
      revision: 1,
      status: "READY",
      draftPayloadJson: { hoTen: "Nguyen Van A", soPhong: "101" },
      submittedPayloadJson: { rawPayload: "secret-payload-data" },
      submittedPayloadFingerprint: "fingerprint-xyz-123",
      providerCode: "200",
      providerMessage: "OK",
      providerResponseJson: { rawResponse: "secret-provider-response" },
      submittedAt: new Date(),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // List response check
    const list = await service.listDeclarations("user-1", "role-1", "hotel-1");
    expect(list).toHaveLength(1);
    const declSummary = list[0].declaration as any;
    expect(declSummary).toBeDefined();
    expect(declSummary.draftPayload).toBeUndefined();
    expect(declSummary.submittedPayload).toBeUndefined();
    expect(declSummary.providerResponseJson).toBeUndefined();
    expect(declSummary.submittedPayloadFingerprint).toBeUndefined();
    expect(declSummary.id).toBe("decl-1");
    expect(declSummary.status).toBe("READY");

    // Detail response check
    const detail = await service.getDeclaration("user-1", "role-1", "hotel-1", "occ-1");
    const detailDecl = detail.declaration as any;
    expect(detailDecl).toBeDefined();
    expect(detailDecl.draftPayload).toEqual({ hoTen: "Nguyen Van A", soPhong: "101" });
    expect(detailDecl.submittedPayload).toBeUndefined();
    expect(detailDecl.providerResponseJson).toBeUndefined();
    expect(detailDecl.submittedPayloadFingerprint).toBeUndefined();
  });

  it("preserves occupant identity without silently stripping characters, leaving non-conforming IDs for manual operator correction", async () => {
    const { service, occupants } = fixture();

    // Occupant with non-conforming identityNumber containing hyphens and spaces
    occupants.set("occ-dirty", {
      ...primaryOccupant,
      id: "occ-dirty",
      identityNumber: "001-090 012345",
    });

    const draftVn = await service.saveDraft("user-1", "role-1", "hotel-1", "occ-dirty", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1 },
    });
    // Characters must NOT be stripped to "001090012345"
    expect(draftVn.draftPayload.soGiayTo).toBeUndefined();

    // Occupant with valid conforming identityNumber
    occupants.set("occ-clean", {
      ...primaryOccupant,
      id: "occ-clean",
      identityNumber: "001090012345",
    });
    const draftVnClean = await service.saveDraft("user-1", "role-1", "hotel-1", "occ-clean", {
      citizenshipKind: "VIETNAMESE",
      data: { lyDoCuTru: 1 },
    });
    expect(draftVnClean.draftPayload.soGiayTo).toBe("001090012345");

    // Foreign occupant with spaces in passport
    occupants.set("occ-foreign-dirty", {
      ...coGuestOccupant,
      id: "occ-foreign-dirty",
      identityNumber: "P 987 654",
    });
    const draftForeignDirty = await service.saveDraft(
      "user-1",
      "role-1",
      "hotel-1",
      "occ-foreign-dirty",
      {
        citizenshipKind: "FOREIGN",
        data: { quocTich: "USA" },
      },
    );
    expect(draftForeignDirty.draftPayload.soHoChieu).toBeUndefined();
  });

  it("hardens READY validation with room number requirement, calendar date/time checks, departure/arrival ordering, and foreign deadline/birthday rules", async () => {
    const { service, occupants } = fixture();
    occupants.set("occ-1", { ...primaryOccupant });

    // 1. Missing soPhong must be rejected for READY
    const occNoRoom = {
      ...primaryOccupant,
      id: "occ-no-room",
      stay: { ...primaryOccupant.stay, room: null },
    };
    occupants.set("occ-no-room", occNoRoom);
    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-no-room", {
      citizenshipKind: "VIETNAMESE",
      data: {
        lyDoCuTru: 1,
        loaiGiayTo: 1,
        soGiayTo: "001090012345",
      },
    });
    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-no-room")).rejects.toThrow(
      "Số phòng là bắt buộc",
    );

    // 2. Non-leap-year February 29 invalid calendar date rejected
    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
      citizenshipKind: "VIETNAMESE",
      data: {
        ngayThangNamSinhStr: "2023-02-29",
        soPhong: "101",
        lyDoCuTru: 1,
        loaiGiayTo: 1,
        soGiayTo: "001090012345",
      },
    });
    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-1")).rejects.toThrow(
      "Ngày sinh không phải là ngày lịch hợp lệ",
    );

    // 3. Departure before arrival rejected
    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-1", {
      citizenshipKind: "VIETNAMESE",
      data: {
        ngayThangNamSinhStr: "1990-01-01",
        ngayDenCsltStr: "2026-09-15 14:00:00",
        ngayDiDuKienStr: "2026-09-14 12:00:00",
        soPhong: "101",
        lyDoCuTru: 1,
        loaiGiayTo: 1,
        soGiayTo: "001090012345",
      },
    });
    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-1")).rejects.toThrow(
      "Ngày đi dự kiến phải lớn hơn hoặc bằng ngày đến",
    );

    // 4. Foreign loaiNgayThangNamSinh = "Y" requires YYYY-01-01
    occupants.set("occ-2", { ...coGuestOccupant });
    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-2", {
      citizenshipKind: "FOREIGN",
      data: {
        quocTich: "204", // Arbitrary provider code accepted
        soHoChieu: "P98765432",
        soPhong: "101",
        loaiNgayThangNamSinh: "Y",
        ngayThangNamSinhStr: "1985-06-20", // Not YYYY-01-01
        thoiHanTamTruStr: "2026-09-16 12:00:00",
      },
    });
    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-2")).rejects.toThrow(
      "định dạng YYYY-01-01",
    );

    // Valid YYYY-01-01 passes
    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-2", {
      citizenshipKind: "FOREIGN",
      data: {
        quocTich: "204",
        soHoChieu: "P98765432",
        soPhong: "101",
        loaiNgayThangNamSinh: "Y",
        ngayThangNamSinhStr: "1985-01-01",
        thoiHanTamTruStr: "2026-09-16 12:00:00",
      },
    });
    const readyForeign = await service.markReady("user-1", "role-1", "hotel-1", "occ-2");
    expect(readyForeign.status).toBe("READY");

    // 5. Foreign temporary deadline before arrival rejected
    await service.saveDraft("user-1", "role-1", "hotel-1", "occ-2", {
      citizenshipKind: "FOREIGN",
      data: {
        quocTich: "204",
        soHoChieu: "P98765432",
        soPhong: "101",
        loaiNgayThangNamSinh: "Y",
        ngayThangNamSinhStr: "1985-01-01",
        ngayDenCsltStr: "2026-09-13 14:00:00",
        thoiHanTamTruStr: "2026-09-12 12:00:00",
      },
    });
    await expect(service.markReady("user-1", "role-1", "hotel-1", "occ-2")).rejects.toThrow(
      "Thời hạn tạm trú không được trước ngày",
    );
  });

  it("bounds list query with pagination, slicing active occupants and querying only declaration rows for the slice", async () => {
    const { service, occupants, repository } = fixture();
    occupants.set("occ-1", { ...primaryOccupant, id: "occ-1" });
    occupants.set("occ-2", { ...primaryOccupant, id: "occ-2" });
    occupants.set("occ-3", { ...primaryOccupant, id: "occ-3" });

    // Page 1, limit 2
    const page1 = await service.listDeclarations("user-1", "role-1", "hotel-1", {
      page: 1,
      limit: 2,
    });
    expect(page1).toHaveLength(2);
    expect(page1[0].occupantId).toBe("occ-1");
    expect(page1[1].occupantId).toBe("occ-2");
    expect(repository.findDeclarationsByHotel).toHaveBeenCalledWith("hotel-1", ["occ-1", "occ-2"]);

    // Page 2, limit 2
    const page2 = await service.listDeclarations("user-1", "role-1", "hotel-1", {
      page: 2,
      limit: 2,
    });
    expect(page2).toHaveLength(1);
    expect(page2[0].occupantId).toBe("occ-3");
    expect(repository.findDeclarationsByHotel).toHaveBeenCalledWith("hotel-1", ["occ-3"]);
  });

  it("preserves whitespace in credential password without trimming", () => {
    const parsed = kbttCredentialsSchema.parse({
      username: "user123",
      password: "  secret pass with leading and trailing spaces  ",
    });
    expect(parsed.password).toBe("  secret pass with leading and trailing spaces  ");
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

    const nationalities = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", {});
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

    const provinces = await f.service.listCatalog("user-1", "role-1", "hotel-1", "PROVINCE", {});
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
      { maPhuongXa: "10101", tenPhuongXa: "Phúc Xá", tenPhuongXaEn: "Phuc Xa", trucThuocTinh: "101" },
    ]);
    const wardSync = await f.service.syncCatalog("user-1", "role-1", "hotel-1", "WARD", { provinceCode: "101" });
    expect(wardSync.kind).toBe("WARD");
    expect(wardSync.parentCode).toBe("101");
    expect(wardSync.totalFetched).toBe(1);

    const wards = await f.service.listCatalog("user-1", "role-1", "hotel-1", "WARD", { parentCode: "101" });
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

    const reasons = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", {});
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

    const docs = await f.service.listCatalog("user-1", "role-1", "hotel-1", "DOCUMENT_TYPE", {});
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
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { id: 1, name: "Khách sạn" },
    ]);
    const placeSync = await f.service.syncCatalog("user-1", "role-1", "hotel-1", "RESIDENCE_PLACE");
    expect(placeSync.kind).toBe("RESIDENCE_PLACE");
    expect(placeSync.totalFetched).toBe(1);

    const places = await f.service.listCatalog("user-1", "role-1", "hotel-1", "RESIDENCE_PLACE", {});
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
    expect(await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", {})).toHaveLength(2);

    // 1. Network / provider failure
    f.provider.fetchCatalog.mockRejectedValueOnce(
      new HttpException({ code: "KBTT_PROVIDER_UNAVAILABLE", message: "Network failure" }, 502),
    );
    await expect(
      f.service.syncCatalog("user-1", "role-1", "hotel-1", "NATIONALITY"),
    ).rejects.toThrow();

    // Existing rows remain intact
    let cached = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", {});
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
    cached = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", {});
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
    const firstList = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", {});
    expect(firstList).toHaveLength(2);

    // Second sync: B and C (A is missing)
    f.provider.fetchCatalog.mockResolvedValueOnce([
      { id: 20, name: "Lý do 20 (Cập nhật)" },
      { id: 30, name: "Lý do 30" },
    ]);
    await f.service.syncCatalog("user-1", "role-1", "hotel-1", "STAY_REASON");

    // Active by default: returns 20 and 30
    const activeList = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", {});
    expect(activeList).toHaveLength(2);
    expect(activeList.map((i) => i.code).sort()).toEqual(["20", "30"]);
    expect(activeList.find((i) => i.code === "20")?.nameVi).toBe("Lý do 20 (Cập nhật)");

    // includeInactive: returns 10, 20, and 30
    const allList = await f.service.listCatalog("user-1", "role-1", "hotel-1", "STAY_REASON", {
      includeInactive: true,
    });
    expect(allList).toHaveLength(3);
    const item10 = allList.find((i) => i.code === "10");
    expect(item10).toBeDefined();
    expect(item10?.isActive).toBe(false);
  });

  it("enforces ward parent relations: requires province code on sync and scopes queries", async () => {
    const f = fixture();

    // Sync without province code must fail
    await expect(
      f.service.syncCatalog("user-1", "role-1", "hotel-1", "WARD", {}),
    ).rejects.toThrow(BadRequestException);
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
    const wards101 = await f.service.listCatalog("user-1", "role-1", "hotel-1", "WARD", { parentCode: "101" });
    expect(wards101).toHaveLength(2);
    expect(wards101.every((w) => w.parentCode === "101" && w.isActive)).toBe(true);

    const wards202 = await f.service.listCatalog("user-1", "role-1", "hotel-1", "WARD", { parentCode: "202" });
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
      { kind: "WARD", parentCode: "101", expectedPath: "/cms-backend/public/dm-phuong-xa?trucThuocTinh=101" },
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
    fetchMock.mockResolvedValueOnce(Response.json({ code: "400", message: "Internal business error", data: null }));
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
    const list = await f.service.listCatalog("user-1", "role-1", "hotel-1", "NATIONALITY", {});
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

    const items = await f.service.listCatalog("user-1", "role-1", "hotel-1", "DOCUMENT_TYPE", { limit: 2 });
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

    f.provider.fetchCatalog.mockResolvedValueOnce([
      { id: 1, name: "Thẻ CCCD" },
    ]);

    // Test controller syncCatalog and syncCatalogByBody
    const syncRes1 = await controller.syncCatalog(req, "hotel-1", "DOCUMENT_TYPE");
    expect(syncRes1.kind).toBe("DOCUMENT_TYPE");

    f.provider.fetchCatalog.mockResolvedValueOnce([
      { id: 1, name: "Du lịch" },
    ]);
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
