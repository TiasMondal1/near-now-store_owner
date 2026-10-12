/**
 * Item checklist in the incoming-order popup (IncomingOrderAlertSheet).
 *
 * 2026-10-12: items added to an order while its popup was open showed up
 * unticked, so an Accept sent them to another store as "unavailable". New
 * items now start ticked, the shopkeeper's own unticks survive the refresh,
 * and Accept sends only items still in the order.
 */
import React, { act } from "react";

type Node = { type: unknown; props: Record<string, any> };
type Rendered = { unmount(): void; update(element: React.ReactElement): void; root: { findAll(pred: (n: Node) => boolean): Node[] } };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require("react-test-renderer") as { create: (element: React.ReactElement) => Rendered };

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { IncomingOrderAlertSheet } from "../components/IncomingOrderAlertSheet";

const item = (id: string, name: string) => ({ id, product_name: name, quantity: 1, unit: "pcs", price: 10 });
const alloc = (id: string, items: ReturnType<typeof item>[]) =>
  ({
    allocation_id: id,
    order_id: `o-${id}`,
    order_code: `NN-${id}`,
    alloc_status: "pending_acceptance",
    pickup_code: null,
    placed_at: "2026-10-12T10:00:00Z",
    items,
  }) as any;

function sheet(a: any, onAccept: (ids: string[]) => void) {
  return (
    <IncomingOrderAlertSheet
      visible
      alloc={a}
      position={{ index: 1, total: 1 }}
      storeActive
      busy={null}
      ringing={false}
      ringStartedAt={null}
      onAccept={onAccept}
      onReject={() => {}}
      onDismiss={() => {}}
    />
  );
}

const pressables = (r: Rendered) => r.root.findAll((n) => typeof n.props.onPress === "function");
const checkbox = (r: Rendered, name: string) =>
  pressables(r).find((n) => n.props.accessibilityRole === "checkbox" && String(n.props.accessibilityLabel).includes(name))!;
const acceptButton = (r: Rendered) =>
  pressables(r).find((n) => String(n.props.accessibilityLabel ?? "").startsWith("Accept ("))!;

let rendered: Rendered | null = null;
afterEach(async () => {
  await act(async () => rendered?.unmount());
  rendered = null;
});

it("an item added while the popup is open starts ticked and is accepted", async () => {
  const onAccept = jest.fn();
  await act(async () => { rendered = create(sheet(alloc("a1", [item("i1", "Milk")]), onAccept)); });
  await act(async () => rendered!.update(sheet(alloc("a1", [item("i1", "Milk"), item("i2", "Bread")]), onAccept)));

  expect(checkbox(rendered!, "Bread").props.accessibilityState.checked).toBe(true);
  await act(async () => acceptButton(rendered!).props.onPress());
  expect(onAccept).toHaveBeenCalledWith(["i1", "i2"]);
});

it("keeps an item the shopkeeper unticked when the order refreshes", async () => {
  const onAccept = jest.fn();
  const first = [item("i1", "Milk"), item("i2", "Bread")];
  await act(async () => { rendered = create(sheet(alloc("a1", first), onAccept)); });
  await act(async () => checkbox(rendered!, "Bread").props.onPress());
  await act(async () => rendered!.update(sheet(alloc("a1", [...first, item("i3", "Eggs")]), onAccept)));

  expect(checkbox(rendered!, "Bread").props.accessibilityState.checked).toBe(false);
  await act(async () => acceptButton(rendered!).props.onPress());
  expect(onAccept).toHaveBeenCalledWith(["i1", "i3"]);
});

it("accepts only items still in the order", async () => {
  const onAccept = jest.fn();
  await act(async () => { rendered = create(sheet(alloc("a1", [item("i1", "Milk"), item("i2", "Bread")]), onAccept)); });
  await act(async () => rendered!.update(sheet(alloc("a1", [item("i1", "Milk")]), onAccept)));
  await act(async () => acceptButton(rendered!).props.onPress());
  expect(onAccept).toHaveBeenCalledWith(["i1"]);
});

it("a different order resets the ticks to all items", async () => {
  const onAccept = jest.fn();
  await act(async () => { rendered = create(sheet(alloc("a1", [item("i1", "Milk"), item("i2", "Bread")]), onAccept)); });
  await act(async () => checkbox(rendered!, "Bread").props.onPress());
  await act(async () => rendered!.update(sheet(alloc("a2", [item("j1", "Rice"), item("j2", "Dal")]), onAccept)));
  await act(async () => acceptButton(rendered!).props.onPress());
  expect(onAccept).toHaveBeenCalledWith(["j1", "j2"]);
});
