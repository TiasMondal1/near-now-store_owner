/**
 * First-load placeholder for Profile, shaped like the hero and the cards
 * below it.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Skeleton } from "../ui";
import { radius, spacing } from "../../lib/theme";
import { PROFILE_AVATAR_SIZE } from "./ProfileHero";

export function ProfileSkeleton() {
  return (
    <>
      <Card>
        <View style={styles.hero}>
          <Skeleton.Box width={PROFILE_AVATAR_SIZE} height={PROFILE_AVATAR_SIZE} radius={radius.full} />
          <View style={styles.heroText}>
            <Skeleton.Text lines={2} />
          </View>
        </View>
      </Card>
      <Skeleton.Card lines={3} />
      <Skeleton.Card lines={4} />
      <Skeleton.Card lines={2} />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  heroText: { flex: 1 },
});

export default ProfileSkeleton;
