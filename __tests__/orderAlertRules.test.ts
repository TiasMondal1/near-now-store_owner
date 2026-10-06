import {
  LOCK_ACTION_TTL_MS,
  devToolsAvailable,
  findPushType,
  isNewOrderPush,
  lockScreenAlertHasOrderActions,
  resolveLockScreenTap,
  type LockScreenTap,
} from "../lib/orderAlertRules";
import type { Allocation } from "../components/orders/types";

function alloc(id: string, status: Allocation["alloc_status"] = "pending_acceptance"): Allocation {
  return {
    allocation_id: id,
    order_id: `o-${id}`,
    order_code: `NN-${id}`,
    alloc_status: status,
    pickup_code: null,
    placed_at: "2026-10-05T10:00:00Z",
    items: [{ id: `${id}-i1`, product_name: "Milk", quantity: 1, unit: "pcs", price: 30 }],
  } as Allocation;
}

describe("isNewOrderPush — only a new order rings", () => {
  it.each([
    ["type on data", { data: { type: "new_order", orderId: "o1" } }],
    ["type on the presented notification", { notification: { request: { content: { data: { type: "new_order" } } } } }],
    ["type on notification.data", { notification: { data: { type: "new_order" } } }],
    ["type inside a JSON body string", { data: { body: JSON.stringify({ type: "new_order" }) } }],
  ])("rings for new_order: %s", (_name, payload) => {
    expect(isNewOrderPush(payload)).toBe(true);
  });

  it.each([
    ["order cancelled", { data: { type: "order_cancelled" } }],
    ["items added to an order", { data: { type: "order_items_added" } }],
    ["support reply", { data: { type: "support_reply" } }],
    ["product submission reviewed", { data: { type: "product_submission_reviewed" } }],
    ["no type at all", { data: { title: "Hello" } }],
    ["empty payload", {}],
    ["null", null],
    ["a string", "new_order"],
  ])("does not ring for %s", (_name, payload) => {
    expect(isNewOrderPush(payload)).toBe(false);
  });

  it("does not ring when the user taps a new-order notification (a response, not a push)", () => {
    const response = {
      actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
      notification: { request: { content: { data: { type: "new_order" } } } },
    };
    expect(findPushType(response)).toBe("new_order");
    expect(isNewOrderPush(response)).toBe(false);
  });
});

describe("lockScreenAlertHasOrderActions — buttons only when the alert knows its order", () => {
  it.each([
    [{ allocation_id: "a1" }, true],
    [{ allocation_id: "demo-1", demo: "{}" }, true],
    [{ allocation_id: "" }, false],
    [{}, false],
    [undefined, false],
    [null, false],
  ])("%j → %s", (data, expected) => {
    expect(lockScreenAlertHasOrderActions(data as Record<string, string> | undefined)).toBe(expected);
  });
});

describe("resolveLockScreenTap — a tap answers only the order it was for", () => {
  const now = 1_000_000;
  const tap = (action: LockScreenTap["action"], allocationId: string | null, ago = 0): LockScreenTap => ({
    action,
    allocationId,
    at: now - ago,
  });

  it("a plain open answers nothing", () => {
    expect(resolveLockScreenTap(tap("open", "a1"), [alloc("a1")], [], now)).toEqual({ kind: "drop", reason: "open" });
  });

  it("an Accept with no order id is dropped, even with orders waiting", () => {
    expect(resolveLockScreenTap(tap("accept", null), [alloc("a1"), alloc("a2")], [alloc("a1")], now)).toEqual({
      kind: "drop",
      reason: "no-order-id",
    });
  });

  it("applies to its own order even when another order is first on screen", () => {
    const queue = [alloc("a1"), alloc("a2")];
    expect(resolveLockScreenTap(tap("reject", "a2"), queue, [], now)).toEqual({ kind: "apply", alloc: queue[1], inQueue: true });
  });

  it("finds its order in the server's pending list after a restart", () => {
    const pending = [alloc("a3")];
    expect(resolveLockScreenTap(tap("accept", "a3"), [], pending, now)).toEqual({ kind: "apply", alloc: pending[0], inQueue: false });
  });

  it("ignores its order once the server no longer has it pending", () => {
    expect(resolveLockScreenTap(tap("accept", "a3"), [], [alloc("a3", "accepted")], now)).toEqual({ kind: "wait" });
  });

  it("waits for its order while the tap is fresh", () => {
    expect(resolveLockScreenTap(tap("accept", "a9", LOCK_ACTION_TTL_MS - 1), [alloc("a1")], [alloc("a2")], now)).toEqual({ kind: "wait" });
  });

  it("drops the tap once it is too old, instead of waiting for the next order", () => {
    expect(resolveLockScreenTap(tap("accept", "a9", LOCK_ACTION_TTL_MS + 1), [alloc("a1")], [alloc("a2")], now)).toEqual({
      kind: "drop",
      reason: "expired",
    });
  });

  it("never applies to a different order, whatever is queued or pending", () => {
    const ids = ["a1", "a2", "a3", "a4"];
    for (const target of [...ids, "missing", null]) {
      for (let mask = 0; mask < 16; mask++) {
        const queue = ids.filter((_, i) => mask & (1 << i)).map((id) => alloc(id));
        const pending = ids.filter((_, i) => !(mask & (1 << i))).map((id) => alloc(id));
        const d = resolveLockScreenTap(tap("accept", target), queue, pending, now);
        if (d.kind === "apply") expect(d.alloc.allocation_id).toBe(target);
      }
    }
  });
});

describe("devToolsAvailable — dev client or preview builds only", () => {
  it.each([
    ["development", true, true],
    ["production", true, true],
    ["preview", false, true],
    ["development", false, false],
    ["production", false, false],
    [undefined, false, false],
    ["", false, false],
  ])("env %s, dev build %s → %s", (env, isDev, expected) => {
    expect(devToolsAvailable(env as string | undefined, isDev as boolean)).toBe(expected);
  });
});
