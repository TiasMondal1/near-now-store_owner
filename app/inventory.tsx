import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";

const API_BASE = config.API_BASE;
const INVENTORY_CACHE_KEY = "inventory_products_cache";

export default function InventoryScreen() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingQty, setEditingQty] = useState<{ id: string; value: string } | null>(null);
  const editingValueRef = useRef("");

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
        const cached = await AsyncStorage.getItem(INVENTORY_CACHE_KEY);
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

        const s: any = await getSession();
        if (!s?.token) {
          setLoading(false);
          return;
        }
        setToken(s.token);

        const auth = { Authorization: `Bearer ${s.token}` };
        const [storeRes, masterRes] = await Promise.all([
          fetch(`${API_BASE}/store-owner/stores`, { headers: auth }),
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
          const list = toProducts(masterList);
          setProducts(list);
          await AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(list));
          setLoading(false);
          return;
        }

        const id = storeJson.stores[0].id;
        setStoreId(id);

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

  const updateQuantity = async (row: any, newQty: number) => {
    const qty = Math.max(0, newQty);
    const prevQty = row.quantity;
    setQuantityOptimistic(row.id, qty);

    if (!token || !storeId) return;

    if (row.storeProductId) {
      const res = await fetch(`${API_BASE}/store-owner/products/${row.storeProductId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quantity: qty }),
      });
      if (!res.ok) {
        setQuantityOptimistic(row.id, prevQty);
        Alert.alert("Error", "Failed to update quantity");
      }
      return;
    }

    if (qty === 0) return;
    const res = await fetch(
      `${API_BASE}/store-owner/stores/${storeId}/products/bulk-from-master`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [{ masterProductId: row.id, price: row.base_price ?? row.price, quantity: qty }],
        }),
      }
    );
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!res.ok || !json?.success) {
      setQuantityOptimistic(row.id, prevQty);
      Alert.alert("Error", json?.error || "Failed to add product");
      return;
    }
    const merged = await fetchInventory(token, storeId);
    setProducts(merged);
    AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(merged)).catch(() => {});
  };

  const commitQtyEdit = (row: any, value: string) => {
    setEditingQty(null);
    const num = parseInt(value.replace(/\D/g, ""), 10);
    if (!Number.isNaN(num)) updateQuantity(row, num);
  };

  const q = search.trim().toLowerCase();
  const filtered = products.filter((p) =>
    [p.name, p.brand, p.category]
      .filter(Boolean)
      .some((x: string) => x.toLowerCase().includes(q))
  );
  const sorted =
    q === ""
      ? [...filtered].sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0))
      : filtered;

  if (loading && products.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>
          Master products and stock. Set quantities here—customers see these when ordering. You can also set quantities when adding from Catalog.
        </Text>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products, brands or categories"
          placeholderTextColor={colors.textTertiary}
          style={styles.search}
        />

        {sorted.length === 0 && (
          <Text style={styles.emptyText}>
            {products.length === 0
              ? "Could not load products. Check your connection and that the backend is running."
              : "No products match your search."}
          </Text>
        )}

        {sorted.map((p) => {
          const out = p.quantity === 0;
          const inStore = !!p.storeProductId;
          const isEditing = editingQty?.id === p.id;

          return (
            <View
              key={p.id}
              style={styles.card}
            >
              <Image
                source={{ uri: p.image_url }}
                style={styles.image}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {p.name}
                </Text>

                <Text style={styles.meta}>
                  {p.brand ? `${p.brand} · ` : ""}
                  {p.category}
                </Text>

                <Text style={styles.price}>₹{p.price ?? p.base_price}</Text>

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
                  onPress={() => updateQuantity(p, p.quantity - 1)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.qtyText}>−</Text>
                </TouchableOpacity>

                {isEditing ? (
                  <TextInput
                    style={styles.qtyInput}
                    value={editingQty && editingQty.id === p.id ? editingQty.value : ""}
                    onChangeText={(v) => {
                      editingValueRef.current = v;
                      setEditingQty((e) => (e && e.id === p.id ? { id: e.id, value: v } : e));
                    }}
                    onBlur={() => commitQtyEdit(p, editingValueRef.current)}
                    onSubmitEditing={() => commitQtyEdit(p, editingValueRef.current)}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    autoFocus
                  />
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      editingValueRef.current = String(p.quantity);
                      setEditingQty({ id: p.id, value: String(p.quantity) });
                    }}
                    style={styles.qtyTouch}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.qty}>{p.quantity}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => updateQuantity(p, p.quantity + 1)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.qtyText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
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
