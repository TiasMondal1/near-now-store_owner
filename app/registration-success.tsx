import React, { useCallback, useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EmptyState, Screen, TopBar } from "../components/ui";
import { colors, layout, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";

const DELAY_MS = 2500;

/** Confirms registration and moves on to pending verification (auto-advances after 2.5s). */
export default function RegistrationSuccessScreen() {
  const router = useRouter();
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const navigated = useRef(false);

  const goNext = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace("/pending-verification");
  }, [router]);

  useEffect(() => {
    const t = setTimeout(goNext, DELAY_MS);
    return () => clearTimeout(t);
  }, [goNext]);

  const columnWidth = Math.min(contentWidth, layout.maxFormWidth);

  return (
    <Screen>
      {/* No onBack: the flow must not return to the submitted form. */}
      <TopBar overline="Step 3 of 3" title="Registration complete" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        bounces={false}
      >
        <View style={[styles.column, { width: columnWidth }]}>
          <EmptyState
            icon="checkmark-outline"
            title="Thanks for registering with Near & Now"
            message="Next, upload your shop documents and add your bank details. Your store goes live once we've verified them."
            action={{ label: "View verification steps", onPress: goNext }}
          />
          <Text style={styles.caption}>Taking you to the next step automatically.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", paddingTop: spacing.lg },
  column: { alignSelf: "center", gap: spacing.sm },
  caption: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
