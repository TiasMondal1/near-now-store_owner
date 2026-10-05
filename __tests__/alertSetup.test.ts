/**
 * Order alert setup checklist (lib/alertSetup checkRequirements).
 *
 * "Alarms & reminders" is only needed by the developer-tools demo order, so
 * a production build must not list it: Android 14+ denies it by default and
 * the Home "Order alerts need setup" card could never clear (2026-10-06).
 */
/* eslint-disable @typescript-eslint/no-require-imports */

let mockDevTools = false;

jest.mock("../lib/devToolsFlag", () => ({
  get DEV_TOOLS_AVAILABLE() {
    return mockDevTools;
  },
}));
jest.mock("../lib/notifications", () => ({
  notificationService: {
    areNotificationsEnabled: jest.fn(async () => true),
    registerForPushNotifications: jest.fn(async () => true),
  },
}));
jest.mock("@notifee/react-native", () => ({
  __esModule: true,
  default: {
    getNotificationSettings: jest.fn(async () => ({ android: { alarm: 0 } })), // alarm permission denied
    isBatteryOptimizationEnabled: jest.fn(async () => false),
    getPowerManagerInfo: jest.fn(async () => ({ activity: null })),
  },
  AndroidNotificationSetting: { NOT_SUPPORTED: -1, DISABLED: 0, ENABLED: 1 },
}));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

function loadOnAndroid14(): typeof import("../lib/alertSetup") {
  let mod: typeof import("../lib/alertSetup") | undefined;
  jest.isolateModules(() => {
    const { Platform } = require("react-native");
    Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });
    Object.defineProperty(Platform, "Version", { get: () => 34, configurable: true });
    mod = require("../lib/alertSetup");
  });
  return mod!;
}

describe("checkRequirements on Android 14 with the alarm permission off", () => {
  it("a production build does not ask for Alarms & reminders", async () => {
    mockDevTools = false;
    const { checkRequirements, allSatisfied } = loadOnAndroid14();
    const reqs = await checkRequirements();
    expect(reqs.map((r) => r.key)).toEqual(["notifications", "fullScreen", "battery"]);
    // Only the hand-confirmed full-screen item is left to do.
    expect(reqs.filter((r) => r.state !== "ok").map((r) => r.key)).toEqual(["fullScreen"]);
    expect(allSatisfied(reqs)).toBe(false);
  });

  it("a developer-tools build still lists it, as missing", async () => {
    mockDevTools = true;
    const { checkRequirements } = loadOnAndroid14();
    const reqs = await checkRequirements();
    expect(reqs.map((r) => r.key)).toEqual(["notifications", "fullScreen", "exactAlarm", "battery"]);
    expect(reqs.find((r) => r.key === "exactAlarm")?.state).toBe("missing");
  });
});
