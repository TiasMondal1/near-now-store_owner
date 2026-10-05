/**
 * Ring countdown bar in the incoming-order popup (IncomingOrderAlertSheet).
 *
 * It used to animate `width` on the JavaScript thread (a layout pass every
 * frame for up to 45 s while ringing). It now slides a full-width bar with
 * the native driver. The visible share of the bar must be the same: these
 * tests read it either way (width % before, translateX now), so they ran on
 * the previous code too.
 */
import React, { act } from "react";
import { Animated, StyleSheet } from "react-native";

type Node = { type: unknown; props: Record<string, any> };
type Rendered = { unmount(): void; root: { findAll(pred: (n: Node) => boolean): Node[] } };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require("react-test-renderer") as { create: (element: React.ReactElement) => Rendered };

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { IncomingOrderAlertSheet } from "../components/IncomingOrderAlertSheet";
import { RING_MAX_MS } from "../lib/incomingOrderAlert";

const ALLOC = {
  allocation_id: "a1",
  order_id: "o1",
  order_code: "NN-1",
  alloc_status: "pending_acceptance",
  pickup_code: null,
  placed_at: "2026-10-06T10:00:00Z",
  items: [{ id: "i1", product_name: "Milk", quantity: 1, unit: "pcs", price: 30 }],
} as any;

const TRACK_WIDTH = 300;

function host(r: Rendered, testID: string): Node | undefined {
  return r.root.findAll((n) => typeof n.type === "string" && n.props.testID === testID)[0];
}

async function render(props: { ringing: boolean; ringStartedAt: number | null }): Promise<Rendered> {
  let r!: Rendered;
  await act(async () => {
    r = create(
      <IncomingOrderAlertSheet
        visible
        alloc={ALLOC}
        position={{ index: 1, total: 1 }}
        storeActive
        busy={null}
        ringing={props.ringing}
        ringStartedAt={props.ringStartedAt}
        onAccept={() => {}}
        onReject={() => {}}
        onDismiss={() => {}}
      />
    );
  });
  const track = host(r, "ring-countdown-track");
  if (track?.props.onLayout) {
    await act(async () => track.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: TRACK_WIDTH, height: 6 } } }));
  }
  return r;
}

/** Visible share of the bar, whichever way it is drawn. */
function visibleFraction(r: Rendered): number {
  const style = StyleSheet.flatten(host(r, "ring-countdown-fill")!.props.style) as any;
  if (typeof style.width === "string" && style.width.endsWith("%") && !style.transform) {
    return parseFloat(style.width) / 100;
  }
  const tx = (style.transform ?? []).find((t: any) => "translateX" in t)?.translateX ?? 0;
  if (style.opacity === 0) return 0;
  return (TRACK_WIDTH + tx) / TRACK_WIDTH;
}

let rendered: Rendered | null = null;
afterEach(async () => {
  await act(async () => rendered?.unmount());
  rendered = null;
  jest.restoreAllMocks();
});

describe("ring countdown bar", () => {
  it("shows the share of the ring still left", async () => {
    rendered = await render({ ringing: true, ringStartedAt: Date.now() - RING_MAX_MS / 3 });
    expect(visibleFraction(rendered)).toBeCloseTo(2 / 3, 1);
  });

  it("is full when the ring has just started", async () => {
    rendered = await render({ ringing: true, ringStartedAt: Date.now() });
    expect(visibleFraction(rendered)).toBeCloseTo(1, 1);
  });

  it("is empty when not ringing", async () => {
    rendered = await render({ ringing: false, ringStartedAt: null });
    expect(visibleFraction(rendered)).toBeCloseTo(0, 2);
  });

  it("runs on the native driver", async () => {
    const timing = jest.spyOn(Animated, "timing");
    rendered = await render({ ringing: true, ringStartedAt: Date.now() });
    expect(timing).toHaveBeenCalled();
    expect(timing.mock.calls.every(([, config]) => (config as any).useNativeDriver === true)).toBe(true);
  });
});
