import { KbttProviderClient } from "../infrastructure/kbtt-provider.client";

describe("KBTT revoke retry", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  let client: KbttProviderClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.KBTT_BASE_URL = "https://bca.invalid";
    process.env.KBTT_LOGIN_BASIC_AUTH_VALUE = Buffer.from("test").toString("base64");
    process.env.KBTT_TOKEN_BASIC_AUTH_VALUE = Buffer.from("test").toString("base64");
    process.env.KBTT_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    fetchMock = jest.fn().mockRejectedValue(new Error("offline"));
    global.fetch = fetchMock;
    // Native AbortSignal.timeout uses real timers; drive the same deadline with fake timers.
    jest.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("deadline", "TimeoutError")), ms);
      return controller.signal;
    });
    client = new KbttProviderClient();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("waits exactly 10000ms between failures and stops after three attempts", async () => {
    const result = expect(client.revoke("token")).rejects.toMatchObject({ status: 502 });
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(9999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(9999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    await result;
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([1, 2, 3])("stops on successful attempt %i", async (attempt) => {
    fetchMock.mockReset();
    for (let i = 1; i < attempt; i++) fetchMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockResolvedValueOnce(Response.json({ code: "200", data: null }));
    const result = client.revoke("token");
    await jest.advanceTimersByTimeAsync((attempt - 1) * 10000);
    await expect(result).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(attempt);
    expect(fetchMock.mock.calls[0][0].pathname).toBe("/authorization-service/oauth/revoke");
    expect(fetchMock.mock.calls[0][0].searchParams.get("access_token")).toBe("token");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("rejects terminal HTTP 401 without claiming success or retrying", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(client.revoke("token")).rejects.toMatchObject({ status: 401 });
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels the retry delay immediately", async () => {
    const controller = new AbortController();
    const reason = new Error("cleanup cancelled");
    const result = expect(client.revoke("token", controller.signal)).rejects.toBe(reason);
    await jest.advanceTimersByTimeAsync(5000);
    controller.abort(reason);
    await result;
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a pending request even when transport ignores abort", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const reason = new Error("cleanup cancelled");
    const result = expect(client.revoke("token", controller.signal)).rejects.toBe(reason);
    controller.abort(reason);
    await result;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not send requests for an already aborted caller", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(client.revoke("token", controller.signal)).rejects.toBe(controller.signal.reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels while reading the response body", async () => {
    const cancel = jest.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const controller = new AbortController();
    const reason = new Error("cleanup cancelled");
    const result = expect(client.revoke("token", controller.signal)).rejects.toBe(reason);
    await jest.advanceTimersByTimeAsync(0);
    controller.abort(reason);
    await result;
    expect(cancel).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the hard deadline through response-body reads", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(new ReadableStream())));
    const result = expect(client.revoke("token")).rejects.toMatchObject({ status: 502 });
    await jest.advanceTimersByTimeAsync(50000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never fabricates success from a malformed provider response", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ message: "ok" })));
    const result = expect(client.revoke("token")).rejects.toMatchObject({ status: 502 });
    await jest.advanceTimersByTimeAsync(20000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retains a hard 10000ms deadline on every attempt", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const result = expect(client.revoke("token")).rejects.toMatchObject({ status: 502 });
    await jest.advanceTimersByTimeAsync(9999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(10001);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(20000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(10000);
    await result;
    expect(AbortSignal.timeout).toHaveBeenCalledTimes(3);
    expect(AbortSignal.timeout).toHaveBeenCalledWith(10000);
    for (const [, options] of fetchMock.mock.calls) expect(options.signal.aborted).toBe(true);
  });

  it("keeps login and refresh single attempt", async () => {
    await expect(client.login({ username: "test", password: "test" })).rejects.toBeDefined();
    await expect(client.refresh("refresh")).rejects.toBeDefined();
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
