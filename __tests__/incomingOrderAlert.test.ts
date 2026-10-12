import { FRESH_WINDOW_MS, pickNewAlerts, pruneSeen } from "../lib/incomingOrderAlert";
import type { Allocation } from "../components/orders/types";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) },
}));
jest.mock("expo-audio", () => ({}), { virtual: true });

const NOW = Date.parse("2026-09-30T10:00:00.000Z");

function alloc(
  id: string,
  placedAgoMs: number | null,
  status: Allocation["alloc_status"] = "pending_acceptance"
): Allocation {
  return {
    allocation_id: id,
    order_id: `o-${id}`,
    order_code: `NN20260930-${id}`,
    alloc_status: status,
    pickup_code: null,
    placed_at: placedAgoMs == null ? "" : new Date(NOW - placedAgoMs).toISOString(),
    items: [{ id: `${id}-i1`, product_name: "Milk", quantity: 1, unit: "l" }],
    customer_area: null,
    customer_distance: null,
  };
}

describe("pickNewAlerts", () => {
  it("returns unseen, recently placed pending orders in input order", () => {
    const pending = [alloc("a", 30_000), alloc("b", 2 * 60_000)];
    expect(pickNewAlerts(pending, new Set(), NOW).map((a) => a.allocation_id)).toEqual(["a", "b"]);
  });

  it("skips orders already shown", () => {
    const pending = [alloc("a", 30_000), alloc("b", 30_000)];
    expect(pickNewAlerts(pending, new Set(["a"]), NOW).map((a) => a.allocation_id)).toEqual(["b"]);
  });

  it("skips stale orders older than the fresh window", () => {
    const pending = [alloc("old", FRESH_WINDOW_MS + 1), alloc("edge", FRESH_WINDOW_MS)];
    expect(pickNewAlerts(pending, new Set(), NOW).map((a) => a.allocation_id)).toEqual(["edge"]);
  });

  it("keeps orders whose placed_at is missing or unparseable", () => {
    expect(pickNewAlerts([alloc("nots", null)], new Set(), NOW)).toHaveLength(1);
  });

  it("ignores allocations that are not pending_acceptance", () => {
    const pending = [alloc("acc", 10_000, "accepted"), alloc("p", 10_000)];
    expect(pickNewAlerts(pending, new Set(), NOW).map((a) => a.allocation_id)).toEqual(["p"]);
  });

  it("ignores allocations without an id", () => {
    const broken = { ...alloc("x", 10_000), allocation_id: "" };
    expect(pickNewAlerts([broken], new Set(), NOW)).toEqual([]);
  });

  // 2026-10-12: the window runs from when the store could first see the
  // request, not from when the customer placed the order.
  const offeredAgo = (a: Allocation, ms: number | null): Allocation => ({
    ...a,
    offered_at: ms == null ? null : new Date(NOW - ms).toISOString(),
  });

  it("rings for a request reallocated to this store long after the order was placed", () => {
    const third = offeredAgo(alloc("third", 12 * 60_000), 30_000);
    expect(pickNewAlerts([third], new Set(), NOW).map((a) => a.allocation_id)).toEqual(["third"]);
  });

  it("skips a request offered to this store longer ago than the window", () => {
    const stale = offeredAgo(alloc("stale", FRESH_WINDOW_MS + 60_000), FRESH_WINDOW_MS + 1);
    expect(pickNewAlerts([stale], new Set(), NOW)).toEqual([]);
  });

  it("falls back to placed_at when offered_at is missing or unparseable (older backend)", () => {
    const pending = [
      offeredAgo(alloc("old-null", FRESH_WINDOW_MS + 1), null),
      { ...alloc("old-bad", FRESH_WINDOW_MS + 1), offered_at: "not a date" },
      offeredAgo(alloc("fresh-null", 30_000), null),
    ];
    expect(pickNewAlerts(pending, new Set(), NOW).map((a) => a.allocation_id)).toEqual(["fresh-null"]);
  });
});

describe("pruneSeen", () => {
  it("keeps only the most recent ids past the limit", () => {
    expect(pruneSeen(["1", "2", "3", "4"], 2)).toEqual(["3", "4"]);
    expect(pruneSeen(["1", "2"], 2)).toEqual(["1", "2"]);
  });
});
