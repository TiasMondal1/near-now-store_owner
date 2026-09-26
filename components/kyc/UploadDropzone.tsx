import React from "react";
import { ActivityIndicator, Image, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";

export type UploadDropzoneState = "empty" | "preview" | "pdf" | "saving" | "uploaded";

export type UploadDropzoneProps = {
  /** Human name of the file slot, e.g. "Aadhaar card (front)" — used for copy and the spoken label. */
  label: string;
  /**
   * `empty` — nothing picked or saved; `preview` — a staged (not yet saved)
   * image; `pdf` — a staged or saved PDF; `saving` — this slot is uploading;
   * `uploaded` — a saved image from the server.
   */
  state: UploadDropzoneState;
  /** Image uri for `preview` / `uploaded`. */
  previewUri?: string | null;
  /** File name for `pdf`. */
  fileName?: string | null;
  /** Optional meta shown in the footer strip (e.g. "340 KB"). */
  meta?: string | null;
  /** Caption inside the empty state, e.g. accepted formats. */
  hint?: string;
  /** Marks a PDF as staged (not yet saved) so the footer reads "Ready to save". */
  staged?: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Width / height. Default 2 (e.g. 328×164 on a phone). */
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const STATE_DESCRIPTION: Record<UploadDropzoneState, string> = {
  empty: "not uploaded",
  preview: "ready to save",
  pdf: "PDF selected",
  saving: "saving",
  uploaded: "uploaded",
};

/**
 * Tappable file slot. Empty = dashed drop area; filled = image preview or PDF
 * chip with a solid footer strip carrying the status and a "Change" affordance.
 * The parent opens an `ActionSheet` from `onPress`.
 */
export function UploadDropzone({
  label,
  state,
  previewUri,
  fileName,
  meta,
  hint,
  staged = false,
  onPress,
  disabled = false,
  aspectRatio = 2,
  style,
  testID,
}: UploadDropzoneProps) {
  const filled = state !== "empty" && state !== "saving";
  const busy = state === "saving";
  const isDisabled = disabled || busy;

  const statusText =
    state === "preview" || (state === "pdf" && staged) ? "Ready to save" : state === "uploaded" || state === "pdf" ? "Uploaded" : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${STATE_DESCRIPTION[state]}`}
      accessibilityHint={filled ? "Opens options to change or remove this file" : "Opens options to take a photo, choose from gallery or choose a file"}
      accessibilityState={{ disabled: isDisabled, busy }}
      testID={testID}
      style={({ pressed }) => [
        styles.box,
        { aspectRatio },
        filled ? styles.boxFilled : styles.boxEmpty,
        pressed && !isDisabled && (filled ? styles.boxFilledPressed : styles.boxEmptyPressed),
        disabled && !busy && styles.disabled,
        style,
      ]}
    >
      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.caption}>Saving…</Text>
        </View>
      ) : state === "pdf" ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={iconSize.xl} color={colors.primary} />
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName || "Document.pdf"}
          </Text>
        </View>
      ) : filled && previewUri ? (
        <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.center}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-upload-outline" size={iconSize.lg} color={colors.primary} />
          </View>
          <Text style={styles.emptyLabel} numberOfLines={1}>
            Upload {label}
          </Text>
          {hint ? <Text style={styles.caption}>{hint}</Text> : null}
        </View>
      )}

      {filled && !busy ? (
        <View style={styles.footer}>
          <View style={styles.footerText}>
            {statusText ? (
              <Text style={styles.footerStatus} numberOfLines={1}>
                {statusText}
              </Text>
            ) : null}
            {meta ? (
              <Text style={styles.footerMeta} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          <View style={styles.change}>
            <Ionicons name="camera-outline" size={iconSize.sm} color={colors.onPrimary} />
            <Text style={styles.changeText}>Change</Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    justifyContent: "center",
  },
  boxEmpty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceVariant,
  },
  boxEmptyPressed: { backgroundColor: colors.primaryBg },
  boxFilled: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceVariant,
  },
  boxFilledPressed: { borderColor: colors.primary },
  disabled: { opacity: layout.disabledOpacity },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.lg },
  iconCircle: {
    width: layout.fieldHeight,
    height: layout.fieldHeight,
    borderRadius: radius.full,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyLabel: { ...typography.bodyStrong, color: colors.primary, textAlign: "center" },
  caption: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  fileName: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: "center", maxWidth: "100%" },
  preview: { ...StyleSheet.absoluteFillObject },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    // Solid dark strip (as Toast) so onPrimary text keeps its contrast over
    // any user photo — a translucent scrim cannot guarantee it on light images.
    backgroundColor: colors.textPrimary,
  },
  footerText: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footerStatus: { ...typography.labelStrong, color: colors.onPrimary },
  footerMeta: { ...typography.label, color: colors.onPrimary },
  change: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  changeText: { ...typography.labelStrong, color: colors.onPrimary },
});

export default UploadDropzone;
