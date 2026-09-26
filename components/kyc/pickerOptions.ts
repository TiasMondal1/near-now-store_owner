/**
 * Builds the `ActionSheet` options for one document slot on the Documents
 * screen: the three pickers, plus "Remove selected file" while a file is staged
 * and "Delete uploaded file" while the server holds one.
 */
import type { ActionSheetOption } from "../ui";

export type PickerOptionHandlers = {
  takePhoto: () => void;
  pickImage: () => void;
  pickPdf: () => void;
  /** Present when a not-yet-saved file is staged for this slot. */
  unstage?: () => void;
  /** Present when the server holds an uploaded file for this slot. */
  deleteUploaded?: () => void;
};

export function buildPickerOptions(h: PickerOptionHandlers): ActionSheetOption[] {
  const options: ActionSheetOption[] = [
    { key: "camera", label: "Take photo", icon: "camera-outline", onPress: h.takePhoto },
    { key: "gallery", label: "Choose from gallery", icon: "images-outline", onPress: h.pickImage },
    { key: "file", label: "Choose file (PDF)", icon: "document-text-outline", onPress: h.pickPdf },
  ];
  if (h.unstage) {
    options.push({ key: "unstage", label: "Remove selected file", icon: "close-circle-outline", destructive: true, onPress: h.unstage });
  }
  if (h.deleteUploaded) {
    options.push({ key: "delete", label: "Delete uploaded file", icon: "trash-outline", destructive: true, onPress: h.deleteUploaded });
  }
  return options;
}
