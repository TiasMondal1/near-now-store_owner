/**
 * "From catalog" panel of the Add products screen.
 *
 * Data guards: categories fetch; strict store-product map with sequence +
 * mutation guards and focus revalidation (≤ once per 10s); 350ms search
 * debounce; category change resets pagination; request-id-guarded paged
 * catalog fetch (page 0 replaces, later pages append, failed page 0 → error
 * state, failed later page → stop paginating); already-added filtering and
 * de-duplication; "Load more"; optimistic map insert after upsertStoreProduct
 * with an Undo toast that soft-deletes the row again.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { EmptyState, ErrorState, SearchField, Skeleton, useToast } from "../ui";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import { goBackOr } from "../../lib/navigation";
import {
  CATALOG_PAGE_SIZE,
  getMasterProductCategories,
  getMasterProductsPage,
  getStoreProductsFromDbStrict,
  upsertStoreProduct,
} from "../../lib/storeProducts";
import { sameData } from "../../lib/persistCache";
import { supabase } from "../../lib/supabase";
import { CatalogRow } from "./CatalogRow";
import { Pill } from "./Pill";
import { catalogProductName, formatCategoryLabel, type CatalogProduct } from "./catalog";

export type CatalogPanelProps = {
  storeId: string | null;
  /** False while the host screen is still resolving the store (skeleton). */
  storeReady: boolean;
  token: string | null | undefined;
  /** Bumped by the custom-product form after a submission → re-fetch the store map. */
  refreshKey: number;
  /** "Try again" when no store could be resolved. */
  onRetryStore: () => void;
};

const SEARCH_DEBOUNCE_MS = 350;
const MAP_REVALIDATE_MIN_MS = 10_000;

type StoreProductMap = Record<string, { id: string; is_active: boolean }>;

