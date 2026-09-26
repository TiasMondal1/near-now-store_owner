import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

/** Upload limits shared by the Documents and Billing screens. */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const FORMATS_HINT = "JPG, PNG, WEBP or PDF · up to 5MB";
export const IMAGE_FORMATS_HINT = "JPG, PNG or WEBP · up to 5MB";

export function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  return "jpg";
}

/**
 * OS-level permission prompt. This is the one place `Alert.alert` is still
 * allowed: explaining why the camera permission is needed when it was denied.
 */
export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permission needed", "Allow camera access to take a photo.");
    return false;
  }
  return true;
}

/** "10:42" — 24h clock, zero-padded, no Intl dependency. */
export function formatClock(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
