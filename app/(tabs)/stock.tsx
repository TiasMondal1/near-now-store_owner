/**
 * Inventory tab — the owner's own stock: the searchable Packaged / Loose card
 * (components/stock) with availability switches, per-row remove and the
 * per-section "Remove all". Adding products lives on the /add-products stack
 * screen, reached from the header button.
 */
import React, { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { ErrorState, Screen } from "../../components/ui";
import { StockList, type StockListHandle } from "../../components/stock";
import { useSelectedStore } from "../../lib/useSelectedStore";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { useBottomPadding, useLayout } from "../../lib/useLayout";
import { useRequireStoreApproval } from "../../lib/useRequireStoreApproval";

export default function StockTab() {
  useRequireStoreApproval();
  const isFocused = useIsFocused();
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const { session, store, loading, retry } = useSelectedStore();

  const stockRef = useRef<StockListHandle>(null);
  const openAddProducts = useCallback(() => router.push("/add-products"), []);

  // Pull-to-refresh: silent stock refetch (keeps rows visible, never raises `error`).
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await stockRef.current?.refresh(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const storeMissing = !loading && !store;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={[styles.column, { paddingHorizontal: gutter }]}>
          <View style={{ width: contentWidth }}>
            {/* Header (old Inventory screen header) */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="cube-outline" size={24} color={colors.primary} />
                <View>
                  <Text style={styles.brand} accessibilityRole="header">
                    Inventory
                  </Text>
                  <Text style={styles.subtitle}>Your stock &amp; availability</Text>
                </View>
              </View>
              <Pressable
                onPress={openAddProducts}
                accessibilityRole="button"
                accessibilityLabel="Add products"
                accessibilityHint="Opens the catalog"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.onPrimary} />
                <Text style={styles.addBtnText}>Add products</Text>
              </Pressable>
            </View>

            <View style={styles.sections}>
              {storeMissing ? (
                <ErrorState
                  icon="cloud-offline-outline"
                  title="Couldn't load your store"
                  message="Check your connection and try again."
                  action={{ onPress: retry }}
                />
              ) : (
                <StockList
                  ref={stockRef}
                  variant="full"
                  storeId={store?.id}
                  token={session?.token}
                  storeActive={!!store?.is_active}
                  enabled={isFocused}
                  onAddProducts={openAddProducts}
                />
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: "center", paddingTop: spacing.lg },
  sections: { gap: spacing.xl },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  brand: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: colors.textTertiary, fontSize: 11, marginTop: -2 },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    ...shadows.md,
  },
  addBtnPressed: { backgroundColor: colors.primaryDark },
  addBtnText: { color: colors.onPrimary, fontSize: 13, fontWeight: "700" },
});
