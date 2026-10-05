/**
 * Incoming-order alert: the pure "which pending orders deserve a ring"
 * decision plus the persisted seen-set and the ringer (looping chime +
 * vibration).
 *
 * The OS push already plays `order_chime.wav` once and shows a heads-up
 * banner. Everything after that — a full-screen Accept / Reject popup that
 * keeps ringing until answered — has to happen inside the app, because the
 * push payload carries no order data and the backend is not being changed
 * for this feature. So the alert is driven off the same
 * `/shopkeeper/orders?active=true` poll that feeds the tab badge: any
 * `pending_acceptance` allocation we have not shown before, placed recently
 * enough to plausibly be "the order that just buzzed the phone", pops up.
 *
 * `pickNewAlerts` is pure so it can be unit-tested; the rest is I/O.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Vibration } from "react-native";
import { parseDbDate } from "./order-utils";
import type { Allocation } from "../components/orders/types";

const SEEN_KEY = "incoming_order_alert_seen_v1";
/** Seen ids kept on disk — enough that a busy day never re-rings an old order. */
const SEEN_LIMIT = 300;

/**
 * A pending order older than this is not "new" — it was already sitting in
 * the Orders tab (reinstall, long offline stretch, a second device answered
 * late). Ringing for it would be noise, not an alert.
 */
export const FRESH_WINDOW_MS = 10 * 60 * 1000;

/** How long the chime + vibration loop before falling silent (popup stays). */
export const RING_MAX_MS = 45 * 1000;

/**
 * Pending allocations that should trigger the popup right now: not yet
 * shown, and either recently placed or with an unparseable `placed_at` (a
 * missing timestamp must not silence a real order). Preserves input order.
 */
export function pickNewAlerts(
  pending: Allocation[],
  seen: ReadonlySet<string>,
  now: number = Date.now(),
  freshWindowMs: number = FRESH_WINDOW_MS
): Allocation[] {
  const out: Allocation[] = [];
  for (const a of pending) {
    if (a.alloc_status !== "pending_acceptance") continue;
    if (!a.allocation_id || seen.has(a.allocation_id)) continue;
    const placed = parseDbDate(a.placed_at);
    if (placed && now - placed.getTime() > freshWindowMs) continue;
    out.push(a);
  }
  return out;
}

/** Keep the most recent `limit` ids (input is oldest → newest). */
export function pruneSeen(ids: string[], limit: number = SEEN_LIMIT): string[] {
  return ids.length > limit ? ids.slice(ids.length - limit) : ids;
}

export async function loadSeenAlertIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function saveSeenAlertIds(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(pruneSeen(ids)));
  } catch {
    // Best-effort: worst case an order rings again after a restart.
  }
}

// ─── Ringer ──────────────────────────────────────────────────────────────────

type AudioPlayerLike = {
  loop: boolean;
  volume: number;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void> | void;
  remove: () => void;
};

type ExpoAudio = typeof import("expo-audio");

let audio: ExpoAudio | null = null;
let audioModeSet = false;
try {
  // Resolved at runtime so a build without the native module (web, an old
  // dev client) degrades to vibration-only instead of crashing at import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  audio = require("expo-audio") as ExpoAudio;
} catch {
  audio = null;
}

/**
 * Loops the order chime and a vibration pattern until `stop()` or
 * `RING_MAX_MS`, whichever comes first. One instance per app; `start()` while
 * already ringing is a no-op so a second order joining the queue does not
 * restart the sound.
 */
class OrderRinger {
  private player: AudioPlayerLike | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private ringing = false;
  private onSilenced: (() => void) | null = null;

  isRinging(): boolean {
    return this.ringing;
  }

  async start(opts: { sound: boolean; onSilenced?: () => void } = { sound: true }): Promise<void> {
    if (this.ringing) return;
    this.ringing = true;
    this.onSilenced = opts.onSilenced ?? null;

    // Android repeats a [wait, on, off] pattern with `true`; iOS ignores the
    // pattern and buzzes once per call, which is still a useful nudge.
    try {
      Vibration.vibrate(Platform.OS === "android" ? [0, 700, 500] : 700, Platform.OS === "android");
    } catch {
      // Vibration is best-effort.
    }

    if (opts.sound && audio) {
      try {
        if (!audioModeSet) {
          audioModeSet = true;
          // playsInSilentMode: an order request must be heard on an iPhone
          // left on the ring/silent switch — same category a ride-hailing
          // app uses for incoming requests.
          await audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix" });
        }
        // Stopped while awaiting the mode change — don't start late.
        if (!this.ringing) return;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const player = audio.createAudioPlayer(require("../assets/sounds/order_chime.wav")) as unknown as AudioPlayerLike;
        player.loop = true;
        player.volume = 1;
        player.play();
        this.player = player;
      } catch {
        this.player = null;
      }
    }

    this.stopTimer = setTimeout(() => {
      const cb = this.onSilenced;
      this.stop();
      cb?.();
    }, RING_MAX_MS);
  }

  stop(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.onSilenced = null;
    this.ringing = false;
    try {
      Vibration.cancel();
    } catch {
      // ignore
    }
    const p = this.player;
    this.player = null;
    if (p) {
      try {
        p.pause();
        p.remove();
      } catch {
        // Player may already be released.
      }
    }
  }
}

export const orderRinger = new OrderRinger();
