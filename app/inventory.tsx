import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { getMergedInventoryFromDb, upsertStoreProduct, getMasterProductCategories } from "../lib/storeProducts";

const API_BASE = config.API_BASE;
const INVENTORY_CACHE_KEY = "inventory_products_cache";
const INVENTORY_PERSISTED_KEY = "inventory_persisted_state";

/** Display category with spaces and title case (e.g. "some-category" → "Some Category") */
function formatCategoryLabel(raw: string): string {
  if (!raw || raw === "All") return raw;
  const withSpaces = String(raw).replace(/-/g, " ").trim();
  return withSpaces
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

let persistedProducts: any[] = [];
let persistedStoreId: string | null = null;
let persistedSearch = "";

const ProductItem = memo(({
  product,
  toggling,
  onAdd,
}: any) => {
  const displayName = product.name || product.product_name || "Product";

  return (
    <View style={styles.card}>
      <Image
        source={{ uri: product.image_url }}
        style={styles.image}
        resizeMode="cover"
      />

      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={2}>
          {displayName}
        </Text>

        <Text style={styles.meta}>
          {product.brand ? `${product.brand} · ` : ""}
          {product.category ? formatCategoryLabel(product.category) : ""}
        </Text>

        {product.description ? (
          <Text style={styles.description} numberOfLines={2}>{product.description}</Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.activeBtn, styles.activeBtnAdd]}
        onPress={() => onAdd(product)}
        disabled={toggling}
        activeOpacity={0.75}
      >
        {toggling ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <Text style={[styles.activeBtnText, styles.activeBtnTextOn]}>Add</Text>
        )}
      </TouchableOpacity>
    </View>
  );
});

