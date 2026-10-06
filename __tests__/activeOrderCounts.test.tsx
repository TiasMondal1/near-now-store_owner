/**
 * Home's "active orders" count now comes from IncomingOrdersProvider's poll
 * instead of Home sending the same GET /shopkeeper/orders?active=true itself.
 * The provider must produce Home's former number for every store.
 */
import React, { act } from "react";
import { AppState } from "react-native";

type Rendered = { unmount(): void };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require("react-test-renderer") as { create: (element: React.ReactElement) => Rendered };

const mockGet = jest.fn();

jest.mock("../session", () => ({ getSession: jest.fn(async () => ({ token: "tok", user: { id: "u1" } })) }));
jest.mock("../lib/api-client", () => ({ apiClient: { get: (...args: unknown[]) => mockGet(...args) } }));
jest.mock("../lib/appCache", () => ({ peekStores: () => [], fetchStoresCached: jest.fn(async () => []) }));
jest.mock("../lib/supabase", () => ({ supabase: null }));
jest.mock("../lib/orderListenerService", () => ({ isOrderListenerRunning: () => false, onOrderListenerChange: () => () => {} }));

import { IncomingOrdersProvider, countAcceptedByStore, useIncomingOrders } from "../lib/incomingOrdersContext";

type Row = { store_id?: string; alloc_status?: string };
const ORDERS: Row[] = [
  { store_id: "s1", alloc_status: "accepted" },
  { store_id: "s1", alloc_status: "accepted" },
  { store_id: "s1", alloc_status: "pending_acceptance" },
  { store_id: "s2", alloc_status: "accepted" },
  { store_id: "s2", alloc_status: "pending_acceptance" },
  { store_id: "s3", alloc_status: "pending_acceptance" },
  { alloc_status: "accepted" },
];

// Home's former calculation (app/(tabs)/home.tsx fetchActiveOrderCount).
const homeCount = (orders: Row[], storeId: string) =>
  orders.filter((o) => o.store_id === storeId && o.alloc_status === "accepted").length;

describe("countAcceptedByStore", () => {
  it("gives Home's former count for every store", () => {
    const counts = countAcceptedByStore(ORDERS);
    for (const id of ["s1", "s2", "s3", "s9"]) {
      expect(counts[id] ?? 0).toBe(homeCount(ORDERS, id));
    }
    expect(counts).toEqual({ s1: 2, s2: 1 });
  });
});

describe("IncomingOrdersProvider exposes the counts", () => {
  let renderer: Rendered | null = null;
  const seen: Readonly<Record<string, number>>[] = [];
  let refresh: () => Promise<void> = async () => {};
  function Probe() {
    const value = useIncomingOrders();
    seen.push(value.acceptedCountByStore);
    refresh = value.refreshIncoming;
    return null;
  }
  async function flush() {
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  beforeEach(() => {
    Object.defineProperty(AppState, "currentState", { value: "active", configurable: true, writable: true });
    mockGet.mockReset().mockResolvedValue({ success: true, data: { orders: ORDERS } });
    seen.length = 0;
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
  });

  it("from the same single request, and keeps the object when nothing changed", async () => {
    await act(async () => {
      renderer = create(
        <IncomingOrdersProvider>
          <Probe />
        </IncomingOrdersProvider>
      );
    });
    await flush();
    const first = seen[seen.length - 1];
    expect(first).toEqual({ s1: 2, s2: 1 });
    expect(mockGet.mock.calls.every(([url]) => url === "/shopkeeper/orders?active=true")).toBe(true);

    // An identical poll (Home's focus refresh) must not hand out a new object.
    await act(async () => {
      await refresh();
    });
    await flush();
    expect(mockGet.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1]).toBe(first);
  });
});
