/**
 * Product photo for the custom-product form, in the old look: a dashed
 * "Camera / Gallery" picker box (both open the ActionSheet), a 180dp preview
 * with a dark overlay bar carrying "Change" and "Remove" (Remove behind a
 * ConfirmSheet), and the image-URL fallback field.
 *
 * Picker: `requestCameraPermission` (the shared OS-permission explanation —
 * the one Alert the design system keeps), launchCameraAsync /
 * launchImageLibraryAsync with `{ base64: true, quality: 0.8 }`, a synchronous
 * re-entrancy guard against double taps, try/catch around every native call,
 * and an error Toast when the camera / gallery can't be opened.
 */
import React, { forwardRef, useCallback, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, type TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { ActionSheet, ConfirmSheet, TextField, useToast, type ActionSheetOption } from "../ui";
import { requestCameraPermission } from "../kyc/media";
import { colors, layout, radius, spacing } from "../../lib/theme";

export type ProductPhotoFieldProps = {
  imageUri: string | null;
  /** A picked photo (base64) exists — the URL field is then ignored and disabled. */
  hasPhoto: boolean;
  imageUrlLink: string;
  onImageUrlChange: (text: string) => void;
  onImageUrlBlur?: () => void;
  onPicked: (uri: string, base64: string | null) => void;
  onRemove: () => void;
  /** Inline validation error (shown under the URL field). */
  error?: string;
  disabled?: boolean;
};

const PREVIEW_HEIGHT = 180;

/** The ref points at the image-URL `TextInput` so the form can focus it. */
export const ProductPhotoField = forwardRef<TextInput, ProductPhotoFieldProps>(function ProductPhotoField(
  { imageUri, hasPhoto, imageUrlLink, onImageUrlChange, onImageUrlBlur, onPicked, onRemove, error, disabled = false },
  ref
) {
  const toast = useToast();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const openSheet = useCallback(() => setSheetVisible(true), []);

  // Synchronous guard against a fast double-tap firing two overlapping
  // camera/gallery picker calls.
  const inFlightRef = useRef(false);

  const pickFromCamera = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (!(await requestCameraPermission())) return;
      const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
      if (!res.canceled) onPicked(res.assets[0].uri, res.assets[0].base64 || null);
    } catch (err) {
      if (__DEV__) console.warn("[add-products] pickFromCamera failed:", err);
      toast.show({ message: "Couldn't open camera. Please try again.", tone: "error" });
    } finally {
      inFlightRef.current = false;
    }
  }, [onPicked, toast]);

  const pickFromGallery = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 });
      if (!res.canceled) onPicked(res.assets[0].uri, res.assets[0].base64 || null);
    } catch (err) {
      if (__DEV__) console.warn("[add-products] pickFromGallery failed:", err);
      toast.show({ message: "Couldn't open gallery. Please try again.", tone: "error" });
    } finally {
      inFlightRef.current = false;
    }
  }, [onPicked, toast]);

  const options: ActionSheetOption[] = [
    { key: "camera", label: "Take photo", icon: "camera-outline", onPress: () => void pickFromCamera() },
    { key: "gallery", label: "Choose from gallery", icon: "images-outline", onPress: () => void pickFromGallery() },
  ];
  if (imageUri) {
    options.push({ key: "remove", label: "Remove photo", icon: "trash-outline", destructive: true, onPress: () => setConfirmRemove(true) });
  }

  return (
    <View style={styles.stack}>
      {imageUri ? (
        <View style={styles.imageBlock}>
          <Image source={{ uri: imageUri }} style={styles.image} accessibilityLabel="Product photo" accessibilityIgnoresInvertColors />
          <View style={styles.overlay}>
            <Pressable
              onPress={openSheet}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Change photo"
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [styles.overlayBtn, pressed && styles.overlayBtnPressed, disabled && styles.disabled]}
            >
              <Ionicons name="camera" size={16} color={colors.onPrimary} />
              <Text style={styles.overlayText}>Change</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmRemove(true)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [styles.overlayBtn, styles.overlayBtnDanger, pressed && styles.overlayBtnDangerPressed, disabled && styles.disabled]}
            >
              <Ionicons name="trash" size={16} color={colors.onPrimary} />
              <Text style={styles.overlayText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.picker, disabled && styles.disabled]}>
          <View style={styles.pickerButtons}>
            <Pressable
              onPress={openSheet}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              accessibilityHint="Opens the photo options"
              style={({ pressed }) => [styles.pickBtn, pressed && styles.pickBtnPressed]}
            >
              <Ionicons name="camera-outline" size={22} color={colors.primary} />
              <Text style={styles.pickBtnText}>Camera</Text>
            </Pressable>
            <View style={styles.pickDivider} />
            <Pressable
              onPress={openSheet}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Choose from gallery"
              accessibilityHint="Opens the photo options"
              style={({ pressed }) => [styles.pickBtn, pressed && styles.pickBtnPressed]}
            >
              <Ionicons name="images-outline" size={22} color={colors.primary} />
              <Text style={styles.pickBtnText}>Gallery</Text>
            </Pressable>
          </View>
          <Text style={styles.pickerLabel}>or use an image URL below</Text>
        </View>
      )}

      <TextField
        ref={ref}
        label="Image URL"
        placeholder="https://… paste URL if no photo"
        value={imageUrlLink}
        onChangeText={onImageUrlChange}
        onBlur={onImageUrlBlur}
        keyboardType="url"
        textContentType="URL"
        autoCapitalize="none"
        autoCorrect={false}
        disabled={disabled || hasPhoto}
        helper={hasPhoto ? "Your photo will be used instead of a link." : "Used only when no photo is added."}
        error={error}
        fieldStyle={styles.urlField}
        inputStyle={styles.urlInput}
      />

      <ActionSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} title="Product photo" options={options} />

      <ConfirmSheet
        visible={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        destructive
        title="Remove photo?"
        message="You'll need to retake or pick another photo to continue."
        confirmLabel="Remove"
        onConfirm={onRemove}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  disabled: { opacity: layout.disabledOpacity },

  // Preview + overlay bar
  imageBlock: { borderRadius: radius.lg, overflow: "hidden", position: "relative", backgroundColor: colors.surface },
  image: { width: "100%", height: PREVIEW_HEIGHT, borderRadius: radius.lg },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  overlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  overlayBtnPressed: { backgroundColor: "rgba(255,255,255,0.35)" },
  overlayBtnDanger: { backgroundColor: "rgba(239,68,68,0.45)", marginLeft: "auto" },
  overlayBtnDangerPressed: { backgroundColor: "rgba(239,68,68,0.7)" },
  overlayText: { color: colors.onPrimary, fontSize: 12, fontWeight: "600" },

  // Dashed picker box
  picker: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderStyle: "dashed",
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  pickerButtons: { flexDirection: "row", alignItems: "stretch" },
  pickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  pickBtnPressed: { backgroundColor: colors.primaryBg },
  pickBtnText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  pickDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  pickerLabel: { color: colors.textTertiary, fontSize: 11, textAlign: "center", paddingBottom: spacing.md, fontWeight: "500" },

  urlField: { backgroundColor: colors.surface },
  urlInput: { fontSize: 14, fontWeight: "500" },
});

export default ProductPhotoField;