export default function InventoryScreen() {
  const params = useLocalSearchParams<{ storeId?: string }>();
  const [loading, setLoading] = useState(() => !(persistedProducts.length > 0));
  const [products, setProducts] = useState<any[]>(() =>
    persistedProducts.length > 0 ? [...persistedProducts] : []
  );
  const [storeId, setStoreId] = useState<string | null>(() => params.storeId ?? null);
  const [token, setToken] = useState<string | null>(null);
  const [search, setSearch] = useState(() => persistedSearch);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const categoryScrollRef = useRef<ScrollView>(null);
  const categoryOffsetsRef = useRef<Record<number, number>>({});

  useEffect(() => {
    getMasterProductCategories().then((cats) => {
      setAllCategories(["All", ...cats]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const fromParams = typeof params.storeId === "string" && params.storeId.length > 0 ? params.storeId : null;
    if (fromParams) {
      setStoreId(fromParams);
      if (persistedStoreId && persistedStoreId !== fromParams) {
        persistedStoreId = null;
        persistedProducts = [];
        persistedSearch = "";
        AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY).catch(() => {});
      }
    }
  }, [params.storeId]);

  useEffect(() => {
    if (products.length > 0) persistedProducts = products;
    if (storeId) persistedStoreId = storeId;
    persistedSearch = search;
    AsyncStorage.setItem(
      INVENTORY_PERSISTED_KEY,
      JSON.stringify({ products, storeId, search })
    ).catch(() => {});
  }, [products, storeId, search]);

  useEffect(() => {
    if (storeId) persistedStoreId = storeId;
  }, [storeId]);
  useEffect(() => {
    persistedSearch = search;
  }, [search]);

  const fetchInventory = async (authToken: string, storeIdVal: string) => {
    const [masterRes, storeProductsRes] = await Promise.all([
      fetch(`${API_BASE}/api/products/master-products?isActive=true`),
      fetch(`${API_BASE}/store-owner/stores/${storeIdVal}/products`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
    ]);
    const masterRaw = await masterRes.text();
    const storeRaw = await storeProductsRes.text();
    let masterList: any[] = [];
    let storeList: any[] = [];
    try { masterList = masterRaw ? JSON.parse(masterRaw) : []; } catch { masterList = []; }
    try {
      const storeJson = storeRaw ? JSON.parse(storeRaw) : null;
      storeList = storeJson?.products || [];
    } catch { storeList = []; }
    if (!Array.isArray(masterList)) masterList = [];
    const byMasterId: Record<string, { id: string; is_active: boolean; quantity: number }> = {};
    storeList.forEach((sp: any) => {
      const mid = sp.master_product_id ?? sp.masterProductId;
      if (mid) byMasterId[mid] = { id: sp.id, is_active: sp.is_active !== false, quantity: sp.quantity ?? 0 };
    });
    return masterList.map((mp: any) => {
      const storeRow = byMasterId[mp.id];
      return {
        ...mp,
        price: mp.base_price ?? mp.price,
        storeProductId: storeRow?.id ?? null,
        is_active: storeRow?.is_active ?? false,
        quantity: storeRow?.quantity ?? 0,
      };
    });
  };

  const mergeMasterWithStoreProducts = (
    masterList: any[],
    storeList: any[],
  ): any[] => {
    const byMasterId: Record<string, { id: string; is_active: boolean; quantity: number }> = {};
    storeList.forEach((sp: any) => {
      const mid = sp.master_product_id ?? sp.masterProductId;
      if (mid) byMasterId[mid] = { id: sp.id, is_active: sp.is_active !== false, quantity: sp.quantity ?? 0 };
    });
    return masterList.map((mp: any) => {
      const storeRow = byMasterId[mp.id];
      return {
        ...mp,
        price: mp.base_price ?? mp.price,
        storeProductId: storeRow?.id ?? null,
        is_active: storeRow?.is_active ?? false,
        quantity: storeRow?.quantity ?? 0,
      };
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const [persistedRaw, cached, s] = await Promise.all([
          AsyncStorage.getItem(INVENTORY_PERSISTED_KEY),
          AsyncStorage.getItem(INVENTORY_CACHE_KEY),
          getSession(),
        ]);
        const session: any = s;
        if (!session?.token) { setLoading(false); return; }
        setToken(session.token);

        if (storeId) {
          const list = await fetchInventory(session.token, storeId);
          setProducts(list);
          setLoading(false);
          return;
        }

        const fromPersisted =
          persistedRaw &&
          (() => {
            try {
              const p = JSON.parse(persistedRaw);
              if (p && Array.isArray(p.products) && p.products.length > 0) {
                persistedProducts = p.products;
                persistedStoreId = p.storeId ?? null;
                persistedSearch = p.search ?? "";
                setProducts(p.products);
                if (p.storeId) setStoreId(p.storeId);
                setSearch(p.search ?? "");
                setLoading(false);
                return true;
              }
            } catch { /**/ }
            return false;
          })();
        if (fromPersisted) return;

        if (persistedProducts.length > 0 && persistedStoreId) {
          setStoreId(persistedStoreId);
          setLoading(false);
          return;
        }

        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setProducts(parsed);
              setLoading(false);
            }
          } catch { /**/ }
        }

        const auth = { Authorization: `Bearer ${session.token}` };
        const userId = session.user?.id;
        const [storeRes, masterRes] = await Promise.all([
          fetch(`${API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ''}`, { headers: auth }),
          fetch(`${API_BASE}/api/products/master-products?isActive=true`),
        ]);
        const [storeRaw, masterRaw] = await Promise.all([storeRes.text(), masterRes.text()]);
        let storeJson: any = null;
        let masterList: any[] = [];
        try { storeJson = storeRaw ? JSON.parse(storeRaw) : null; } catch { storeJson = null; }
        try { masterList = masterRaw ? JSON.parse(masterRaw) : []; } catch { masterList = []; }
        if (!Array.isArray(masterList)) masterList = [];

        if (!storeJson?.stores?.length) {
          Alert.alert(
            "No Store Found",
            "You don't have a store set up yet. Would you like to create one?",
            [
              { text: "Set Up Store", onPress: () => router.replace("/store-owner-signup") },
              { text: "Go Back", onPress: () => router.back() }
            ]
          );
          setLoading(false);
          return;
        }

        const id = storeJson.stores[0].id;
        setStoreId(id);

        const fromDb = await getMergedInventoryFromDb(id);
        if (Array.isArray(fromDb) && fromDb.length > 0) {
          setProducts(fromDb);
          await AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(fromDb));
          setLoading(false);
          return;
        }

        const storeProductsRes = await fetch(
          `${API_BASE}/store-owner/stores/${id}/products`,
          { headers: auth },
        );
        const storeRaw2 = await storeProductsRes.text();
        let storeList: any[] = [];
        try {
          const storeJson2 = storeRaw2 ? JSON.parse(storeRaw2) : null;
          storeList = storeJson2?.products || [];
        } catch { storeList = []; }
        const merged = mergeMasterWithStoreProducts(masterList, storeList);
        setProducts(merged);
        await AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(merged));
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const invalidateMainPageCache = async () => {
    try {
      await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
      await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
    } catch (err) {
      console.warn("Failed to invalidate cache:", err);
    }
  };

  const addProduct = async (product: any) => {
    if (!token || !storeId) return;
    setTogglingId(product.id);

    try {
      const inserted = await upsertStoreProduct(storeId, product.id);
      if (inserted && "id" in inserted && inserted.id) {
        // Remove from Inventory list – it now lives in "Your Stock"
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
        await invalidateMainPageCache();
      } else if (inserted && "error" in inserted) {
        Alert.alert("Error", "Could not add product. Please try again.");
      }
    } catch (e) {
      console.error("[inventory] addProduct error:", e);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setTogglingId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const inStore = products.filter((p) => !!p.storeProductId);
  const notInStore = products.filter((p) => !p.storeProductId);

  const derivedCategories = React.useMemo(() => {
    if (allCategories.length > 1) return allCategories;
    const set = new Set<string>();
    notInStore.forEach((p) => {
      const c = (p.category || "").trim();
      if (c) set.add(c);
    });
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allCategories, notInStore]);
  const categories = derivedCategories;

  const filteredBySearch = notInStore.filter((p) =>
    [p.name, p.product_name, p.brand, p.category]
      .filter(Boolean)
      .some((x: string) => String(x).toLowerCase().includes(q))
  );
  const filtered =
    !selectedCategory || selectedCategory === "All"
      ? filteredBySearch
      : filteredBySearch.filter((p) => (p.category || "").trim() === selectedCategory);
  const sorted = filtered;

  const goToDashboard = () => router.replace("/(tabs)/home");

  const scrollCategoryToSelected = useCallback(() => {
    const cat = selectedCategory === null || selectedCategory === "All" ? "All" : selectedCategory;
    const index = categories.indexOf(cat);
    if (index < 0) return;
    const x = categoryOffsetsRef.current[index];
    if (typeof x === "number") {
      categoryScrollRef.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
    } else {
      const approx = index * (92 + spacing.sm);
      categoryScrollRef.current?.scrollTo({ x: Math.max(0, approx), animated: true });
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (categories.length <= 1) return;
    const t = setTimeout(() => scrollCategoryToSelected(), 50);
    return () => clearTimeout(t);
  }, [selectedCategory, categories.length, scrollCategoryToSelected]);

  const renderItem = useCallback(({ item: p }: { item: any }) => (
    <ProductItem
      product={p}
      toggling={togglingId === p.id}
      onAdd={addProduct}
    />
  ), [togglingId, addProduct]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: 88, offset: 88 * index, index }),
    []
  );

  const ListHeaderComponent = useCallback(() => (
    <>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={goToDashboard} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={styles.backBtnText}>Dashboard</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Add Products</Text>
      <Text style={styles.subtitle}>
        Browse the catalog and add products to your store. Manage them from "Your Stock" on the dashboard.
      </Text>

      {/* In Your Store section */}
      {inStore.length > 0 && (
        <View style={styles.inStoreSection}>
          <View style={styles.inStoreSectionHeader}>
            <View style={styles.inStoreSectionHeaderLeft}>
              <Ionicons name="cube" size={16} color={colors.success} />
              <Text style={styles.inStoreSectionTitle}>In Your Store</Text>
              <View style={styles.inStoreBadge}>
                <Text style={styles.inStoreBadgeText}>{inStore.length}</Text>
              </View>
            </View>
          </View>
          {inStore.slice(0, 20).map((p) => {
            const isActive = p.is_active !== false;
            const name = p.name || p.product_name || "Product";
            return (
              <View key={p.id} style={styles.inStoreItem}>
                <View style={[styles.inStoreAccent, { backgroundColor: isActive ? colors.success : colors.border }]} />
                <View style={styles.inStoreItemInfo}>
                  <Text style={styles.inStoreItemName} numberOfLines={1}>{name}</Text>
                  {p.unit ? (
                    <Text style={styles.inStoreItemUnit}>{p.unit}</Text>
                  ) : null}
                </View>
                <View style={styles.inStoreItemRight}>
                  <Text style={[styles.inStoreItemStatus, { color: isActive ? colors.success : colors.textTertiary }]}>
                    {isActive ? "● Active" : "○ Inactive"}
                  </Text>
                </View>
              </View>
            );
          })}
          {inStore.length > 20 && (
            <Text style={styles.inStoreMore}>+{inStore.length - 20} more — manage all from Your Stock on the dashboard</Text>
          )}
          <View style={styles.inStoreDivider} />
        </View>
      )}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products, brands or categories"
          placeholderTextColor={colors.textTertiary}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      {categories.length > 1 && (
        <View style={styles.categoryRibbonWrap}>
          <ScrollView
            ref={categoryScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRibbon}
            scrollEventThrottle={16}
          >
            {categories.map((cat, index) => {
              const isAll = cat === "All";
              const isSelected =
                isAll ? !selectedCategory || selectedCategory === "All" : selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setSelectedCategory(isAll ? null : cat)}
                  onLayout={(e) => {
                    categoryOffsetsRef.current[index] = e.nativeEvent.layout.x;
                  }}
                  style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                  activeOpacity={0.75}
                >
                  {isSelected && <View style={styles.categoryChipDot} />}
                  <Text
                    style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}
                    numberOfLines={1}
                  >
                    {formatCategoryLabel(cat)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </>
  ), [search, goToDashboard, categories, selectedCategory, inStore]);

  const ListEmptyComponent = useCallback(() => {
    if (loading && products.length === 0) {
      return (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading products...</Text>
        </View>
      );
    }
    const noneLeft = notInStore.length === 0 && products.length > 0;
    const categorySelected = selectedCategory && selectedCategory !== "All";
    const noInCategory = categorySelected && filteredBySearch.length === 0 && notInStore.length > 0;
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {products.length === 0
            ? "No products available"
            : noneLeft
            ? "All added"
            : noInCategory
            ? `No products in ${formatCategoryLabel(selectedCategory)}`
            : "No matches"}
        </Text>
        <Text style={styles.emptyText}>
          {products.length === 0
            ? "Could not load products. Check your connection."
            : noneLeft
            ? "All products are in Your Stock. Toggle Active/Inactive from the dashboard."
            : noInCategory
            ? "Try another category or clear search."
            : "No products match your search. Try different keywords."}
        </Text>
      </View>
    );
  }, [loading, products.length, notInStore.length, selectedCategory, filteredBySearch.length]);

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.container}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={15}
        windowSize={10}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingRight: 12 },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: 14,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: "center",
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  loadingBlock: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textTertiary,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  searchIcon: {
    flexShrink: 0,
  },
  search: {
    flex: 1,
    paddingVertical: 11,
    color: colors.textPrimary,
    fontSize: 14,
  },
  categoryRibbonWrap: {
    marginBottom: spacing.lg,
  },
  categoryRibbon: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.75)",
    flexShrink: 0,
  },
  categoryChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  categoryChipTextActive: {
    color: colors.surface,
    fontWeight: "700",
  },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    alignItems: "center",
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
  },
  name: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  meta: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  activeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1.5,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  activeBtnAdd: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  activeBtnOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  activeBtnOff: {
    backgroundColor: colors.surfaceVariant,
    borderColor: colors.border,
  },
  activeBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  activeBtnTextOn: {
    color: colors.surface,
  },
  activeBtnTextOff: {
    color: colors.textTertiary,
  },

  // In Your Store section
  inStoreSection: {
    marginBottom: spacing.lg,
  },
  inStoreSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  inStoreSectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  inStoreSectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  inStoreBadge: {
    backgroundColor: colors.success + "20",
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.success + "40",
  },
  inStoreBadgeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "700",
  },
  inStoreItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    overflow: "hidden",
  },
  inStoreAccent: {
    width: 4,
    alignSelf: "stretch",
  },
  inStoreItemInfo: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  inStoreItemName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  inStoreItemUnit: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  inStoreItemStatus: {
    fontSize: 11,
    fontWeight: "500",
  },
  inStoreItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  inStoreQtyLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "500",
  },
  inStoreMore: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
  inStoreDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },

  // Quantity stepper
  quantityStepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  stepperBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    minWidth: 24,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  stepperValueZero: {
    color: colors.textTertiary,
  },
});
