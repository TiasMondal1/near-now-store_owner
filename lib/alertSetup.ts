/**
 * "Order alert setup" — one place that knows every Android permission and
 * setting a shopkeeper needs for incoming-order alerts to ring reliably,
 * can check each one live where the OS allows, and deep-links to the exact
 * system page for the rest.
 *
 * Requirements (Android):
 *   notifications  — POST_NOTIFICATIONS; checked live.
 *   fullScreen     — "Allow full screen notifications" (Android 14+ denies
 *                    by default for non-call apps). No API can read it, so
 *                    the shopkeeper confirms it once by hand.
 *   exactAlarm     — "Alarms & reminders" (SCHEDULE_EXACT_ALARM, Android
 *                    14+ denies by default); checked live via Notifee.
 *   battery        — app exempt from battery optimisation; checked live via
 *                    Notifee; the direct "Allow app to run in background?"
 *                    dialog is opened with REQUEST_IGNORE_BATTERY_OPTIMIZATIONS.
 *   autostart      — OEM "autostart / power manager" page (Xiaomi, Vivo…);
 *                    only listed when the device has one; manual confirm.
 *
 * iOS and runtimes without Notifee (Expo Go) only get the notifications row.
 */
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useFocusEffect } from "@react-navigation/native";
import { notificationService } from "./notifications";

type Notifee = typeof import("@notifee/react-native");
let notifeeMod: Notifee | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notifeeMod = require("@notifee/react-native") as Notifee;
  if (typeof notifeeMod.default?.getNotificationSettings !== "function") notifeeMod = null;
} catch {
  notifeeMod = null;
}

type IntentLauncher = typeof import("expo-intent-launcher");
let intentLauncher: IntentLauncher | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  intentLauncher = require("expo-intent-launcher") as IntentLauncher;
} catch {
  intentLauncher = null;
}

const PACKAGE = Constants.expoConfig?.android?.package ?? "com.nearandnow.shopkeeper";
const ANDROID = Platform.OS === "android";
const API = typeof Platform.Version === "number" ? Platform.Version : 0;

export type RequirementKey = "notifications" | "fullScreen" | "exactAlarm" | "battery" | "autostart";
export type RequirementState = "ok" | "missing" | "confirm";

export type Requirement = {
  key: RequirementKey;
  title: string;
  description: string;
  /** What the button does, e.g. "Open settings". */
  actionLabel: string;
  state: RequirementState;
  /** True when the OS lets us read the state; false → shopkeeper confirms by hand. */
  detectable: boolean;
};

const CONFIRMED_KEY = "alert_setup_confirmed_v1";
const AUTO_OPENED_KEY = "alert_setup_auto_opened_v1";

