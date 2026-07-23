// api-client.ts now pulls in session.ts (AsyncStorage/SecureStore) and
// expo-router (for the 401 -> redirect handling below) — mock both so this
// file doesn't need a real native environment, same mocks session.test.ts uses.
const mockStore: Record<string, string> = {};
const mockSecureStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in mockStore ? mockStore[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete mockStore[k];
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      keys.forEach((k) => delete mockStore[k]);
    }),
  },
}));

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  getItemAsync: jest.fn(async (k: string) => (k in mockSecureStore ? mockSecureStore[k] : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockSecureStore[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete mockSecureStore[k];
  }),
}));

const mockRouterReplace = jest.fn();
jest.mock("expo-router", () => ({
  __esModule: true,
  router: { replace: (...args: unknown[]) => mockRouterReplace(...args) },
}));

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
    mockRouterReplace.mockClear();
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    for (const k of Object.keys(mockSecureStore)) delete mockSecureStore[k];
  });

  it("clears the session and redirects to /landing on a 401 (session expired)", async () => {
    mockStore["nearandnow_session"] = JSON.stringify({
      expiresAt: Date.now() + 60_000,
      user: { id: "u1", name: "Shop", role: "shopkeeper", isActivated: true },
    });
    mockSecureStore["nearandnow_shopkeeper_token"] = "stale-token";

    global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, { error: "Invalid or expired token" }));

    const res = await apiClient.get("/shopkeeper/orders");

    expect(res.success).toBe(false);
    expect(mockRouterReplace).toHaveBeenCalledWith("/landing");
    expect(mockStore["nearandnow_session"]).toBeUndefined();
    expect(mockSecureStore["nearandnow_shopkeeper_token"]).toBeUndefined();
    // 401 is a 4xx — no retry.
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
