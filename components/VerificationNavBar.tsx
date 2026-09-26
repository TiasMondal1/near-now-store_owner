import React, { useCallback } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { router } from "expo-router";
import { SegmentedControl, type SegmentItem } from "./ui";
import { colors, spacing } from "../lib/theme";
import { useLayout } from "../lib/useLayout";

type TabKey = "details" | "status" | "documents" | "billing";
type TabRoute = "/store-owner-signup" | "/pending-verification" | "/upload-documents" | "/billing-info";

/**
 * Flow order: Details → Documents → Billing → Status. The Status tab is last
 * because it summarises the other three.
 */
const TABS: readonly (SegmentItem<TabKey> & { route: TabRoute })[] = [
  { key: "details", label: "Details", route: "/store-owner-signup" },
  { key: "documents", label: "Documents", route: "/upload-documents" },
  { key: "billing", label: "Billing", route: "/billing-info" },
  { key: "status", label: "Status", route: "/pending-verification" },
];

const ITEMS: readonly SegmentItem<TabKey>[] = TABS.map(({ key, label }) => ({ key, label }));

export type VerificationNavBarProps = {
  active: TabKey;
  style?: StyleProp<ViewStyle>;
};

/**
 * Lets a shopkeeper who has completed signup (but isn't yet verified) freely
 * jump between their submitted details, document uploads, billing details
 * and verification status. Tabs `router.replace` so the stack stays flat;
 * tapping the active tab is a no-op. Only rendered post-signup, and only
 * while the store is still unapproved — the bar pads itself so it can sit
 * fixed directly under a `TopBar`.
 */
export default function VerificationNavBar({ active, style }: VerificationNavBarProps) {
  const { gutter } = useLayout();

  const handleChange = useCallback(
    (key: TabKey) => {
      if (key === active) return;
      const tab = TABS.find((t) => t.key === key);
      if (tab) router.replace(tab.route);
    },
    [active]
  );

  return (
    <View style={[styles.bar, { paddingHorizontal: gutter }]}>
      <SegmentedControl<TabKey>
        items={ITEMS}
        value={active}
        onChange={handleChange}
        size="sm"
        accessibilityLabel="Verification steps"
        style={style}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.background,
    paddingTop: spacing.md,
  },
});
