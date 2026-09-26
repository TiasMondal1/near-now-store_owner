/**
 * Add products — stack screen. Browse the Near&Now catalog and add with one
 * tap, or submit a custom product for review, behind the old "From catalog /
 * Custom product" toggle. Both panels stay mounted so search, pagination and
 * half-typed form state survive switching. The custom form's submit button
 * lives in a StickyFooter here (same placement as Billing's "Submit for
 * review" and Documents' "Save").
 */
import React, { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, IconButton, Screen, StickyFooter } from "../components/ui";
import {
  CatalogPanel,
  CustomProductPanel,
  ViewToggle,
  type CustomProductFooterState,
  type CustomProductPanelHandle,
  type Measurable,
} from "../components/add-products";
import { useSelectedStore } from "../lib/useSelectedStore";
import { colors, layout, radius, shadows, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";
import { goBackOr, useHardwareBackTo } from "../lib/navigation";
import { useRequireStoreApproval } from "../lib/useRequireStoreApproval";

type AddView = "catalog" | "custom";

/** Content offset past which the scroll-to-top control appears. */
const SCROLL_TOP_THRESHOLD = 400;

const INITIAL_FOOTER: CustomProductFooterState = { canSubmit: false, saving: false, hint: null, token: undefined };

const VIEW_ITEMS = [
  { key: "catalog", label: "From catalog", icon: "list-outline" },
  { key: "custom", label: "Custom product", icon: "add-circle-outline" },
] as const;

export default function AddProductsScreen() {
  useRequireStoreApproval();
  useHardwareBackTo("/(tabs)/stock");
  const { gutter, contentWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const paddingBottom = useBottomPadding();
  const { session, storeId, loading: storeLoading, retry } = useSelectedStore();

  const [view, setView] = useState<AddView>("catalog");
  // Bumped after a custom submission so the catalog re-fetches its store map.
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const onAdded = useCallback(() => setInventoryRefreshKey((k) => k + 1), []);

  // Custom form → footer: the panel owns the form; the footer button here
  // drives it through the handle and mirrors its enabled / busy / hint state.
  const customRef = useRef<CustomProductPanelHandle>(null);
  const [footer, setFooter] = useState<CustomProductFooterState>(INITIAL_FOOTER);
  const submitCustom = useCallback(() => customRef.current?.submit(), []);
  const showFirstInvalid = useCallback(() => customRef.current?.focusFirstInvalid(), []);

  // ── Scroll tracking: only set state when the boolean actually flips ──
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const showTopRef = useRef(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollYRef.current = y;
    const next = y > SCROLL_TOP_THRESHOLD;
    if (next !== showTopRef.current) {
      showTopRef.current = next;
      setShowScrollTop(next);
    }
  }, []);
  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), []);

  // Bring a field/section near the top of the viewport (first-invalid focus).
  // The ScrollView fills `scrollHostRef`, so the host's window position is the
  // viewport top; node offset within content = current offset + (node − host).
  const scrollHostRef = useRef<View>(null);
  const scrollToView = useCallback((node: Measurable) => {
    const scroll = scrollRef.current;
    const host = scrollHostRef.current;
    if (!scroll || !host) return;
    node.measureInWindow((_x, nodeY) => {
      host.measureInWindow((_hx, hostY) => {
        const target = scrollYRef.current + (nodeY - hostY) - spacing.lg;
        scroll.scrollTo({ y: Math.max(0, target), animated: true });
      });
    });
  }, []);

  const footerVisible = view === "custom";

  return (
    <Screen keyboardAvoiding>
      {/* Header bar (old Inventory header look: 18/800 title, 11px subtitle, 1px rule) */}
      <View style={[styles.topBar, { paddingHorizontal: gutter - spacing.sm }]}>
        <IconButton icon="arrow-back-outline" accessibilityLabel="Go back" onPress={() => goBackOr("/(tabs)/stock")} />
        <View style={styles.titleWrap}>
          <View style={styles.titleRow}>
            <Ionicons name="cube-outline" size={24} color={colors.primary} />
            <View style={styles.flex}>
              <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
                Add products
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Catalog &amp; custom products
              </Text>
            </View>
          </View>
        </View>
        <Button
          label="My submissions"
          variant="text"
          size="sm"
          onPress={() => router.push("/product-submissions")}
          accessibilityHint="Opens your custom product submissions"
        />
      </View>

      <View ref={scrollHostRef} style={styles.flex} collapsable={false}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingHorizontal: gutter, paddingBottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <View style={[styles.column, { width: contentWidth }]}>
            <ViewToggle<AddView> items={VIEW_ITEMS} value={view} onChange={setView} accessibilityLabel="How to add products" />

            {/* Both panels stay mounted; the inactive one is hidden with display:none
                so catalog pages, search and the half-filled form survive switching. */}
            <View style={view === "catalog" ? undefined : styles.hidden}>
              <CatalogPanel
                storeId={storeId}
                storeReady={!storeLoading}
                token={session?.token}
                refreshKey={inventoryRefreshKey}
                onRetryStore={retry}
              />
            </View>
            <View style={view === "custom" ? undefined : styles.hidden}>
              <CustomProductPanel ref={customRef} onAdded={onAdded} scrollToView={scrollToView} onFooterStateChange={setFooter} />
            </View>
          </View>
        </ScrollView>

        {/* Inside the scroll host so it floats above the footer, never over it. */}
        {showScrollTop ? (
          <Pressable
            onPress={scrollToTop}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Scroll to top"
            style={({ pressed }) => [styles.fab, { right: gutter, bottom: (footerVisible ? 0 : insets.bottom) + spacing.xl }, pressed && styles.fabPressed]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.surface} />
          </Pressable>
        ) : null}
      </View>

      {footerVisible ? (
        <StickyFooter>
          {footer.token === null ? (
            <Text style={styles.footerHint}>Log in again to submit a product.</Text>
          ) : footer.token === undefined ? (
            <Text style={styles.footerHint}>Checking your login…</Text>
          ) : footer.hint ? (
            <View style={styles.hintRow}>
              <Text style={[styles.footerHint, styles.flex, styles.hintLeft]} accessibilityLiveRegion="polite">
                {footer.hint}
              </Text>
              <Button label="Show me" variant="text" size="sm" onPress={showFirstInvalid} accessibilityHint="Jumps to the first field that needs attention" />
            </View>
          ) : (
            <Text style={styles.footerHint}>Reviewed by the Near&amp;Now team before it appears in your store.</Text>
          )}
          <Button
            label="Submit for review"
            size="lg"
            fullWidth
            leftIcon="checkmark-circle-outline"
            loading={footer.saving}
            disabled={!footer.canSubmit}
            onPress={submitCustom}
            accessibilityHint={footer.hint ?? undefined}
            style={footer.canSubmit ? styles.submit : styles.submitDisabled}
          />
        </StickyFooter>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.lg, alignItems: "center" },
  column: { gap: spacing.lg },
  hidden: { display: "none" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: layout.topBarHeightWithSubtitle,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: spacing.sm,
  },
  titleWrap: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: colors.textTertiary, fontSize: 11, marginTop: -2 },

  fab: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  fabPressed: { backgroundColor: colors.primaryDark },

  submit: { borderRadius: radius.lg, ...shadows.md },
  submitDisabled: { borderRadius: radius.lg },
  footerHint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  hintLeft: { textAlign: "left" },
  hintRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
