/**
 * Camera / gallery / PDF picking for verification documents, with the MIME
 * whitelist, 5MB limit and 1600px client-side downscale. Pure logic — the
 * caller stages the resulting `PickedDocFile` and owns all UI.
 */
import { useCallback, useRef } from "react";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import type { PickedDocFile } from "../../lib/verificationDocuments";
import { ALLOWED_MIME_TYPES, FORMATS_HINT, MAX_FILE_SIZE_BYTES, extFromMime, requestCameraPermission } from "./media";

// Photos straight from a phone camera are often several thousand pixels
// wide — downscaling before they become the pending file fixes both the
// upload size and every future preview load.
const MAX_IMAGE_DIMENSION = 1600;

export type DocFilePickerHandlers<K extends string> = {
  takePhoto: (key: K) => Promise<void>;
  pickImage: (key: K) => Promise<void>;
  pickPdf: (key: K) => Promise<void>;
  /**
   * Wraps one of the handlers for use as an `ActionSheet` option `onPress`,
   * with a re-entrancy guard so a fast double-tap cannot launch the native
   * picker twice.
   */
  guarded: (key: K, action: (key: K) => Promise<void>) => () => void;
};

export function useDocFilePicker<K extends string>(
  onStage: (key: K, file: PickedDocFile) => void,
  onError: (message: string) => void
): DocFilePickerHandlers<K> {
  const inFlightRef = useRef(false);

  const applyPickedImage = useCallback(
    async (key: K, asset: ImagePicker.ImagePickerAsset) => {
      const originalType = asset.mimeType || "image/jpeg";
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(originalType)) {
        onError(`Unsupported format. ${FORMATS_HINT}.`);
        return;
      }
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_BYTES) {
        onError(`File too large. ${FORMATS_HINT}.`);
        return;
      }

      let uri = asset.uri;
      let type = originalType;
      let size = asset.fileSize;
      if (asset.width && asset.width > MAX_IMAGE_DIMENSION) {
        try {
          const resized = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: MAX_IMAGE_DIMENSION } }], {
            compress: 0.75,
            format: ImageManipulator.SaveFormat.JPEG,
          });
          uri = resized.uri;
          type = "image/jpeg";
          size = undefined; // unknown after resize — the saved size comes from the backend
        } catch {
          // fall back to the original picked file if resizing fails
        }
      }
      onStage(key, { uri, name: asset.fileName || `${key}.${extFromMime(type)}`, type, size });
    },
    [onStage, onError]
  );

  const takePhoto = useCallback(
    async (key: K) => {
      try {
        if (!(await requestCameraPermission())) return;
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.9 });
        if (result.canceled || !result.assets[0]) return;
        await applyPickedImage(key, result.assets[0]);
      } catch (err) {
        console.warn("[upload-documents] takePhoto failed:", err);
        onError("Couldn't open camera. Please try again.");
      }
    },
    [applyPickedImage, onError]
  );

  const pickImage = useCallback(
    async (key: K) => {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.9 });
        if (result.canceled || !result.assets[0]) return;
        await applyPickedImage(key, result.assets[0]);
      } catch (err) {
        console.warn("[upload-documents] pickImage failed:", err);
        onError("Couldn't open gallery. Please try again.");
      }
    },
    [applyPickedImage, onError]
  );

  const pickPdf = useCallback(
    async (key: K) => {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        if (asset.size && asset.size > MAX_FILE_SIZE_BYTES) {
          onError(`File too large. ${FORMATS_HINT}.`);
          return;
        }
        onStage(key, { uri: asset.uri, name: asset.name || "document.pdf", type: "application/pdf", size: asset.size });
      } catch (err) {
        console.warn("[upload-documents] pickPdf failed:", err);
        onError("Couldn't open file picker. Please try again.");
      }
    },
    [onStage, onError]
  );

  const guarded = useCallback(
    (key: K, action: (key: K) => Promise<void>) => () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      action(key).finally(() => {
        inFlightRef.current = false;
      });
    },
    []
  );

  return { takePhoto, pickImage, pickPdf, guarded };
}
