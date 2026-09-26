/**
 * Identity block at the top of Profile: 88dp owner avatar beside the store
 * name and two status badges (Online/Offline, Verification). The avatar is a
 * one-time KYC photo — once on file it shows a lock badge and cannot be
 * replaced from here; before that, in edit mode, tapping it opens the
 * caller's photo sheet.
 */
import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Badge, Card } from "../ui";
import { colors, iconSize, layout, radius, spacing, toneColors, typography } from "../../lib/theme";

export const PROFILE_AVATAR_SIZE = 88;
const BADGE_SIZE = 28;

export type ProfileHeroProps = {
  storeName: string;
  /** First letter of the owner's name — fallback when no photo is set. */
  ownerInitial: string;
  ownerImageUri: string | null;
  uploading?: boolean;
  /** Edit mode: the avatar is tappable while no photo is on file. */
  editing?: boolean;
  onPickPhoto?: () => void;
  /** `null` while the store row is unknown (badge hidden). */
  isActive: boolean | null;
  /** `null` while unknown (badge hidden). */
  approved: boolean | null;
};

export function ProfileHero({
  storeName,
  ownerInitial,
  ownerImageUri,
  uploading = false,
  editing = false,
  onPickPhoto,
  isActive,
  approved,
}: ProfileHeroProps) {
  const locked = Boolean(ownerImageUri);
  const canPick = editing && !locked && !uploading && Boolean(onPickPhoto);
  const avatarLabel = locked ? "Owner photo, verified" : uploading ? "Uploading owner photo" : "Add owner photo";
  const caption = !editing
    ? null
    : locked
      ? "Your photo is saved and can't be changed. Contact support if it needs updating."
      : uploading
        ? "Uploading your photo…"
        : "Tap the photo to add your owner photo";

  return (
    <Card>
      <View style={styles.row}>
        <Pressable
          onPress={canPick ? onPickPhoto : undefined}
          disabled={!canPick}
          accessibilityRole={canPick ? "button" : "image"}
          accessibilityLabel={avatarLabel}
          accessibilityState={{ disabled: !canPick, busy: uploading }}
          hitSlop={spacing.xs}
          style={({ pressed }) => [styles.avatarTouch, pressed && canPick && styles.pressed]}
        >
          <View style={styles.circle}>
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : ownerImageUri ? (
              <Image source={{ uri: ownerImageUri }} style={styles.image} accessibilityIgnoresInvertColors />
            ) : (
              <Text style={styles.initial}>{ownerInitial}</Text>
            )}
          </View>
          {locked && !uploading ? (
            <View style={[styles.badge, styles.badgeLocked]}>
              <Ionicons name="lock-closed-outline" size={iconSize.sm} color={colors.onPrimary} />
            </View>
          ) : canPick ? (
            <View style={[styles.badge, styles.badgeCamera]}>
              <Ionicons name="camera-outline" size={iconSize.sm} color={colors.onPrimary} />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={2} accessibilityRole="header">
            {storeName}
          </Text>
          <View style={styles.badges}>
            {isActive != null ? (
              <Badge label={isActive ? "Online" : "Offline"} tone={isActive ? "success" : "neutral"} dot />
            ) : null}
            {approved != null ? (
              <Badge
                label={approved ? "Verified" : "Verification pending"}
                tone={approved ? "success" : "warning"}
                icon={approved ? "shield-checkmark" : "time"}
              />
            ) : null}
          </View>
        </View>
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatarTouch: {
    width: PROFILE_AVATAR_SIZE,
    height: PROFILE_AVATAR_SIZE,
    borderRadius: radius.full,
  },
  pressed: { opacity: layout.disabledOpacity },
  circle: {
    width: PROFILE_AVATAR_SIZE,
    height: PROFILE_AVATAR_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  initial: { ...typography.display, color: colors.primary },
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
  // Neutral solid fill — the same token the neutral Badge dot uses.
  badgeLocked: { backgroundColor: toneColors("neutral").fill },
  text: { flex: 1, gap: spacing.sm },
  name: { ...typography.heading, color: colors.textPrimary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  caption: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md },
});

export default ProfileHero;
