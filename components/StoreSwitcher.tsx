/**
 * Store switcher — multi-store ownership (2026-10-02).
 *
 * A tappable "current store" control that opens a sheet listing every store
 * the owner has (with its status) plus "Add a new store". Picking a store
 * writes the choice through lib/selectedStore.ts, which every screen, the
 * approval gate and the orders feed listen to, then lands the owner in the
 * right place: Home for an approved store, the verification Status screen for
 * one still being set up.
 *
 * `variant="header"` renders as the big store name on Home; `variant="bar"`
 * is a compact row for the verification screens, so an owner working on a new
 * store can always get back to an approved one.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { getSession } from "../session";
import { fetchStoresCached, peekStoresAny, type CachedStore } from "../lib/appCache";
import {
  MAX_STORES_PER_OWNER,
  loadSelectedStoreId,
  peekSelectedStoreId,
  pickSelectedStore,
  setSelectedStoreId,
  storeStatus,
  subscribeSelectedStore,
} from "../lib/selectedStore";
import { colors, spacing, typography } from "../lib/theme";
import { Badge, BottomSheet, ListRow } from "./ui";

export type StoreSwitcherProps = {
  variant: "header" | "bar";
  /** Header variant: text style for the store name (keeps Home's typography). */
  nameStyle?: object;
};

export function StoreSwitcher({ variant, nameStyle }: StoreSwitcherProps) {
  const [stores, setStores] = useState<CachedStore[]>(() => peekStoresAny() ?? []);
  const [selectedId, setSelected] = useState<string | null>(() => peekSelectedStoreId() ?? null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    const session = await getSession();
    if (!session?.token) return;
    try {
      const list = await fetchStoresCached(session.token, session.user?.id);
      setStores(list);
    } catch {
      // keep what we have
    }
    setSelected(await loadSelectedStoreId());
  }, []);

  useEffect(() => {
    void reload();
    return subscribeSelectedStore((id) => {
      setSelected(id);
      setStores(peekStoresAny() ?? []);
    });
  }, [reload]);

  const current = pickSelectedStore(stores, selectedId);
  const canAdd = stores.length < MAX_STORES_PER_OWNER;
  const multi = stores.length > 1;

  const choose = async (store: CachedStore) => {
    setOpen(false);
    if (store.id === current?.id) return;
    await setSelectedStoreId(store.id);
    router.replace(store.is_approved ? "/(tabs)/home" : "/pending-verification");
  };

  const openSheet = () => {
    // Refresh statuses each time the sheet opens (an admin may have approved
    // a pending store since).
    void reload();
    setOpen(true);
  };

  const sheet = (
    <BottomSheet visible={open} onClose={() => setOpen(false)} title="Your stores" scrollable accessibilityLabel="Your stores">
      {stores.map((s) => {
        const status = storeStatus(s);
        const isCurrent = s.id === current?.id;
        return (
          <ListRow
            key={s.id}
            icon={isCurrent ? "checkmark-circle" : "storefront-outline"}
            iconTile
            title={s.name || "Unnamed store"}
            description={s.address || undefined}
            trailing={<Badge label={status.label} tone={status.tone} size="sm" />}
            onPress={() => void choose(s)}
            showSeparator
            accessibilityLabel={`${s.name}, ${status.label}${isCurrent ? ", current store" : ""}`}
            testID={`store-switcher-row-${s.id}`}
          />
        );
      })}
      <ListRow
        icon="add-circle-outline"
        iconTile
        title="Add a new store"
        description={
          canAdd
            ? "Each store is verified separately before it can take orders."
            : `You've reached the limit of ${MAX_STORES_PER_OWNER} stores. Contact support if you need more.`
        }
        disabled={!canAdd}
        onPress={() => {
          setOpen(false);
          router.push("/add-store");
        }}
        chevron={canAdd}
        testID="store-switcher-add"
      />
    </BottomSheet>
  );

  if (variant === "header") {
    return (
      <>
        <Pressable
          onPress={openSheet}
          style={styles.headerRow}
          accessibilityRole="button"
          accessibilityLabel={`${current?.name || "My Store"}. Switch store`}
          accessibilityHint="Opens your list of stores"
          testID="store-switcher-header"
        >
          <Text style={[styles.headerName, nameStyle]} numberOfLines={1} ellipsizeMode="tail">
            {current?.name || "My Store"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
        </Pressable>
        {sheet}
      </>
    );
  }

  // Bar variant: only useful once there's somewhere else to go.
  if (!multi) return null;
  return (
    <>
      <Pressable
        onPress={openSheet}
        style={styles.bar}
        accessibilityRole="button"
        accessibilityLabel={`Setting up ${current?.name || "this store"}. Switch store`}
        testID="store-switcher-bar"
      >
        <Ionicons name="storefront-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.barText} numberOfLines={1}>
          {current?.name || "This store"}
        </Text>
        <Text style={styles.barAction}>Switch store</Text>
      </Pressable>
      {sheet}
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2, alignSelf: "flex-start", maxWidth: "100%" },
  headerName: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, flexShrink: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  barText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  barAction: { ...typography.caption, color: colors.primary, fontWeight: "600" },
});

export default StoreSwitcher;
