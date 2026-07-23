// In-memory backing stores shared across module resets (must be `mock`-prefixed
// so the jest.mock factories are allowed to reference them).
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

const SESSION_KEY = "nearandnow_session";
const TOKEN_KEY = "nearandnow_shopkeeper_token";

// Re-require the module fresh each test so the in-memory session cache resets,
// while mockStore (AsyncStorage) persists to simulate on-disk state.
function loadSession() {
  jest.resetModules();
  return require("../session") as typeof import("../session");
}

const baseUser = {
  id: "u1",
  name: "Shop",
  role: "shopkeeper",
  isActivated: true,
};

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  for (const k of Object.keys(mockSecureStore)) delete mockSecureStore[k];
});

describe("saveSession / getSession", () => {
  it("saves a session and applies a ~30-day default expiry", async () => {
    const session = loadSession();
    const before = Date.now();
    await session.saveSession({ token: "tok", user: baseUser });

    const got = await session.getSession();
    expect(got).not.toBeNull();
    expect(got!.token).toBe("tok");
    // Default TTL is 30 days.
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(got!.expiresAt).toBeGreaterThanOrEqual(before + thirtyDays - 1000);
    expect(got!.expiresAt).toBeLessThanOrEqual(Date.now() + thirtyDays + 1000);
  });

  it("honours an explicit expiresAt", async () => {
    const session = loadSession();
    const expiresAt = Date.now() + 5000;
    await session.saveSession({ token: "tok", user: baseUser, expiresAt });
    const got = await session.getSession();
    expect(got!.expiresAt).toBe(expiresAt);
  });
});

describe("expiry enforcement (fresh runtime / disk path)", () => {
  it("returns null and clears storage when the stored session is expired", async () => {
    // Seed an already-expired session directly on 'disk' (no in-memory cache).
    mockStore[SESSION_KEY] = JSON.stringify({
      token: "old",
      expiresAt: Date.now() - 1000,
      user: baseUser,
    });

    const session = loadSession();
    const got = await session.getSession();

    expect(got).toBeNull();
    expect(mockStore[SESSION_KEY]).toBeUndefined();
  });

  it("returns a valid non-expired session from disk", async () => {
    mockStore[SESSION_KEY] = JSON.stringify({
      token: "fresh",
      expiresAt: Date.now() + 60_000,
      user: baseUser,
    });

    const session = loadSession();
    const got = await session.getSession();
    expect(got!.token).toBe("fresh");
  });
});

describe("clearSession", () => {
  it("removes the persisted session", async () => {
    const session = loadSession();
    await session.saveSession({ token: "tok", user: baseUser });
    await session.clearSession();
    expect(await session.getSession()).toBeNull();
    expect(mockStore[SESSION_KEY]).toBeUndefined();
    expect(mockSecureStore[TOKEN_KEY]).toBeUndefined();
  });
});

describe("token storage location", () => {
  it("keeps the token in SecureStore, not in the plain AsyncStorage blob", async () => {
    const session = loadSession();
    await session.saveSession({ token: "super-secret-token", user: baseUser });

    expect(mockSecureStore[TOKEN_KEY]).toBe("super-secret-token");
    const persisted = JSON.parse(mockStore[SESSION_KEY]);
    expect(persisted.token).toBeUndefined();
  });

  it("migrates a legacy pre-SecureStore session (token embedded in AsyncStorage) on first read", async () => {
    // Simulate an install from before this change: the whole session, including
    // the token, was written as one JSON blob directly to AsyncStorage.
    mockStore[SESSION_KEY] = JSON.stringify({
      token: "legacy-token",
      expiresAt: Date.now() + 60_000,
      user: baseUser,
    });

    const session = loadSession();
    const got = await session.getSession();

    expect(got!.token).toBe("legacy-token");
    // Migrated into SecureStore...
    expect(mockSecureStore[TOKEN_KEY]).toBe("legacy-token");
    // ...and scrubbed from the AsyncStorage copy.
    const persisted = JSON.parse(mockStore[SESSION_KEY]);
    expect(persisted.token).toBeUndefined();
  });
});

describe("isJustLoggedIn", () => {
  it("is false on a fresh runtime and true after saveSession", async () => {
    const session = loadSession();
    expect(session.isJustLoggedIn()).toBe(false);
    await session.saveSession({ token: "tok", user: baseUser });
    expect(session.isJustLoggedIn()).toBe(true);
  });
});
