import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActionSheet, ConfirmSheet, EmptyState, ErrorState, InlineNotice, SearchField, Skeleton, useToast } from "../ui";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { useStoreStock, type StockProduct } from "../../lib/useStoreStock";
import { StockRow } from "./StockRow";
import { StockSummaryCard } from "./StockSummaryCard";

export type StockListVariant = "full" | "compact";
type StockTab = "packaged" | "loose";

export type StockListProps = {
  storeId: string | null | undefined;
  token: string | null | undefined;
  /** Store is online. Availability switches are locked (with a visible hint) while offline. */
  storeActive: boolean;
  /** Gates the 15s/30s safety-net poll — pass the host screen's `useIsFocused()`. */
  enabled: boolean;
  /** `full` = searchable Packaged/Loose card (Inventory tab). `compact` = Home summary card. Default `full`. */
  variant?: StockListVariant;
  /**
   * "Add products" CTA of the empty state. Compact defaults to opening the
   * Add products screen (/add-products); full hides the CTA when omitted.
   */
  onAddProducts?: () => void;
};

/** Imperative handle so a host screen can fold a refetch into its own flows (pull-to-refresh, post-toggle). */
export type StockListHandle = {
  /** `refresh(true)` is a silent background refetch (no spinner, never raises `error`). */
  refresh: (silent?: boolean) => Promise<void>;
};

const SEARCH_DEBOUNCE_MS = 200;
const SECTION_LABEL: Record<StockTab, string> = { packaged: "packaged", loose: "loose" };

/**
 * The owner's stock, driven by `useStoreStock`, in the old "Your Stock" card
 * look: card header with the product count and a search toggle, the
 * Packaged / Loose segmented buttons, image rows with availability switches
 * and outlined remove buttons. Non-scrolling: the host screen provides the
 * ScrollView. Props/behaviour are documented on `StockListProps` above and in
 * lib/useStoreStock.ts.
 */
