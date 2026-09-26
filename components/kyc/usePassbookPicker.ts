/**
 * Passbook / cheque photo picker for the Billing screen: camera or gallery,
 * staged locally until Save, with "Remove new photo" restoring the server's
 * preview. Picker launches, MIME handling and the re-entrancy guard are
 * unchanged from the pre-extraction screen; the caller owns the dropzone and
 * the ActionSheet.
 */
import { useCallback, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import type { PickedBillingFile } from "../../lib/billingInfo";
import { useToast, type ActionSheetOption } from "../ui";
import type { UploadDropzoneState } from "./UploadDropzone";
import { extFromMime, requestCameraPermission } from "./media";

export type PassbookPickerOptions = {
  /** Called when a photo is staged (e.g. to clear a stale "Submitted" notice). */
  onStaged?: () => void;
};

export type PassbookPickerState = {
  /** The staged (not yet saved) file, if any. */
  pendingFile: PickedBillingFile | null;
  /** What the dropzone shows: the staged photo, else the server's passbook. */
  previewUri: string | null;
  state: UploadDropzoneState;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  options: ActionSheetOption[];
  /** Record the server's passbook url (from a fetch) and show it. */
  setServerUrl: (url: string | null) => void;
  /** After a successful save: the file is no longer pending; the preview stays. */
  clearPending: () => void;
};

export function usePassbookPicker({ onStaged }: PassbookPickerOptions = {}): PassbookPickerState {
  const toast = useToast();
  const [pendingFile, setPendingFile] = useState<PickedBillingFile | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The server's passbook url, kept so "Remove new photo" can restore it.
  const serverUrlRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const setServerUrl = useCallback((url: string | null) => {
    serverUrlRef.current = url;
    setPreviewUri(url);
  }, []);

  const clearPending = useCallback(() => setPendingFile(null), []);

  const stage = (asset: ImagePicker.ImagePickerAsset) => {
    const mimeType = asset.mimeType || "image/jpeg";
    setPendingFile({ uri: asset.uri, name: `passbook.${extFromMime(mimeType)}`, type: mimeType });
    setPreviewUri(asset.uri);
    onStaged?.();
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.9 });
      if (result.canceled || !result.assets[0]) return;
      stage(result.assets[0]);
    } catch (err) {
      console.warn("[billing-info] pickPassbookFile failed:", err);
      toast.show({ message: "Couldn't open gallery. Please try again.", tone: "error" });
    }
  };

  const takePhoto = async () => {
    try {
      if (!(await requestCameraPermission())) return;
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.9 });
      if (result.canceled || !result.assets[0]) return;
      stage(result.assets[0]);
    } catch (err) {
      console.warn("[billing-info] takePassbookPhoto failed:", err);
      toast.show({ message: "Couldn't open camera. Please try again.", tone: "error" });
    }
  };

  /** Drops the staged photo and restores the server's passbook preview. */
  const unstage = () => {
    setPendingFile(null);
    setPreviewUri(serverUrlRef.current);
  };

  // A fast double-tap must not launch the native picker twice.
  const guarded = (action: () => Promise<void>) => () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    action().finally(() => {
      inFlightRef.current = false;
    });
  };

  const options: ActionSheetOption[] = [
    { key: "camera", label: "Take photo", icon: "camera-outline", onPress: guarded(takePhoto) },
    { key: "gallery", label: "Choose from gallery", icon: "images-outline", onPress: guarded(pickFromGallery) },
    ...(pendingFile
      ? [{ key: "unstage", label: "Remove new photo", icon: "close-circle-outline", destructive: true, onPress: unstage } satisfies ActionSheetOption]
      : []),
  ];

  const state: UploadDropzoneState = pendingFile ? "preview" : previewUri ? "uploaded" : "empty";

  return {
    pendingFile,
    previewUri,
    state,
    sheetOpen,
    openSheet: () => setSheetOpen(true),
    closeSheet: () => setSheetOpen(false),
    options,
    setServerUrl,
    clearPending,
  };
}

export default usePassbookPicker;
