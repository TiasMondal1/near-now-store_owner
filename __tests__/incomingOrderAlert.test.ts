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
});

describe("pruneSeen", () => {
  it("keeps only the most recent ids past the limit", () => {
    expect(pruneSeen(["1", "2", "3", "4"], 2)).toEqual(["3", "4"]);
    expect(pruneSeen(["1", "2"], 2)).toEqual(["1", "2"]);
  });
});
