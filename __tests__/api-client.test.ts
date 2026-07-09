import { apiClient } from "../lib/api-client";

function jsonResponse(status: number, body: unknown, ok = status < 400) {
  return {
    ok,
    status,
    statusText: `status ${status}`,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("ApiClient.request", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("returns success with parsed data on 200", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { hello: "world" }));

    const res = await apiClient.get("/thing");

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ hello: "world" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("addresses routes at the origin WITHOUT injecting an /api prefix", async () => {
    // This backend mounts /shopkeeper and /store-owner at the root; the client
    // must not add /api (regression guard).
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { success: true }));

    await apiClient.get("/shopkeeper/orders");

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toBe(`${apiClient.getBaseUrl()}/shopkeeper/orders`);
    expect(calledUrl).not.toContain("/api/shopkeeper");
  });

  it("does NOT retry on 4xx client errors", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { error_code: "NOT_FOUND", message: "nope" }));

    const res = await apiClient.get("/missing");

    expect(res.success).toBe(false);
    expect(res.error_code).toBe("NOT_FOUND");
    expect(res.error).toBe("nope");
    // A single attempt only — 4xx short-circuits the retry loop.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx with backoff, then gives up after `retries` attempts", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(500, { message: "boom" }));

    const promise = apiClient.request("/flaky", { retries: 2 });
    // Flush the exponential-backoff timers between attempts.
    await jest.runAllTimersAsync();
    const res = await promise;

    expect(res.success).toBe(false);
    // 1 initial attempt + 2 retries.
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("recovers when a retried request eventually succeeds", async () => {
    jest.useFakeTimers();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "temporary" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const promise = apiClient.request("/eventually-ok", { retries: 2 });
    await jest.runAllTimersAsync();
    const res = await promise;

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
