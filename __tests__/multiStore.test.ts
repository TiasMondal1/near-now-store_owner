/**
 * Multi-store ownership (2026-10-02) — the app-side rules that decide which
 * store the owner is working in, and that the approval gate / app-start
 * routing / store cache all follow that choice (audit #6, #7, #8).
 */
const mockStore: Record<string, string> = {};

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

// Server responses for GET /store-owner/stores, controllable per test.
let mockServerStores: unknown[] = [];
let mockRequestGate: Promise<void> | null = null;
jest.mock("../lib/api-client", () => ({
  apiClient: {
    get: jest.fn(async () => ({ success: true, data: { stores: mockServerStores } })),
    request: jest.fn(async () => {
      const snapshot = mockServerStores; // what the server had when the request was sent
      if (mockRequestGate) await mockRequestGate;
      return { success: true, data: { stores: snapshot } };
    }),
  },
}));

type Mods = {
  sel: typeof import("../lib/selectedStore");
  approval: typeof import("../lib/storeApproval");
  cache: typeof import("../lib/appCache");
};
function load(): Mods {
  jest.resetModules();
  return {
    sel: require("../lib/selectedStore"),
    approval: require("../lib/storeApproval"),
    cache: require("../lib/appCache"),
  };
}

const store = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Store ${id}`,
  address: null,
  delivery_radius_km: 3,
  is_active: true,
  is_approved: false,
  ...extra,
});

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockServerStores = [];
  mockRequestGate = null;
});

describe("pickSelectedStore", () => {
  const { sel } = load();
  const pending = store("pending");
  const approvedA = store("A", { is_approved: true });
  const approvedB = store("B", { is_approved: true });

  it("uses the remembered store when it still exists", () => {
    expect(sel.pickSelectedStore([approvedA, pending], "pending")?.id).toBe("pending");
  });
  it("a newly added pending store is never the default — the first approved one is", () => {
    expect(sel.pickSelectedStore([pending, approvedA, approvedB], null)?.id).toBe("A");
  });
  it("a remembered store that no longer exists (deleted, other account) falls back to the rule", () => {
    expect(sel.pickSelectedStore([pending, approvedB], "gone")?.id).toBe("B");
  });
  it("with nothing approved, the first store", () => {
    expect(sel.pickSelectedStore([pending, store("x")], null)?.id).toBe("pending");
  });
  it("no stores → null", () => {
    expect(sel.pickSelectedStore([], "A")).toBeNull();
    expect(sel.pickSelectedStore(null, null)).toBeNull();
  });
});

describe("switching stores", () => {
  it("persists the choice and tells every subscriber, once per real change", async () => {
    const { sel } = load();
    const seen: (string | null)[] = [];
    const unsubscribe = sel.subscribeSelectedStore((id) => seen.push(id));
    await sel.setSelectedStoreId("B");
    await sel.setSelectedStoreId("B"); // no-op
    await sel.setSelectedStoreId("A");
    unsubscribe();
    await sel.setSelectedStoreId("C"); // after unsubscribe
    expect(seen).toEqual(["B", "A"]);
    expect(mockStore.selected_store_id).toBe("C");
  });

  it("remembering the default never overrides an explicit choice", async () => {
    const { sel } = load();
    await sel.rememberDefaultStoreId("A");
    expect(mockStore.selected_store_id).toBe("A");
    await sel.setSelectedStoreId("B");
    await sel.rememberDefaultStoreId("A");
    expect(mockStore.selected_store_id).toBe("B");
  });

  it("survives an app restart (reloaded from storage)", async () => {
    mockStore.selected_store_id = "B";
    const { sel } = load();
    expect(await sel.loadSelectedStoreId()).toBe("B");
  });

  it("logout clears it and notifies (session.clearSession)", async () => {
    mockStore.selected_store_id = "B";
    jest.resetModules();
    const session = require("../session") as typeof import("../session");
    const sel = require("../lib/selectedStore") as typeof import("../lib/selectedStore");
    await sel.loadSelectedStoreId();
    const seen: (string | null)[] = [];
    sel.subscribeSelectedStore((id) => seen.push(id));
    await session.clearSession();
    expect(mockStore.selected_store_id).toBeUndefined();
    expect(seen).toEqual([null]);
  });
});

describe("storeStatus", () => {
  const { sel } = load();
  it.each([
    [{ is_approved: true, is_active: true }, "Live"],
    [{ is_approved: true, is_active: false }, "Offline"],
    [{ is_approved: false, verification_submitted_at: "2026-10-02" }, "Under review"],
    [{ is_approved: false }, "Setup needed"],
  ])("%o → %s", (s, label) => {
    expect(sel.storeStatus(s).label).toBe(label);
  });
});

describe("approval gate follows the selected store (audit #7)", () => {
  const A = store("A", { is_approved: true });
  const B = store("B", { is_approved: false });

  it("checks the selected store, not stores[0]", async () => {
    mockServerStores = [A, B];
    const { sel, approval } = load();
    await sel.setSelectedStoreId("B");
    let r = await approval.refreshStoreApproval("tok", "u1", { force: true });
    expect([r.store?.id, r.approved]).toEqual(["B", false]);

    await sel.setSelectedStoreId("A");
    r = await approval.refreshStoreApproval("tok", "u1", { force: true });
    expect([r.store?.id, r.approved]).toEqual(["A", true]);
  });

  it("does not reuse the 15 s cached answer across a store switch", async () => {
    mockServerStores = [A, B];
    const { sel, approval } = load();
    await sel.setSelectedStoreId("A");
    expect((await approval.refreshStoreApproval("tok", "u1")).approved).toBe(true);
    await sel.setSelectedStoreId("B");
    const r = await approval.refreshStoreApproval("tok", "u1"); // no force, within 15 s
    expect([r.store?.id, r.approved]).toEqual(["B", false]);
  });

  it("an owner whose first store is pending is not locked out of their approved one", async () => {
    mockServerStores = [B, A]; // pending store first in server order
    const { approval } = load();
    const r = await approval.refreshStoreApproval("tok", "u1", { force: true });
    expect([r.store?.id, r.approved]).toEqual(["A", true]);
  });

  it("an admin-suspended selected store is reported unapproved even if another store is approved", async () => {
    mockServerStores = [A, store("S", { is_approved: false, verification_submitted_at: "2026-09-01" })];
    const { sel, approval } = load();
    await sel.setSelectedStoreId("S");
    expect((await approval.refreshStoreApproval("tok", "u1", { force: true })).approved).toBe(false);
  });
});

describe("app-start routing uses the selected store", () => {
  it("pending store selected → verification flow; approved selected → home", async () => {
    const A = store("A", { is_approved: true });
    const B = store("B");
    mockServerStores = [A, B];
    const { sel, approval, cache } = load();
    await cache.persistStores([A, B]);

    await sel.setSelectedStoreId("B");
    expect(await approval.resolveAuthenticatedRoute("tok", "u1")).toBe("/store-owner-signup");

    await sel.setSelectedStoreId("A");
    expect(await approval.resolveAuthenticatedRoute("tok", "u1")).toBe("/(tabs)/home");
  });
});

describe("addStoreToCache (add-store race)", () => {
  it("a stores fetch sent before the new store existed cannot drop it from the cache", async () => {
    const A = store("A", { is_approved: true });
    mockServerStores = [A];
    const { cache } = load();
    await cache.persistStores([A]);

    let release!: () => void;
    mockRequestGate = new Promise<void>((r) => (release = r));
    const stale = cache.forceFetchStores("tok", "u1"); // in flight, will answer [A]

    const created = store("NEW");
    cache.addStoreToCache(created);
    release();
    await stale;

    expect(cache.peekStoresAny()?.map((s) => s.id)).toEqual(["A", "NEW"]);
  });
});
