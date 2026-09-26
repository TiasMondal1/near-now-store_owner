/**
 * One-time prompt for Android OEMs whose aggressive battery optimisers
 * (MIUI, ColorOS, FuntouchOS, EMUI…) throttle or delay background push
 * delivery unless the app is exempted. The prompt explains the problem and
 * opens the app's system settings page so the shopkeeper can turn the
 * optimisation off; it is shown once per install and never on iOS or on
 * brands where stock Android behaviour is fine.
 *
 * See https://dontkillmyapp.com for the per-vendor background.
 */
import { Alert, Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";

const PROMPTED_KEY = "battery_optimization_prompted_v1";

const AGGRESSIVE_BRANDS = [
  "xiaomi",
  "redmi",
  "poco",
  "oppo",
  "realme",
  "vivo",
  "iqoo",
  "oneplus",
  "huawei",
  "honor",
  "samsung",
  "tecno",
  "infinix",
  "itel",
];

function isAggressiveOem(): boolean {
  const brand = `${Device.brand ?? ""} ${Device.manufacturer ?? ""}`.toLowerCase();
  return AGGRESSIVE_BRANDS.some((b) => brand.includes(b));
}

export async function maybePromptBatteryOptimization(): Promise<void> {
  if (Platform.OS !== "android" || !Device.isDevice) return;
  if (!isAggressiveOem()) return;
  try {
    if (await AsyncStorage.getItem(PROMPTED_KEY)) return;
    await AsyncStorage.setItem(PROMPTED_KEY, "1");
  } catch {
    return;
  }

  Alert.alert(
    "Get order alerts on time",
    `${Device.brand ?? "This"} phones can delay notifications to save battery. To receive new orders instantly, open the app's settings and set Battery to "Unrestricted" (or turn off battery optimisation for Near & Now Shopkeeper).`,
    [
      { text: "Later", style: "cancel" },
      {
        text: "Open settings",
        onPress: () => {
          Linking.openSettings().catch(() => {});
        },
      },
    ]
  );
}
