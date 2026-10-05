/**
 * Orders tab active queue (components/orders/useOrdersFeed fetchActiveOrders).
 *
 * The tab used to download every allocation of the last 7 days (picked up,
 * rejected and cancelled ones too) every 10 s and keep only the active ones.
 * The backend's ?active=true returns exactly those (pending_acceptance +
 * accepted, same row shape), so the resulting queue must be identical.
 * The snapshot was recorded on the code before the change.
 */
import React, { act } from "react";

type Rendered = { unmount(): void };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require("react-test-renderer") as { create: (element: React.ReactElement) => Rendered };

const mockGet = jest.fn();

jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../lib/api-client", () => ({ apiClient: { get: (...args: unknown[]) => mockGet(...args) } }));
jest.mock("../lib/orders-db", () => ({
  getOrdersFromDb: jest.fn(async () => []),
  OrdersFetchFailedError: class OrdersFetchFailedError extends Error {},
}));
jest.mock("../lib/supabase", () => ({ supabase: null }));
jest.mock("../lib/incomingOrdersContext", () => ({ useIncomingOrdersCount: () => ({ setIncomingCount: () => {} }) }));

import { useOrdersFeed, type OrdersFeed } from "../components/orders/useOrdersFeed";

const row = (id: string, status: string, n: number) => ({
  allocation_id: id,
  order_id: `o-${id}`,
  order_code: `NN-${id}`,
  alloc_status: status,
  pickup_code: status === "accepted" ? `P${n}` : null,
  store_id: "s1",
  placed_at: `2026-10-0${n}T10:00:00Z`,
  items: [{ id: `${id}-i`, product_name: "Milk", quantity: n, unit: "pcs", price: 30 }],
});
const WEEK = [
  row("a1", "pending_acceptance", 1),
  row("a2", "accepted", 2),
  row("a3", "picked_up", 3),
  row("a4", "rejected", 4),
  row("a5", "cancelled", 5),
  row("a6", "accepted", 6),
];
const ACTIVE = new Set(["pending_acceptance", "accepted"]);
const TERMINAL = new Set(["picked_up", "rejected", "cancelled"]);

// The backend's own status filter for each query (shopkeeper.controller getIncomingOrders).
function serverOrders(url: string) {
  if (url.includes("active=true")) return WEEK.filter((o) => ACTIVE.has(o.alloc_status));
  if (url.includes("history=true")) return WEEK.filter((o) => TERMINAL.has(o.alloc_status));
  return WEEK;
}

const SELECTED = {
  session: { token: "tok", user: { id: "u1" } } as any,
  store: { id: "s1", is_active: true } as any,
  loading: false,
};

let latest: OrdersFeed | null = null;
function Harness() {
  latest = useOrdersFeed(true, SELECTED);
  return null;
}

let renderer: Rendered | null = null;

beforeEach(() => {
  latest = null;
  mockGet.mockReset().mockImplementation(async (url: string) => ({
    success: true,
    data: { success: true, orders: serverOrders(url) },
  }));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
});

async function mount() {
  await act(async () => {
    renderer = create(<Harness />);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const activeRequests = () =>
  mockGet.mock.calls.map(([url]) => url as string).filter((url) => url.startsWith("/shopkeeper/orders") && !url.includes("history"));

describe("Orders tab active queue", () => {
  it("ends up with the same active orders as before", async () => {
    await mount();
    expect(latest?.allocLoading).toBe(false);
    expect(JSON.stringify(latest?.allocations, null, 1)).toMatchSnapshot();
  });

  it("asks the server for active orders only", async () => {
    await mount();
    expect(activeRequests().length).toBeGreaterThan(0);
    expect(activeRequests().every((url) => url === "/shopkeeper/orders?active=true")).toBe(true);
  });
});
