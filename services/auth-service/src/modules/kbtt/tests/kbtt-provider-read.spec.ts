import { providerReadFixtures } from "./fixtures/kbtt-provider-read.fixtures";
import { KbttProviderReadClient, KbttProviderReadError } from "../infrastructure/kbtt-provider-read.client";

describe("KbttProviderReadClient GET-only boundary", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  let client: KbttProviderReadClient;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    process.env.KBTT_BASE_URL = "https://bca.invalid";
    process.env.KBTT_LOGIN_BASIC_AUTH_VALUE = Buffer.from("test").toString("base64");
    process.env.KBTT_TOKEN_BASIC_AUTH_VALUE = Buffer.from("test").toString("base64");
    process.env.KBTT_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    fetchMock = jest.fn(async (url: URL) => {
      const path = url.pathname;
      const data = path.endsWith("/get-all-by-cslt") ? providerReadFixtures.residentPage
        : path === "/client-service/kbtt-vn/ls-khai-bao" ? providerReadFixtures.vietnameseHistoryPage
        : path === "/client-service/kbtt/ls-khai-bao" ? providerReadFixtures.foreignHistoryPage
        : path.includes("/tra-cuu-nvn") ? providerReadFixtures.vietnameseLookup
        : path.includes("/tra-cuu-nnn") ? null
        : path === "/client-service/cslt/of-user" ? providerReadFixtures.accommodation
        : path === "/user-service/user/get-user-info" ? providerReadFixtures.currentUser
        : path.startsWith("/client-service/kbtt-vn/") ? providerReadFixtures.vietnameseDetail
        : providerReadFixtures.foreignDetail;
      return Response.json({ code: "200", data, message: "ok", extra: true });
    });
    global.fetch = fetchMock;
    client = new KbttProviderReadClient();
  });
  afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv }; });

  it("uses all ten exact collection paths exclusively as GET, with caller bearer and no request body", async () => {
    const cases: Array<[() => Promise<unknown>, string]> = [
      [() => client.listResidents("VIETNAMESE", {}, "token"), "/client-service/kbtt-vn/get-all-by-cslt?search=&soPhong=&page=0&size=50"],
      [() => client.listResidents("FOREIGN", {}, "token"), "/client-service/kbtt/get-all-by-cslt?search=&soPhong=&page=0&size=50"],
      [() => client.getResident("VIETNAMESE", "id 1", "token"), "/client-service/kbtt-vn/id%201"],
      [() => client.getResident("FOREIGN", "id 1", "token"), "/client-service/kbtt/id%201"],
      [() => client.lookupVietnamese("00123", "token"), "/client-service/kbtt-vn/tra-cuu-nvn?soGiayTo=00123"],
      [() => client.lookupForeign("A+1", "token"), "/client-service/kbtt/tra-cuu-nnn?soHoChieu=A%2B1"],
      [() => client.listDeclarationHistory("VIETNAMESE", "token"), "/client-service/kbtt-vn/ls-khai-bao"],
      [() => client.listDeclarationHistory("FOREIGN", "token"), "/client-service/kbtt/ls-khai-bao"],
      [() => client.getAccommodation("token"), "/client-service/cslt/of-user"],
      [() => client.getCurrentUser("token"), "/user-service/user/get-user-info"],
    ];
    for (const [call, expected] of cases) {
      await call();
      const [url, options] = fetchMock.mock.calls.at(-1)!;
      expect(url.pathname + url.search).toBe(expected);
      expect(options).toMatchObject({ method: "GET", redirect: "error", headers: { Authorization: "Bearer token" } });
      expect(options.body).toBeUndefined();
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
  it("preserves raw data, unknown envelope fields and numeric success code", async () => {
    const envelope = { code: 200, data: { unexpected: [1, null] }, debug: "kept" };
    fetchMock.mockResolvedValueOnce(Response.json(envelope));
    expect(await client.lookupForeign("TESTP0001", "token")).toEqual({ httpStatus: 200, envelope, data: envelope.data });
  });
  it("encodes filters independently instead of injecting query parameters", async () => {
    await client.listResidents("FOREIGN", { search: "a&size=999", soPhong: "A+B", page: 2, size: 3 }, "token");
    const url = fetchMock.mock.calls[0][0] as URL;
    expect([...url.searchParams.entries()]).toEqual([["search", "a&size=999"], ["soPhong", "A+B"], ["page", "2"], ["size", "3"]]);
  });
  it("preserves HTTP 200 business errors, including original code/message/body", async () => {
    const body = { code: "E7", message: "Exact provider error", errors: ["detail"] };
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "PROVIDER", details: { httpStatus: 200, providerCode: "E7", providerMessage: body.message, rawBody: JSON.stringify(body) } });
  });
  it("never treats arbitrary JSON without a result code as success", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [], message: "unverified" }));
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "INVALID_RESPONSE", details: { providerMessage: "unverified" } });
  });
  it("requires explicit data on success and preserves null and original framed error bodies", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: 200 }));
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "INVALID_RESPONSE" });
    fetchMock.mockResolvedValueOnce(Response.json({ code: 200, data: null }));
    expect((await client.lookupVietnamese("000000000001", "token")).data).toBeNull();
    const rawBody = '\uFEFF  {"code":"E1","message":"original"}  ';
    fetchMock.mockResolvedValueOnce(new Response(rawBody));
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "PROVIDER", details: { rawBody } });
  });
  it("preserves HTTP errors and raw non-JSON response", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: 401, message: "expired" }, { status: 401 }));
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "HTTP", details: { httpStatus: 401, providerCode: 401, providerMessage: "expired" } });
    fetchMock.mockResolvedValueOnce(new Response("gateway failed", { status: 502 }));
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "HTTP", details: { httpStatus: 502, rawBody: "gateway failed" } });
    fetchMock.mockResolvedValueOnce(new Response("not JSON"));
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "INVALID_RESPONSE" });
  });
  it("bounds response bytes and classifies timeout without retrying or logging in", async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(5 * 1024 * 1024 + 1)));
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "INVALID_RESPONSE" });
    const timeout = new DOMException("timed out", "TimeoutError");
    fetchMock.mockRejectedValueOnce(timeout);
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "NETWORK", cause: timeout });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("validates identifiers, token and pagination before any fetch", async () => {
    for (const id of ["", ".", "..", "a/b", "a?x=1"]) expect(() => client.getResident("FOREIGN", id, "token")).toThrow(KbttProviderReadError);
    for (const query of [{ page: -1 }, { size: 101 }, { size: 0 }, { search: "x".repeat(121) }, { unexpected: true }]) expect(() => client.listResidents("FOREIGN", query, "token")).toThrow(KbttProviderReadError);
    await expect(client.getCurrentUser("")).rejects.toMatchObject({ kind: "VALIDATION" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reports absent configuration before network access", async () => {
    delete process.env.KBTT_BASE_URL;
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "CONFIGURATION" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects malformed endpoint data without concealing the original success envelope or body", async () => {
    const body = { code: "200", message: "Provider original message", data: { content: [], totalElements: "2" } };
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(client.listResidents("VIETNAMESE", {}, "token")).rejects.toMatchObject({
      kind: "INVALID_RESPONSE", details: { httpStatus: 200, providerCode: "200", providerMessage: body.message, rawBody: JSON.stringify(body) },
    });
    fetchMock.mockResolvedValueOnce(Response.json({ code: "200", data: null }));
    await expect(client.getCurrentUser("token")).rejects.toMatchObject({ kind: "INVALID_RESPONSE" });
  });

  it.each(["VIETNAMESE", "FOREIGN"] as const)("sends inclusive local calendar boundaries for %s history", async (kind) => {
    await client.listDeclarationHistory(kind, "token", { dateFrom: "2026-01-01", dateTo: "2026-11-16" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe(kind === "VIETNAMESE" ? "/client-service/kbtt-vn/ls-khai-bao" : "/client-service/kbtt/ls-khai-bao");
    expect([...url.searchParams.entries()]).toEqual([
      ["typeDate", "3"], ["dateFrom", "2026-01-01 00:00:00"], ["dateTo", "2026-11-16 23:59:59"],
    ]);
    expect(options.method).toBe("GET");
    expect(url.searchParams.has("date")).toBe(false);
  });
  it("accepts a single leap calendar day without converting it through UTC", async () => {
    await client.listDeclarationHistory("FOREIGN", "token", { dateFrom: "2024-02-29", dateTo: "2024-02-29" });
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get("dateFrom")).toBe("2024-02-29 00:00:00");
    expect(url.searchParams.get("dateTo")).toBe("2024-02-29 23:59:59");
  });
  it("rejects missing, invalid, timestamp and reversed calendar boundaries before GET", () => {
    for (const query of [
      { dateFrom: "2026-01-01" }, { dateTo: "2026-01-01" },
      { dateFrom: "2026-02-29", dateTo: "2026-03-01" },
      { dateFrom: "2026-02-31", dateTo: "2026-03-01" },
      { dateFrom: "2026-11-17", dateTo: "2026-11-16" },
      { dateFrom: "2026-01-01T00:00:00Z", dateTo: "2026-01-02" },
    ]) expect(() => client.listDeclarationHistory("VIETNAMESE", "token", query)).toThrow(KbttProviderReadError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends verified history keyword, arrival mode and zero-based paging without ignored document params", async () => {
    await client.listDeclarationHistory("VIETNAMESE", "token", {
      dateFrom: "2026-01-01", dateTo: "2026-01-02", typeDate: 2, keyword: "000001&A", page: 1, size: 2,
    });
    const url = fetchMock.mock.calls[0][0] as URL;
    expect([...url.searchParams.entries()]).toEqual([
      ["typeDate", "2"], ["dateFrom", "2026-01-01 00:00:00"], ["dateTo", "2026-01-02 23:59:59"],
      ["keyword", "000001&A"], ["page", "1"], ["size", "2"],
    ]);
    expect(url.searchParams.has("soGiayTo")).toBe(false);
    for (const query of [{ typeDate: 1 }, { keyword: "x".repeat(121) }, { page: -1 }, { size: 101 }, { soGiayTo: "000001" }]) {
      expect(() => client.listDeclarationHistory("VIETNAMESE", "token", query as never)).toThrow(KbttProviderReadError);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("complete bounded snapshots", () => {
    const range = { dateFrom: "2026-01-01", dateTo: "2026-01-31" };
    const response = (content: unknown[], totalElements: number) => Response.json({ code: "200", message: "ok", data: { content, totalElements } });
    const row = (kind: "VIETNAMESE" | "FOREIGN", id: string) => ({
      ...(kind === "VIETNAMESE" ? providerReadFixtures.vietnameseHistoryPage.content[0] : providerReadFixtures.foreignHistoryPage.content[0]), id,
    });
    const read = (source: "residents" | "history", kind: "VIETNAMESE" | "FOREIGN" = "VIETNAMESE") => source === "residents"
      ? client.readAllResidents(kind, "token") : client.readAllHistory(kind, "token", range);

    it.each([
      ["residents", "VIETNAMESE"], ["residents", "FOREIGN"], ["history", "VIETNAMESE"], ["history", "FOREIGN"],
    ] as const)("reads every %s page for %s and preserves complete rows", async (source, kind) => {
      const first = [row(kind, "fixture-a"), row(kind, "fixture-b")];
      const second = [{ ...row(kind, "fixture-c"), providerExtension: { retained: true } }];
      fetchMock.mockResolvedValueOnce(response(first, 3)).mockResolvedValueOnce(response(second, 3));
      expect(await read(source, kind)).toEqual([...first, ...second]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map(([url]) => [url.searchParams.get("page"), url.searchParams.get("size")])).toEqual([["0", "100"], ["1", "100"]]);
      for (const [url, options] of fetchMock.mock.calls) {
        expect(options.method).toBe("GET");
        if (source === "history") expect(url.searchParams.get("typeDate")).toBe("2");
      }
    });
    it.each(["residents", "history"] as const)("accepts a confirmed empty %s snapshot", async (source) => {
      fetchMock.mockResolvedValueOnce(response([], 0));
      expect(await read(source)).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it.each(["residents", "history"] as const)("rejects changing totals and early empty %s pages", async (source) => {
      fetchMock.mockResolvedValueOnce(response([row("VIETNAMESE", "a")], 2)).mockResolvedValueOnce(response([row("VIETNAMESE", "b")], 3));
      await expect(read(source)).rejects.toMatchObject({ kind: "INCOMPLETE" });
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(response([row("VIETNAMESE", "a")], 2)).mockResolvedValueOnce(response([], 2));
      await expect(read(source)).rejects.toMatchObject({ kind: "INCOMPLETE" });
    });
    it.each(["residents", "history"] as const)("rejects repeated %s IDs within and across pages", async (source) => {
      fetchMock.mockResolvedValueOnce(response([row("VIETNAMESE", "a"), row("VIETNAMESE", "a")], 2));
      await expect(read(source)).rejects.toMatchObject({ kind: "INCOMPLETE" });
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(response([row("VIETNAMESE", "a")], 2)).mockResolvedValueOnce(response([row("VIETNAMESE", "a")], 2));
      await expect(read(source)).rejects.toMatchObject({ kind: "INCOMPLETE" });
    });
    it.each([{}, null, { id: "" }, { id: 123 }])("rejects a resident snapshot row lacking a stable string ID: %j", async (badRow) => {
      fetchMock.mockResolvedValueOnce(response([badRow], 1));
      await expect(client.readAllResidents("FOREIGN", "token")).rejects.toMatchObject({ kind: "INCOMPLETE" });
    });
    it("rejects malformed typed history rows without returning a successful partial snapshot", async () => {
      fetchMock.mockResolvedValueOnce(response([{ id: "a" }], 1));
      await expect(client.readAllHistory("VIETNAMESE", "token", range)).rejects.toMatchObject({ kind: "INVALID_RESPONSE" });
    });
    it.each(["residents", "history"] as const)("propagates later-page %s failures and provider details without retries or reauthentication", async (source) => {
      fetchMock.mockResolvedValueOnce(response([row("VIETNAMESE", "a")], 2)).mockResolvedValueOnce(Response.json({ code: "ACCESS_DENIED", message: "Exact provider denial" }, { status: 403 }));
      await expect(read(source)).rejects.toMatchObject({ kind: "HTTP", details: { httpStatus: 403, providerCode: "ACCESS_DENIED", providerMessage: "Exact provider denial" } });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    it("enforces row totals, safe integers and the 10000-row bound before another request", async () => {
      for (const [content, total] of [ [[row("VIETNAMESE", "a"), row("VIETNAMESE", "b")], 1], [[], 10001], [[], Number.MAX_SAFE_INTEGER + 1] ] as Array<[unknown[], number]>) {
        fetchMock.mockReset().mockResolvedValueOnce(response(content, total));
        await expect(client.readAllResidents("VIETNAMESE", "token")).rejects.toMatchObject({ kind: total > Number.MAX_SAFE_INTEGER ? "INVALID_RESPONSE" : "INCOMPLETE" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      }
    });
    it("stops an undersized provider scan at 100 pages instead of silently declaring it complete", async () => {
      fetchMock.mockImplementation(async (url: URL) => response([{ id: "fixture-" + url.searchParams.get("page") }], 101));
      await expect(client.readAllResidents("FOREIGN", "token")).rejects.toMatchObject({ kind: "INCOMPLETE" });
      expect(fetchMock).toHaveBeenCalledTimes(100);
    });
    it("rejects invalid source kind and missing history bounds before network access", () => {
      expect(() => client.readAllResidents("OTHER" as never, "token")).toThrow(KbttProviderReadError);
      for (const query of [{}, { dateFrom: "2026-01-01" }, { dateFrom: "2026-02-31", dateTo: "2026-03-01" }]) {
        expect(() => client.readAllHistory("VIETNAMESE", "token", query as never)).toThrow(KbttProviderReadError);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it.each(["residents", "history"] as const)("does not fetch an already-aborted %s snapshot", async (source) => {
      const controller = new AbortController(); const cause = new DOMException("snapshot deadline", "TimeoutError");
      controller.abort(cause);
      const operation = source === "residents" ? client.readAllResidents("VIETNAMESE", "token", controller.signal)
        : client.readAllHistory("FOREIGN", "token", range, controller.signal);
      await expect(operation).rejects.toMatchObject({ kind: "NETWORK", cause });
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it("stops before a second page when the shared snapshot deadline aborts between pages", async () => {
      const controller = new AbortController(); const cause = new DOMException("snapshot deadline", "TimeoutError");
      const list = jest.spyOn(client, "listResidents").mockImplementationOnce(async (_kind, _query, _token, signal) => {
        expect(signal).toBe(controller.signal);
        controller.abort(cause);
        return { httpStatus: 200, envelope: { code: "200" }, data: { content: [{ id: "first-page" }], totalElements: 2 } };
      });
      await expect(client.readAllResidents("VIETNAMESE", "token", controller.signal)).rejects.toMatchObject({ kind: "NETWORK", cause });
      expect(list).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it("combines the caller deadline with the transport timeout and preserves its abort reason", async () => {
      const controller = new AbortController(); const cause = new DOMException("snapshot deadline", "TimeoutError");
      fetchMock.mockImplementationOnce(async (_url: URL, options: RequestInit) => {
        expect(options.signal).not.toBe(controller.signal);
        controller.abort(cause);
        expect(options.signal?.aborted).toBe(true);
        throw options.signal?.reason;
      });
      await expect(client.readAllHistory("FOREIGN", "token", range, controller.signal)).rejects.toMatchObject({ kind: "NETWORK", cause });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

  });

});