export function CatalogPanel({ storeId, storeReady, token, refreshKey, onRetryStore }: CatalogPanelProps) {
  const toast = useToast();

  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [catalogError, setCatalogError] = useState(false);

  const [storeProductMap, setStoreProductMap] = useState<StoreProductMap>({});
  const [addingId, setAddingId] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Categories (lightweight — distinct category column; cached in storeProducts) ──
  useEffect(() => {
    let cancelled = false;
    setCategoriesLoading(true);
    getMasterProductCategories()
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Store product map: which master products are already in the store ──
  const lastMapFetchRef = useRef(0);
  const mapReqIdRef = useRef(0);
  // Stamped when addProduct optimistically inserts — a map fetch issued before
  // the add but resolving after it would drop the new entry.
  const mapMutationRef = useRef(0);
  const refreshStoreMap = useCallback(() => {
    if (!storeId) return;
    const seq = ++mapReqIdRef.current;
    const startedAt = Date.now();
    lastMapFetchRef.current = startedAt;
    // Strict: a transient error must skip the commit — the lenient [] would
    // wipe a populated map and make every added product reappear.
    getStoreProductsFromDbStrict(storeId)
      .then((rows) => {
        if (seq !== mapReqIdRef.current) return;
        if (mapMutationRef.current > startedAt) return;
        const map: StoreProductMap = {};
        rows.forEach((sp) => {
          map[sp.master_product_id] = { id: sp.id, is_active: sp.is_active !== false };
        });
        setStoreProductMap((prev) => (sameData(prev, map) ? prev : map));
      })
      .catch(() => {
        /* keep the last-known map */
      });
  }, [storeId]);

  useEffect(() => {
    refreshStoreMap();
  }, [refreshStoreMap, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastMapFetchRef.current < MAP_REVALIDATE_MIN_MS) return;
      refreshStoreMap();
    }, [refreshStoreMap])
  );

  // ── Search (350ms debounce; the current list stays visible while new results load) ──
  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(text);
      setPage(0);
      setHasMore(true);
    }, SEARCH_DEBOUNCE_MS);
  }, []);
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const selectCategory = useCallback(
    (cat: string | null) => {
      if (cat === selectedCategory) return;
      setSelectedCategory(cat);
      setPage(0);
      setHasMore(true);
    },
    [selectedCategory]
  );

  // Clear button: cancel a pending debounce and reset both values at once.
  const clearSearch = useCallback(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setSearch("");
    setDebouncedSearch("");
    setPage(0);
    setHasMore(true);
  }, []);
  const clearFilters = useCallback(() => {
    clearSearch();
    setSelectedCategory(null);
  }, [clearSearch]);

  // ── Paged catalog fetch with request-id guard ──
  const catalogReqIdRef = useRef(0);
  const [catalogRetryTick, setCatalogRetryTick] = useState(0);
  useEffect(() => {
    if (!storeId) return;
    const reqId = ++catalogReqIdRef.current;
    setLoadingProducts(true);
    getMasterProductsPage({
      category: selectedCategory,
      search: debouncedSearch,
      from: page * CATALOG_PAGE_SIZE,
    })
      .then(({ data, hasMore: more, failed }) => {
        if (reqId !== catalogReqIdRef.current) return;
        if (failed) {
          // Keep already-loaded pages; only a failed first page is an error state.
          if (page === 0) {
            setProducts([]);
            setCatalogError(true);
          }
          setHasMore(false);
          return;
        }
        setCatalogError(false);
        setProducts((prev) => (page === 0 ? data : [...prev, ...data]));
        setHasMore(more);
      })
      .catch(() => {
        if (reqId !== catalogReqIdRef.current) return;
        if (page === 0) {
          setProducts([]);
          setCatalogError(true);
        }
      })
      .finally(() => {
        if (reqId === catalogReqIdRef.current) setLoadingProducts(false);
      });
  }, [storeId, selectedCategory, debouncedSearch, page, catalogRetryTick]);

  const retryCatalog = useCallback(() => {
    setCatalogError(false);
    setCatalogRetryTick((t) => t + 1);
  }, []);

  // Products not yet added to this store, de-duplicated by id.
  const displayProducts = useMemo(() => {
    const seen = new Set<string>();
    return products.filter((p) => {
      if (storeProductMap[p.id] || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [products, storeProductMap]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingProducts) return;
    setPage((p) => p + 1);
  }, [hasMore, loadingProducts]);

  // Undo for the add toast: the same soft delete the Inventory list performs
  // (`update deleted_at … select("id")`, zero rows = failure), then drop the
  // optimistic map entry so the row reappears in the catalog.
  const undoAdd = useCallback(
    async (masterProductId: string, storeProductId: string, name: string) => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from("products")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", storeProductId)
          .select("id");
        if (error || !data || data.length === 0) throw new Error("undo failed");
        mapMutationRef.current = Date.now();
        setStoreProductMap((prev) => {
          if (!prev[masterProductId]) return prev;
          const next = { ...prev };
          delete next[masterProductId];
          return next;
        });
        toast.show({ message: `Removed ${name}`, tone: "neutral" });
      } catch {
        toast.show({ message: `Couldn't undo. ${name} is still in your store.`, tone: "error" });
      }
    },
    [toast]
  );

  // Stable callback so CatalogRow's memo holds across search keystrokes.
  const addProduct = useCallback(
    async (product: CatalogProduct) => {
      if (!storeId || !token) return;
      const name = catalogProductName(product);
      setAddingId(product.id);
      try {
        const inserted = await upsertStoreProduct(storeId, product.id);
        if (inserted && "id" in inserted && inserted.id) {
          const storeProductId = inserted.id;
          mapMutationRef.current = Date.now();
          setStoreProductMap((prev) => ({
            ...prev,
            [product.id]: { id: storeProductId, is_active: true },
          }));
          toast.show({
            message: `Added ${name}`,
            tone: "success",
            action: { label: "Undo", onPress: () => undoAdd(product.id, storeProductId, name) },
          });
        } else if (inserted && "error" in inserted) {
          toast.show({ message: "Couldn't add product. Please try again.", tone: "error" });
        }
      } catch {
        toast.show({ message: "Something went wrong. Please try again.", tone: "error" });
      } finally {
        setAddingId(null);
      }
    },
    [storeId, token, toast, undoAdd]
  );

  const renderItem = useCallback(
    ({ item }: { item: CatalogProduct }) => <CatalogRow product={item} name={catalogProductName(item)} adding={addingId === item.id} onAdd={addProduct} />,
    [addingId, addProduct]
  );
  const keyExtractor = useCallback((p: CatalogProduct) => p.id, []);

  const filtersActive = debouncedSearch.trim().length > 0 || selectedCategory != null;

  // ── Content ──
  let content: React.ReactNode;
  if (storeReady && !storeId) {
    content = (
      <ErrorState
        icon="cloud-offline-outline"
        title="Couldn't load your store"
        message="Check your connection and try again."
        action={{ onPress: onRetryStore }}
      />
    );
  } else if (!storeReady || (loadingProducts && products.length === 0)) {
    content = <Skeleton.ListRow count={5} inset style={styles.skeleton} />;
  } else if (catalogError && products.length === 0) {
    content = (
      <ErrorState
        icon="cloud-offline-outline"
        title="Couldn't load the catalog"
        message="Check your connection and try again."
        action={{ onPress: retryCatalog }}
      />
    );
  } else if (displayProducts.length === 0) {
    content =
      products.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No products found"
          message="Try a different search or category."
          action={filtersActive ? { label: "Clear filters", variant: "secondary", onPress: clearFilters } : undefined}
        />
      ) : (
        <EmptyState
          icon="checkmark-done-outline"
          title="All products already in your store"
          message="Everything matching is already on your shelves."
          action={{ label: "View inventory", variant: "secondary", onPress: () => goBackOr("/(tabs)/stock") }}
        />
      );
  } else {
    content = (
      <FlatList
        data={displayProducts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        scrollEnabled={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        contentContainerStyle={styles.list}
        ListFooterComponent={
          hasMore ? (
            <Pressable
              onPress={loadMore}
              disabled={loadingProducts}
              accessibilityRole="button"
              accessibilityLabel="Load more"
              accessibilityState={{ disabled: loadingProducts, busy: loadingProducts }}
              style={({ pressed }) => [styles.loadMoreBtn, pressed && !loadingProducts && styles.loadMoreBtnPressed]}
            >
              {loadingProducts ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.loadMoreBtnText}>Load more</Text>}
            </Pressable>
          ) : null
        }
      />
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        Add from Near&amp;Now catalog
      </Text>
      <Text style={styles.subtitle}>Browse master products and add them to your store.</Text>

      <SearchField
        value={search}
        onChangeText={handleSearch}
        onClear={clearSearch}
        placeholder="Search products or brands"
        accessibilityLabel="Search products"
        fieldStyle={styles.searchField}
        inputStyle={styles.searchInput}
      />

      {/* Category pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.categoryRow}
        accessibilityLabel="Categories"
      >
        {categoriesLoading ? (
          <Skeleton.Chips count={4} />
        ) : (
          <>
            <Pill label="All" selected={!selectedCategory} onPress={() => selectCategory(null)} />
            {categories.map((cat) => (
              <Pill key={cat} label={formatCategoryLabel(cat)} selected={selectedCategory === cat} onPress={() => selectCategory(cat)} />
            ))}
          </>
        )}
      </ScrollView>

      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.sm,
  },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  subtitle: { color: colors.textTertiary, fontSize: 12, marginBottom: spacing.sm, fontWeight: "400" },
  searchField: { backgroundColor: colors.surfaceVariant },
  searchInput: { fontSize: 14, fontWeight: "500" },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.sm },
  skeleton: { paddingVertical: spacing.sm },
  list: { marginTop: spacing.sm, gap: spacing.sm },
  loadMoreBtn: {
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  loadMoreBtnPressed: { backgroundColor: colors.surfaceVariant },
  loadMoreBtnText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
});

export default CatalogPanel;
