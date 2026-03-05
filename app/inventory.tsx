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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";
import {
  getMergedInventoryFromDb,
  upsertStoreProduct,
  updateStoreProductQuantity,
} from "../lib/storeProducts";
import { testSupabaseConnection, testProductInsert } from "../lib/testSupabase";

const API_BASE = config.API_BASE;
const INVENTORY_CACHE_KEY = "inventory_products_cache";
const INVENTORY_PERSISTED_KEY = "inventory_persisted_state";

let persistedProducts: any[] = [];
let persistedStoreId: string | null = null;
let persistedSearch = "";

// Memoized product item component for better performance
const ProductItem = memo(({
  product,
  out,
  isEditing,
  editingQty,
  editingValueRef,
  onUpdateQuantity,
  onSetEditingQty,
  onCommitQtyEdit
}: any) => {
  return (
    <View style={styles.card}>
      <Image
        source={{ uri: product.image_url }}
        style={styles.image}
        resizeMode="cover"
      />

      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        <Text style={styles.meta}>
          {product.brand ? `${product.brand} · ` : ""}
          {product.category}
        </Text>

        <Text style={styles.price}>₹{product.price ?? product.base_price}</Text>

        <Text
          style={{
            color: out ? colors.warning : colors.success,
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {out ? "Out of stock" : "In stock"}
        </Text>
      </View>

      <View style={styles.stockCol}>
        <TouchableOpacity
          style={styles.qtyBtn}
          onPress={() => onUpdateQuantity(product, product.quantity - 1)}
          activeOpacity={0.7}
        >
          <Text style={styles.qtyText}>−</Text>
        </TouchableOpacity>

        {isEditing ? (
          <TextInput
            style={styles.qtyInput}
            value={editingQty && editingQty.id === product.id ? editingQty.value : ""}
            onChangeText={(v) => {
              editingValueRef.current = v;
              onSetEditingQty((e: any) => (e && e.id === product.id ? { id: e.id, value: v } : e));
            }}
            onBlur={() => onCommitQtyEdit(product, editingValueRef.current)}
            onSubmitEditing={() => onCommitQtyEdit(product, editingValueRef.current)}
            keyboardType="number-pad"
            selectTextOnFocus
            autoFocus
          />
        ) : (
          <TouchableOpacity
            onPress={() => {
              editingValueRef.current = String(product.quantity);
              onSetEditingQty({ id: product.id, value: String(product.quantity) });
            }}
            style={styles.qtyTouch}
            activeOpacity={0.7}
          >
            <Text style={styles.qty}>{product.quantity}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.qtyBtn}
          onPress={() => onUpdateQuantity(product, product.quantity + 1)}
          activeOpacity={0.7}
        >
          <Text style={styles.qtyText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function InventoryScreen() {
  const params = useLocalSearchParams<{ storeId?: string }>();
  const [loading, setLoading] = useState(() => !(persistedProducts.length > 0));
  const [products, setProducts] = useState<any[]>(() =>
    persistedProducts.length > 0 ? [...persistedProducts] : []
  );
  // CRITICAL: Always use storeId from params first, ignore cached value
  const [storeId, setStoreId] = useState<string | null>(() => params.storeId ?? null);
  const [token, setToken] = useState<string | null>(null);
  const [search, setSearch] = useState(() => persistedSearch);
  const [editingQty, setEditingQty] = useState<{ id: string; value: string } | null>(null);
  const editingValueRef = useRef("");

  // Always update storeId if params change
  useEffect(() => {
    const fromParams = typeof params.storeId === "string" && params.storeId.length > 0 ? params.storeId : null;
    if (fromParams) {
      console.log("[inventory] Setting storeId from params:", fromParams);
      setStoreId(fromParams);
      // Clear cache when storeId changes (different user)
      if (persistedStoreId && persistedStoreId !== fromParams) {
        console.log("[inventory] StoreId changed - clearing cache");
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
    try {
      masterList = masterRaw ? JSON.parse(masterRaw) : [];
    } catch {
      masterList = [];
    }
    try {
      const storeJson = storeRaw ? JSON.parse(storeRaw) : null;
      storeList = storeJson?.products || [];
    } catch {
      storeList = [];
    }
    if (!Array.isArray(masterList)) masterList = [];
    const byMasterId: Record<string, { id: string; quantity: number }> = {};
    storeList.forEach((sp: any) => {
      const mid = sp.master_product_id ?? sp.masterProductId;
      if (mid) byMasterId[mid] = { id: sp.id, quantity: sp.quantity ?? 0 };
    });
    return masterList.map((mp: any) => {
      const storeRow = byMasterId[mp.id];
      return {
        ...mp,
        price: mp.base_price ?? mp.price,
        quantity: storeRow ? storeRow.quantity : 0,
        storeProductId: storeRow?.id ?? null,
      };
    });
  };

  const mergeMasterWithStoreProducts = (
    masterList: any[],
    storeList: any[],
  ): any[] => {
    const byMasterId: Record<string, { id: string; quantity: number }> = {};
    storeList.forEach((sp: any) => {
      const mid = sp.master_product_id ?? sp.masterProductId;
      if (mid) byMasterId[mid] = { id: sp.id, quantity: sp.quantity ?? 0 };
    });
    return masterList.map((mp: any) => {
      const storeRow = byMasterId[mp.id];
      return {
        ...mp,
        price: mp.base_price ?? mp.price,
        quantity: storeRow ? storeRow.quantity : 0,
        storeProductId: storeRow?.id ?? null,
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
        if (!session?.token) {
          setLoading(false);
          return;
        }
        setToken(session.token);

        // CRITICAL: If we have a storeId from params, ignore cache and use that
        if (storeId) {
          console.log("[inventory] Using storeId from params, fetching fresh data:", storeId);
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
            } catch {
              //
            }
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
          } catch {
            // ignore invalid cache
          }
        }

        const auth = { Authorization: `Bearer ${session.token}` };
        const userId = session.user?.id;
        const [storeRes, masterRes] = await Promise.all([
          fetch(`${API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ''}`, { headers: auth }),
          fetch(`${API_BASE}/api/products/master-products?isActive=true`),
        ]);
        const [storeRaw, masterRaw] = await Promise.all([
          storeRes.text(),
          masterRes.text(),
        ]);
        let storeJson: any = null;
        let masterList: any[] = [];
        try {
          storeJson = storeRaw ? JSON.parse(storeRaw) : null;
        } catch {
          storeJson = null;
        }
        try {
          masterList = masterRaw ? JSON.parse(masterRaw) : [];
        } catch {
          masterList = [];
        }
        if (!Array.isArray(masterList)) masterList = [];
        const toProducts = (list: any[]) =>
          list.map((mp: any) => ({
            ...mp,
            price: mp.base_price ?? mp.price,
            quantity: 0,
            storeProductId: null,
          }));

        if (!storeJson?.stores?.length) {
          console.log("[inventory] ❌ No stores found for this user");
          Alert.alert(
            "No Store Found",
            "You don't have a store set up yet. Would you like to create one?",
            [
              {
                text: "Set Up Store",
                onPress: () => router.replace("/store-owner-signup")
              },
              {
                text: "Go Back",
                onPress: () => router.back()
              }
            ]
          );
          const list = toProducts(masterList);
          setProducts(list);
          await AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(list));
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
        } catch {
          storeList = [];
        }
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

  const setQuantityOptimistic = (productId: string, qty: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, quantity: Math.max(0, qty) } : p))
    );
  };

  const invalidateMainPageCache = async () => {
    try {
      await AsyncStorage.removeItem(INVENTORY_PERSISTED_KEY);
      await AsyncStorage.removeItem(INVENTORY_CACHE_KEY);
    } catch (err) {
      console.warn("Failed to invalidate cache:", err);
    }
  };

  const updateQuantity = async (row: any, newQty: number) => {
    const qty = Math.max(0, newQty);
    const prevQty = row.quantity;

    console.log("======================================");
    console.log("[inventory] updateQuantity START");
    console.log("  Row:", { id: row.id, name: row.name, quantity: row.quantity, storeProductId: row.storeProductId });
    console.log("  New quantity:", qty);
    console.log("  Store ID:", storeId);
    console.log("  Token exists:", !!token);
    console.log("======================================");

    setQuantityOptimistic(row.id, qty);

    if (!token || !storeId) {
      console.error("[inventory] MISSING token or storeId!", { token: !!token, storeId });

      // Try to fetch store ID if missing
      if (!storeId && token) {
        Alert.alert(
          "Loading Store",
          "Store information is loading. Please wait a moment and try again.",
          [
            {
              text: "OK",
              onPress: async () => {
                // Trigger a refetch
                try {
                  const res = await fetch(`${API_BASE}/store-owner/stores`, {
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  const data = await res.json();
                  if (data?.stores?.[0]?.id) {
                    setStoreId(data.stores[0].id);
                    console.log("✅ Store loaded successfully");
                  } else {
                    console.log("⚠️ No store found");
                    router.back();
                  }
                } catch (err) {
                  console.error("Failed to load store:", err);
                }
              }
            }
          ]
        );
      } else if (!storeId) {
        console.log("⚠️ No store loaded");
      }

      // Revert optimistic update
      setQuantityOptimistic(row.id, prevQty);
      return;
    }

    // Update existing product
    if (row.storeProductId) {
      console.log("[inventory] Updating existing product via Supabase");
      console.log("  storeProductId:", row.storeProductId);

      const ok = await updateStoreProductQuantity(row.storeProductId, qty);
      console.log("[inventory] updateStoreProductQuantity result:", ok);

      if (ok) {
        setProducts((prev) => {
          const next = prev.map((p) => (p.id === row.id ? { ...p, quantity: qty } : p));
          AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
        await invalidateMainPageCache();
        console.log("[inventory] ✅ Update completed successfully");
        return;
      }

      // Fallback to API
      console.log("[inventory] Supabase update failed, trying API fallback");
      const res = await fetch(`${API_BASE}/store-owner/products/${row.storeProductId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quantity: qty }),
      });
      if (!res.ok) {
        console.error("[inventory] API update also failed:", res.status);
        setQuantityOptimistic(row.id, prevQty);
        return;
      }
      setProducts((prev) => {
        const next = prev.map((p) => (p.id === row.id ? { ...p, quantity: qty } : p));
        AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      await invalidateMainPageCache();
      console.log("[inventory] ✅ API update completed successfully");
      return;
    }

    // Don't add product with 0 quantity
    if (qty === 0) {
      console.log("[inventory] Skipping - quantity is 0");
      return;
    }

    // Add new product: write directly to Supabase products table
    console.log("[inventory] ⭐ ADDING NEW PRODUCT TO DATABASE");
    console.log("  storeId:", storeId);
    console.log("  masterProductId (row.id):", row.id);
    console.log("  quantity:", qty);

    const inserted = await upsertStoreProduct(storeId, row.id, qty);
    console.log("[inventory] upsertStoreProduct result:", inserted);

    if (inserted && "id" in inserted && inserted.id) {
      console.log("[inventory] ✅ SUCCESS! Product inserted with ID:", inserted.id);
      setProducts((prev) => {
        const next = prev.map((p) =>
          p.id === row.id ? { ...p, quantity: qty, storeProductId: inserted.id } : p
        );
        AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      await invalidateMainPageCache();
      console.log("✅ Product added to stock successfully");
      return;
    }

    if (inserted && "error" in inserted) {
      const errMsg = inserted.error;
      console.error("[inventory] ❌ Supabase upsert FAILED:", errMsg);
      const hint =
        /foreign key|violates|23503/i.test(errMsg)
          ? "\n\nYour store may not exist in Supabase stores table. Check stores table."
          : /permission|denied|RLS/i.test(errMsg)
            ? "\n\nRun: supabase/products-rls-anon-v2.sql in Supabase SQL Editor."
            : "";
      setQuantityOptimistic(row.id, prevQty);
      console.error("[inventory] Could not add to stock:", errMsg + hint);
      return;
    }

    console.error("[inventory] ❌ UNKNOWN ERROR - No id and no error returned");
    setQuantityOptimistic(row.id, prevQty);
  };

  const commitQtyEdit = (row: any, value: string) => {
    setEditingQty(null);
    const num = parseInt(value.replace(/\D/g, ""), 10);
    if (!Number.isNaN(num)) updateQuantity(row, num);
  };

  const q = search.trim().toLowerCase();

  // Filter out products already in stock (quantity > 0)
  const availableToAdd = products.filter((p) => p.quantity === 0);

  // Apply search filter
  const filtered = availableToAdd.filter((p) =>
    [p.name, p.brand, p.category]
      .filter(Boolean)
      .some((x: string) => x.toLowerCase().includes(q))
  );

  // Limit results to prevent memory issues
  const sorted = filtered.slice(0, q === "" ? 100 : 50);

  const goToDashboard = () => router.replace("/owner-home");

  const runDiagnostics = async () => {
    console.log("🔍 Running diagnostics...");

    const connectionTest = await testSupabaseConnection();
    console.log("Connection test result:", connectionTest);

    if (connectionTest.success && storeId) {
      const insertTest = await testProductInsert(storeId);
      console.log("Insert test result:", insertTest);

      if (insertTest.success) {
        console.log("✅ All tests passed");
      } else {
        console.log("❌ Insert test failed:", insertTest.error);
      }
    } else {
      console.log("❌ Connection test failed:", connectionTest.error);
    }
  };

  const renderItem = useCallback(({ item: p }: { item: any }) => {
    const out = p.quantity === 0;
    const isEditing = editingQty?.id === p.id;

    return (
      <ProductItem
        product={p}
        out={out}
        isEditing={isEditing}
        editingQty={editingQty}
        editingValueRef={editingValueRef}
        onUpdateQuantity={updateQuantity}
        onSetEditingQty={setEditingQty}
        onCommitQtyEdit={commitQtyEdit}
      />
    );
  }, [editingQty, updateQuantity, commitQtyEdit]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: 98, // Approximate height of card + margin
      offset: 98 * index,
      index,
    }),
    []
  );

  const ListHeaderComponent = useCallback(() => (
    <>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={goToDashboard} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        {__DEV__ && (
          <TouchableOpacity
            onPress={runDiagnostics}
            style={[styles.backBtn, { backgroundColor: colors.error, paddingHorizontal: 12, borderRadius: 8 }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.backBtnText, { color: colors.surface }]}>Test DB</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.title}>Inventory</Text>
      <Text style={styles.subtitle}>
        Products not yet in stock. Add quantities to make them available to customers. Items with stock will appear in "Your Stock" on the dashboard.
      </Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search products, brands or categories"
        placeholderTextColor={colors.textTertiary}
        style={styles.search}
      />
    </>
  ), [search, goToDashboard, runDiagnostics]);

  const ListEmptyComponent = useCallback(() => {
    if (loading && products.length === 0) {
      return (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading products...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {products.length === 0
            ? "No products available"
            : availableToAdd.length === 0
            ? "🎉 All products added!"
            : "No matches"}
        </Text>
        <Text style={styles.emptyText}>
          {products.length === 0
            ? "Could not load products. Check your connection."
            : availableToAdd.length === 0
            ? "All products have stock. Manage quantities in 'Your Stock' on the dashboard."
            : "No products match your search. Try different keywords."}
        </Text>
      </View>
    );
  }, [loading, products.length, availableToAdd.length]);

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
    marginBottom: spacing.lg,
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

  stockCol: {
    alignItems: "center",
    gap: 6,
  },

  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  qtyText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },

  qty: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  qtyTouch: {
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyInput: {
    minWidth: 40,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
});