async function loadConfirmed(): Promise<Set<RequirementKey>> {
  try {
    const raw = await AsyncStorage.getItem(CONFIRMED_KEY);
    const arr = raw ? (JSON.parse(raw) as RequirementKey[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/** Mark a non-detectable requirement as done by hand ("I've turned it on"). */
export async function confirmRequirement(key: RequirementKey, done: boolean): Promise<void> {
  const set = await loadConfirmed();
  if (done) set.add(key);
  else set.delete(key);
  try {
    await AsyncStorage.setItem(CONFIRMED_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // best-effort
  }
}

async function hasOemPowerManagerPage(): Promise<boolean> {
  if (!notifeeMod) return false;
  try {
    const info = await notifeeMod.default.getPowerManagerInfo();
    return !!info?.activity;
  } catch {
    return false;
  }
}

/** Evaluate every requirement that applies to this device. */
export async function checkRequirements(): Promise<Requirement[]> {
  const confirmed = await loadConfirmed();
  const out: Requirement[] = [];

  const notifOk = await notificationService.areNotificationsEnabled().catch(() => false);
  out.push({
    key: "notifications",
    title: "Notifications",
    description: "Lets the app show new-order alerts at all.",
    actionLabel: "Allow",
    state: notifOk ? "ok" : "missing",
    detectable: true,
  });

  if (!ANDROID || !notifeeMod) return out;

  if (API >= 34) {
    out.push({
      key: "fullScreen",
      title: "Full-screen alerts on the lock screen",
      description: 'On the next page turn on "Allow full screen notifications". The phone cannot tell us if it is on, so tick it here once done.',
      actionLabel: "Open setting",
      state: confirmed.has("fullScreen") ? "ok" : "confirm",
      detectable: false,
    });
  }

  let alarmOk = true;
  try {
    const s = await notifeeMod.default.getNotificationSettings();
    alarmOk = s.android?.alarm === notifeeMod.AndroidNotificationSetting.ENABLED;
  } catch {
    alarmOk = true;
  }
  out.push({
    key: "exactAlarm",
    title: "Alarms & reminders",
    description: "Lets alerts fire at the exact second even when the phone is idle.",
    actionLabel: "Open setting",
    state: alarmOk ? "ok" : "missing",
    detectable: true,
  });

  let batteryOk = true;
  try {
    batteryOk = !(await notifeeMod.default.isBatteryOptimizationEnabled());
  } catch {
    batteryOk = true;
  }
  out.push({
    key: "battery",
    title: "Battery: run in background",
    description: 'Stops Android from pausing the app to save battery. Tap Allow on the dialog that opens.',
    actionLabel: "Allow",
    state: batteryOk ? "ok" : "missing",
    detectable: true,
  });

  if (await hasOemPowerManagerPage()) {
    out.push({
      key: "autostart",
      title: "Autostart / background activity",
      description: "This phone brand has an extra power manager. Enable autostart or background activity for Near & Now Shopkeeper there, then tick here.",
      actionLabel: "Open setting",
      state: confirmed.has("autostart") ? "ok" : "confirm",
      detectable: false,
    });
  }

  return out;
}

export function allSatisfied(reqs: readonly Requirement[]): boolean {
  return reqs.every((r) => r.state === "ok");
}

/** Open the exact system page / dialog for a requirement. */
export async function openRequirement(key: RequirementKey): Promise<void> {
  try {
    switch (key) {
      case "notifications": {
        const granted = await notificationService.registerForPushNotifications();
        if (!granted) await Linking.openSettings();
        return;
      }
      case "fullScreen":
        if (intentLauncher) {
          await intentLauncher.startActivityAsync(intentLauncher.ActivityAction.MANAGE_APP_USE_FULL_SCREEN_INTENT, {
            data: `package:${PACKAGE}`,
          });
        } else {
          await Linking.sendIntent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", [
            { key: "android.provider.extra.APP_PACKAGE", value: PACKAGE },
          ]);
        }
        return;
      case "exactAlarm":
        if (notifeeMod) await notifeeMod.default.openAlarmPermissionSettings();
        else await Linking.openSettings();
        return;
      case "battery":
        // Direct one-tap dialog ("Allow Near & Now Shopkeeper to always run in
        // background?") — needs REQUEST_IGNORE_BATTERY_OPTIMIZATIONS in the
        // manifest (plugins/withLockScreenAlerts.js). Falls back to the
        // system list if the OEM blocks the dialog.
        if (intentLauncher) {
          try {
            await intentLauncher.startActivityAsync(intentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
              data: `package:${PACKAGE}`,
            });
            return;
          } catch {
            // fall through
          }
        }
        if (notifeeMod) await notifeeMod.default.openBatteryOptimizationSettings();
        else await Linking.openSettings();
        return;
      case "autostart":
        if (notifeeMod) await notifeeMod.default.openPowerManagerSettings();
        else await Linking.openSettings();
        return;
    }
  } catch {
    await Linking.openSettings().catch(() => {});
  }
}

/**
 * Hook: current requirement list, re-checked on screen focus and whenever
 * the app returns from the settings pages it deep-links to.
 */
export function useAlertSetup() {
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const refresh = useCallback(async () => {
    const reqs = await checkRequirements();
    setRequirements(reqs);
    return reqs;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const complete = requirements ? allSatisfied(requirements) : true;
  const missingCount = requirements ? requirements.filter((r) => r.state !== "ok").length : 0;
  return { requirements, refresh, complete, missingCount };
}

/** True once per install: the setup screen should be pushed automatically. */
export async function shouldAutoOpenAlertSetup(): Promise<boolean> {
  if (!ANDROID) return false;
  try {
    if (await AsyncStorage.getItem(AUTO_OPENED_KEY)) return false;
    const reqs = await checkRequirements();
    if (allSatisfied(reqs)) return false;
    await AsyncStorage.setItem(AUTO_OPENED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
