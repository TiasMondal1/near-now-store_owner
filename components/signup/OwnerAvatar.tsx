/**
 * 88dp owner-photo uploader. Shows the picked/uploaded image, a placeholder
 * glyph, or a spinner while uploading; a small camera badge invites a tap and
 * a lock badge marks a photo that can no longer be changed. Tapping is the
 * caller's business (it opens an `ActionSheet`).
 */
import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, layout, radius, spacing, typography } from "../../lib/theme";

export const OWNER_AVATAR_SIZE = 88;
const BADGE_SIZE = 28;

export type OwnerAvatarProps = {
  uri: string | null;
  uploading?: boolean;
  /** A photo is on file and cannot be replaced from this screen. */
  locked?: boolean;
  /** Caption under the avatar (e.g. "Add your photo (optional)"). */
  caption?: string;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function OwnerAvatar({
  uri,
  uploading = false,
  locked = false,
  caption,
  onPress,
  disabled = false,
  accessibilityLabel,
}: OwnerAvatarProps) {
  const inactive = disabled || locked || uploading;
  const label =
    accessibilityLabel ?? (locked ? "Owner photo, locked" : uri ? "Owner photo, tap to change" : "Add owner photo");

  return (
    <View style={styles.root}>
      <Pressable
        onPress={onPress}
        disabled={inactive || !onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inactive, busy: uploading }}
        hitSlop={spacing.xs}
        style={({ pressed }) => [styles.touch, pressed && !inactive && styles.pressed]}
      >
        <View style={styles.circle}>
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : uri ? (
            <Image source={{ uri }} style={styles.image} accessibilityIgnoresInvertColors />
          ) : (
            <Ionicons name="person-outline" size={iconSize.xl} color={colors.primary} />
          )}
        </View>
        <View style={[styles.badge, locked ? styles.badgeLocked : styles.badgeCamera]}>
          <Ionicons name={locked ? "lock-closed-outline" : "camera-outline"} size={iconSize.sm} color={colors.onPrimary} />
        </View>
      </Pressable>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", gap: spacing.sm },
  touch: {
    width: OWNER_AVATAR_SIZE,
    height: OWNER_AVATAR_SIZE,
    borderRadius: radius.full,
  },
  pressed: { opacity: layout.disabledOpacity },
  circle: {
    width: OWNER_AVATAR_SIZE,
    height: OWNER_AVATAR_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeCamera: { backgroundColor: colors.primary },
  badgeLocked: { backgroundColor: colors.textMuted },
  caption: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});

export default OwnerAvatar;