export const StockList = forwardRef<StockListHandle, StockListProps>(function StockList(
  { storeId, token, storeActive, enabled, variant = "full", onAddProducts },
  ref
) {
  const stock = useStoreStock({ storeId, token, enabled });
  const { products, loading, error, refreshError, refresh, toggleActive, removeProduct, removeAll, togglingProductId } = stock;
  const toast = useToast();

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  // ── Search (200ms debounce; clearing cancels the timer and resets both values) ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), SEARCH_DEBOUNCE_MS);
  }, []);
  const handleClear = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setQuery("");
    setDebouncedQuery("");
  }, []);
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);
  // Closing the search toggle cancels the debounce and clears the query.
  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (open) handleClear();
      return !open;
    });
  }, [handleClear]);
  // The toggle is only offered while there is a populated list to search; if
  // the list empties (cold reload, failure, last product removed) it closes too.
  const searchAvailable = products.length > 0;
  useEffect(() => {
    if (!searchAvailable) {
      setSearchOpen(false);
      handleClear();
    }
  }, [searchAvailable, handleClear]);

  const [tab, setTab] = useState<StockTab>("packaged");

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [products, debouncedQuery]);
  const filteredPackaged = useMemo(() => filtered.filter((p) => !p.is_loose), [filtered]);
  const filteredLoose = useMemo(() => filtered.filter((p) => p.is_loose), [filtered]);
  const section = tab === "packaged" ? filteredPackaged : filteredLoose;
  const searchActive = debouncedQuery.trim().length > 0;
  const emptyText = searchActive
    ? `No ${SECTION_LABEL[tab]} products match "${query.trim()}"`
    : tab === "packaged"
      ? "No packaged products yet"
      : "No loose products yet";

  // ── Toggle ──
  const handleToggle = useCallback(
    (product: StockProduct) => {
      toggleActive(product).then((ok) => {
        if (!ok) toast.show({ message: `Couldn't update ${product.name}`, tone: "error" });
      });
    },
    [toggleActive, toast]
  );

  // ── Remove one (trash button / long-press → ConfirmSheet) ──
  const [removeTarget, setRemoveTarget] = useState<StockProduct | null>(null);
  const [removeVisible, setRemoveVisible] = useState(false);
  const askRemove = useCallback((product: StockProduct) => {
    setRemoveTarget(product);
    setRemoveVisible(true);
  }, []);
  const confirmRemove = useCallback(async () => {
    if (!removeTarget) return;
    await removeProduct(removeTarget);
    toast.show({ message: "Product removed", tone: "success" });
  }, [removeTarget, removeProduct, toast]);

  // ── Remove all in section ("Remove all" link → ActionSheet → ConfirmSheet) ──
  const [menuVisible, setMenuVisible] = useState(false);
  const [removeAllVisible, setRemoveAllVisible] = useState(false);
  const sectionCount = section.length;
  const confirmRemoveAll = useCallback(async () => {
    const list = section;
    if (list.length === 0) return;
    await removeAll(list);
    toast.show({ message: `${list.length} product${list.length === 1 ? "" : "s"} removed`, tone: "success" });
  }, [section, removeAll, toast]);

  const openAddProducts = useCallback(() => {
    if (onAddProducts) onAddProducts();
    else router.push("/add-products");
  }, [onAddProducts]);
  const openInventory = useCallback(() => router.push("/(tabs)/stock"), []);
  const retry = useCallback(() => {
    refresh(false);
  }, [refresh]);
  const retrySilent = useCallback(() => {
    refresh(true);
  }, [refresh]);

  if (variant === "compact") {
    return (
      <StockSummaryCard
        products={products}
        loading={loading}
        error={error}
        storeActive={storeActive}
        onRetry={retry}
        onManage={openInventory}
        onAddProducts={openAddProducts}
      />
    );
  }

  // ── Full variant ──
  const cold = loading && products.length === 0;
  const failedCold = error && products.length === 0;
  const empty = !cold && !failedCold && products.length === 0;
  const total = products.length;

  let content: React.ReactNode;
  if (cold) {
    content = <Skeleton.ListRow count={6} inset />;
  } else if (failedCold) {
    content = (
      <ErrorState
        compact
        icon="cloud-offline-outline"
        title="Couldn't load your inventory"
        message="Check your connection and try again."
        action={{ onPress: retry, loading }}
      />
    );
  } else if (empty) {
    content = (
      <EmptyState
        compact
        icon="cube-outline"
        title="No products yet"
        message="Add items from the catalog to start selling."
        action={onAddProducts ? { label: "Add products", onPress: openAddProducts } : undefined}
      />
    );
  } else {
    content = (
      <>
        {searchOpen ? (
          <SearchField
            value={query}
            onChangeText={handleQueryChange}
            onClear={handleClear}
            placeholder="Search products..."
            accessibilityLabel="Search products"
            fieldStyle={styles.searchField}
            containerStyle={styles.searchContainer}
            autoFocus
          />
        ) : null}

        {/* Packaged / Loose segmented buttons (old "Your Stock" tab bar) */}
        <View style={styles.tabRow} accessibilityRole="tablist" accessibilityLabel="Product type">
          {(
            [
              { key: "packaged", label: "Packaged", icon: "pricetag-outline", count: filteredPackaged.length },
              { key: "loose", label: "Loose", icon: "scale-outline", count: filteredLoose.length },
            ] as const
          ).map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${item.label}, ${item.count} product${item.count === 1 ? "" : "s"}`}
                style={({ pressed }) => [styles.tabBtn, active && styles.tabBtnActive, pressed && !active && styles.tabBtnPressed]}
              >
                <Ionicons name={item.icon} size={14} color={active ? colors.onPrimary : colors.textSecondary} />
                <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]} numberOfLines={1}>
                  {item.label} ({item.count})
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          {sectionCount > 0 ? (
            <View style={styles.sectionHeader}>
              <Pressable
                onPress={() => setMenuVisible(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove all ${SECTION_LABEL[tab]} products`}
                accessibilityHint={`Actions for ${SECTION_LABEL[tab]} products`}
                style={({ pressed }) => [styles.removeAllBtn, pressed && styles.removeAllBtnPressed]}
              >
                <Ionicons name="trash-outline" size={13} color={colors.error} />
                <Text style={styles.removeAllText}>Remove all</Text>
              </Pressable>
            </View>
          ) : null}
          {sectionCount === 0 ? (
            <Text style={styles.sectionEmptyText}>{emptyText}</Text>
          ) : (
            <View style={styles.rows}>
              {section.map((p, i) => (
                <StockRow
                  key={p.id}
                  product={p}
                  storeActive={storeActive}
                  toggling={togglingProductId === p.id}
                  showSeparator={i < section.length - 1}
                  onToggle={handleToggle}
                  onRemove={askRemove}
                />
              ))}
            </View>
          )}
        </View>
      </>
    );
  }

  return (
    <View style={styles.stack}>
      {refreshError && products.length > 0 ? (
        <InlineNotice tone="warning" title="Couldn't refresh" message="Showing saved data" action={{ label: "Retry", onPress: retrySilent }} />
      ) : null}
      {!storeActive && products.length > 0 ? (
        <InlineNotice tone="warning" icon="power-outline" title="Go online to change availability" message="Product switches are locked while your store is offline." />
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              Your Stock
            </Text>
            <Text style={styles.cardSub}>
              {total} product{total !== 1 ? "s" : ""} in store
            </Text>
          </View>
          {searchAvailable ? (
            <Pressable
              onPress={toggleSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={searchOpen ? "Close search" : "Search products"}
              accessibilityState={{ expanded: searchOpen }}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Ionicons name={searchOpen ? "close" : "search"} size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {content}
      </View>

      <ActionSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title={tab === "packaged" ? "Packaged products" : "Loose products"}
        options={[
          {
            key: "remove-all",
            label: `Remove all ${SECTION_LABEL[tab]} products`,
            description: searchActive
              ? `${sectionCount} matching product${sectionCount === 1 ? "" : "s"}`
              : `${sectionCount} product${sectionCount === 1 ? "" : "s"}`,
            icon: "trash-outline",
            destructive: true,
            onPress: () => setRemoveAllVisible(true),
          },
        ]}
      />

      <ConfirmSheet
        visible={removeVisible}
        onClose={() => setRemoveVisible(false)}
        destructive
        title="Remove product?"
        message={removeTarget ? `"${removeTarget.name}" will be removed from your store. This can't be undone.` : undefined}
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        fallbackErrorMessage="Couldn't remove this product. Please try again."
      />

      <ConfirmSheet
        visible={removeAllVisible}
        onClose={() => setRemoveAllVisible(false)}
        destructive
        title={`Remove all ${SECTION_LABEL[tab]} products?`}
        message={`${sectionCount} product${sectionCount === 1 ? "" : "s"} will be removed from your store. This can't be undone.`}
        confirmLabel="Remove all"
        onConfirm={confirmRemoveAll}
        fallbackErrorMessage="Couldn't remove these products. Please try again."
      />
    </View>
  );
});

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  flex: { flex: 1 },

  // Stock card (old Home "Your Stock" card)
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  cardSub: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPressed: { backgroundColor: colors.border },

  // Search
  searchContainer: { marginBottom: spacing.md },
  searchField: { backgroundColor: colors.background, borderRadius: radius.sm },

  // Packaged / Loose tab bar
  tabRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabBtnPressed: { backgroundColor: colors.border },
  tabBtnText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  tabBtnTextActive: { color: colors.onPrimary },

  // Section (Packaged / Loose box)
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginBottom: spacing.xs },
  removeAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  removeAllBtnPressed: { backgroundColor: colors.errorBg },
  removeAllText: { fontSize: 11, fontWeight: "600", color: colors.error },
  sectionEmptyText: { fontSize: 13, color: colors.textTertiary, paddingVertical: spacing.md },
  rows: { gap: spacing.sm },
});

export default StockList;
