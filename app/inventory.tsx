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
import { getMergedInventoryFromDb, upsertStoreProduct } from "../lib/storeProducts";

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

        <Text style={styles.price}>₹{product.price ?? product.base_price ?? 0}</Text>
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
  const categoryScrollRef = useRef<ScrollView>(null);
  const categoryOffsetsRef = useRef<Record<number, number>>({});

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
    const byMasterId: Record<string, { id: string; is_active: boolean }> = {};
    storeList.forEach((sp: any) => {
      const mid = sp.master_product_id ?? sp.masterProductId;
      if (mid) byMasterId[mid] = { id: sp.id, is_active: sp.is_active !== false };
    });
    return masterList.map((mp: any) => {
      const storeRow = byMasterId[mp.id];
      return {
        ...mp,
        price: mp.base_price ?? mp.price,
        storeProductId: storeRow?.id ?? null,
        is_active: storeRow?.is_active ?? false,
      };
    });
  };

  const mergeMasterWithStoreProducts = (
    masterList: any[],
    storeList: any[],
  ): any[] => {
    const byMasterId: Record<string, { id: string; is_active: boolean }> = {};
    storeList.forEach((sp: any) => {
      const mid = sp.master_product_id ?? sp.masterProductId;
      if (mid) byMasterId[mid] = { id: sp.id, is_active: sp.is_active !== false };
    });
    return masterList.map((mp: any) => {
      const storeRow = byMasterId[mp.id];
      return {
        ...mp,
        price: mp.base_price ?? mp.price,
        storeProductId: storeRow?.id ?? null,
        is_active: storeRow?.is_active ?? false,
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
      const inserted = await upsertStoreProduct(storeId, product.id, 100);
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
  const notInStore = products.filter((p) => !p.storeProductId);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    notInStore.forEach((p) => {
      const c = (p.category || "").trim();
      if (c) set.add(c);
    });
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [notInStore]);

  const filteredBySearch = notInStore.filter((p) =>
    [p.name, p.product_name, p.brand, p.category]
      .filter(Boolean)
      .some((x: string) => String(x).toLowerCase().includes(q))
  );
  const filtered =
    !selectedCategory || selectedCategory === "All"
      ? filteredBySearch
      : filteredBySearch.filter((p) => (p.category || "").trim() === selectedCategory);
  const sorted = filtered.slice(0, q === "" ? 200 : 100);

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
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Inventory</Text>
      <Text style={styles.subtitle}>
        Add products to your store. After adding, manage them (Active/Inactive) from "Your Stock" on the dashboard.
      </Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search products, brands or categories"
        placeholderTextColor={colors.textTertiary}
        style={styles.search}
      />
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
  ), [search, goToDashboard, categories, selectedCategory]);

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
  backBtn: { paddingVertical: 8, paddingRight: 12 },
  backBtnText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
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
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  categoryRibbonWrap: {
    marginBottom: spacing.lg,
  },
  categoryRibbon: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceVariant,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  categoryChipTextActive: {
    color: colors.surface,
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
  price: {
    color: colors.success,
    fontWeight: "800",
    marginTop: 4,
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
});
