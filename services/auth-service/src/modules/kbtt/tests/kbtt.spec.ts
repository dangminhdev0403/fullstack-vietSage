import { randomBytes } from "node:crypto";
import type { KbttHotelConnection } from "@prisma/client";
import { KbttService } from "../application/kbtt.service";
import type { KbttSession } from "../domain/schemas/kbtt.schema";
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
  };
  const access = { assertHotelAccess: jest.fn().mockResolvedValue({ id: "hotel-1" }) };
  const cipher = new KbttCredentialCipher();
  const provider = {
    login: jest.fn(async () => session()),
    refresh: jest.fn(async () => session()),
    revoke: jest.fn(async () => undefined),
  };
  const service = new KbttService(access as never, repository as never, cipher, provider as never);
  return { rows, repository, access, cipher, provider, service };
}

beforeEach(() => {
  process.env.KBTT_BASIC_AUTH_VALUE = randomBytes(24).toString("base64");
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
    expect(() => loadKbttConfig({ KBTT_BASIC_AUTH_VALUE: "invalid" })).toThrow(
      "Invalid KBTT configuration",
    );
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
    expect(url.href).toBe("https://api-tbltkbtt.bocongan.gov.vn/authorization-service/oauth/token");
    expect(options).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { Authorization: "Basic " + process.env.KBTT_BASIC_AUTH_VALUE },
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(options.body as URLSearchParams)).toEqual({
      ...credentials,
      "grant-type": "api_cslt",
    });
    await provider.refresh("fixture&refresh+value");
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
      await expect(provider.login(credentials)).rejects.toMatchObject({
        response: { code: "KBTT_AUTH_FAILED" },
      });
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
