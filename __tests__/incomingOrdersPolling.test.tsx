/**
 * How often the shopkeeper app checks for new orders (IncomingOrdersProvider).
 *
 * Production's store_orders RLS gives the app's realtime connection nothing,
 * yet the channel still reports SUBSCRIBED. Polling must therefore not slow
 * down because realtime looks connected (2026-10-06 fix): 15 s while the app
 * is open, 20 s in the background while the "store online" service runs.
 */
import React, { act } from "react";
import { AppState } from "react-native";

// react-test-renderer has no bundled types; @types would be a new dependency.
type Rendered = { unmount(): void };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require("react-test-renderer") as { create: (element: React.ReactElement) => Rendered };

const mockGet = jest.fn();
let mockListenerRunning = false;

jest.mock("../session", () => ({
  getSession: jest.fn(async () => ({ token: "tok", user: { id: "u1" } })),
}));
jest.mock("../lib/api-client", () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock("../lib/appCache", () => ({
  peekStores: () => [{ id: "s1" }, { id: "s2" }],
  fetchStoresCached: jest.fn(async () => []),
}));
// Every realtime channel reports SUBSCRIBED, as production does.
jest.mock("../lib/supabase", () => {
  const channel = () => {
    const ch: any = {
      on: () => ch,
      subscribe: (cb?: (status: string) => void) => {
        cb?.("SUBSCRIBED");
        return ch;
      },
    };
    return ch;
  };
  return { supabase: { channel, removeChannel: jest.fn() } };
});
jest.mock("../lib/orderListenerService", () => ({
  isOrderListenerRunning: () => mockListenerRunning,
  onOrderListenerChange: () => () => {},
}));

import { IncomingOrdersProvider } from "../lib/incomingOrdersContext";

function setAppState(state: string) {
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

let renderer: Rendered | null = null;
async function mount() {
  await act(async () => {
    renderer = create(
      <IncomingOrdersProvider>
        <></>
      </IncomingOrdersProvider>
    );
  });
  await flush();
}

const polls = () => mockGet.mock.calls.filter(([url]) => url === "/shopkeeper/orders?active=true").length;

beforeEach(() => {
  jest.useFakeTimers();
  mockGet.mockReset().mockResolvedValue({ success: true, data: { orders: [] } });
  mockListenerRunning = false;
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  jest.useRealTimers();
});

describe("incoming-order polling", () => {
  it("checks every 15 s while the app is open, even though realtime reports connected", async () => {
    setAppState("active");
    await mount();
    const start = polls();
    expect(start).toBeGreaterThanOrEqual(1); // first check on load
    await advance(15_000);
    expect(polls()).toBe(start + 1);
    await advance(15_000);
    expect(polls()).toBe(start + 2);
  });

  it("checks every 20 s in the background while the store-online service runs", async () => {
    mockListenerRunning = true;
    setAppState("background");
    await mount();
    const start = polls();
    await advance(20_000);
    expect(polls()).toBe(start + 1);
    await advance(20_000);
    expect(polls()).toBe(start + 2);
  });

  it("does not check in the background without the store-online service", async () => {
    setAppState("background");
    await mount();
    const start = polls();
    await advance(60_000);
    expect(polls()).toBe(start);
  });
});
