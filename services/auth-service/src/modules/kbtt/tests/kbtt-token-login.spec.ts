import { KbttProviderClient } from "../infrastructure/kbtt-provider.client";

describe("KBTT token acquisition transport", () => {
  const savedEnv = { ...process.env };
  const savedFetch = global.fetch;
  let client: KbttProviderClient;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    process.env.KBTT_BASE_URL = "https://bca.invalid";
    process.env.KBTT_LOGIN_BASIC_AUTH_VALUE = Buffer.from("fixture-login").toString("base64");
    process.env.KBTT_TOKEN_BASIC_AUTH_VALUE = Buffer.from("fixture-other").toString("base64");
    process.env.KBTT_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    client = new KbttProviderClient();
  });
  afterEach(() => { process.env = { ...savedEnv }; global.fetch = savedFetch; });

  it.each([401, 403])("makes token HTTP %i terminal authentication failure", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(client.login({ username: "fixture", password: "fixture" })).rejects.toMatchObject({
      response: { code: "KBTT_AUTH_FAILED" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500, 503])("keeps token HTTP %i distinct from credential rejection", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(client.login({ username: "fixture", password: "fixture" })).rejects.toMatchObject({
      response: { code: "KBTT_PROVIDER_UNAVAILABLE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not call the provider after a cancelled logout/recovery", async () => {
    const controller = new AbortController();
    controller.abort(new Error("recovery cancelled"));
    await expect(client.login({ username: "fixture", password: "fixture" }, controller.signal)).rejects.toBe(controller.signal.reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["429", "500", "503"])("keeps provider code %s distinct from invalid credentials under HTTP 200", async (code) => {
    fetchMock.mockResolvedValue(Response.json({ code, data: null }));
    await expect(client.login({ username: "fixture", password: "fixture" })).rejects.toMatchObject({
      response: { code: "KBTT_PROVIDER_UNAVAILABLE" },
    });
  });
  it("settles a stalled fetch on caller abort without waiting for the provider", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const result = client.login({ username: "fixture", password: "fixture" }, controller.signal);
    const rejected = expect(result).rejects.toBeInstanceOf(Error);
    controller.abort(new Error("logout"));
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("cancels a stalled token response body and releases its reader", async () => {
    const controller = new AbortController();
    const cancel = jest.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 200 }));
    const result = client.login({ username: "fixture", password: "fixture" }, controller.signal);
    const rejected = expect(result).rejects.toBeInstanceOf(Error);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    controller.abort(new Error("logout"));
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
