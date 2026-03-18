import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { config } from "../../lib/config";
import { colors, radius, spacing } from "../../lib/theme";
import { getMergedInventoryFromDb, upsertStoreProduct } from "../../lib/storeProducts";

const API_BASE = config.API_BASE;

function formatCategoryLabel(raw: string): string {
  if (!raw || raw === "All") return raw;
  const withSpaces = String(raw).replace(/-/g, " ").trim();
  return withSpaces
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function StockTab() {
  const [session, setSession] = useState<any | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"inventory" | "custom">("inventory");

  useEffect(() => {
    (async () => {
      try {
        const s: any = await getSession();
        if (!s?.token) return router.replace("/landing");

        setSession(s);

        const userId = s.user?.id;
        const res = await fetch(`${API_BASE}/store-owner/stores${userId ? `?userId=${userId}` : ''}`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        const raw = await res.text();
        let json: any = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        const stores = json?.stores || [];

        if (stores[0]) {
          setStoreId(stores[0].id);
        }
      } catch (e) {
        console.warn("[stock] Bootstrap error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="cube-outline" size={24} color={colors.primary} />
            <View>
              <Text style={styles.brand}>Stock Management</Text>
              <Text style={styles.subtitle}>Inventory & Custom Products</Text>
            </View>
          </View>
        </View>

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleBtn, activeView === "inventory" && styles.toggleBtnActive]}
            onPress={() => setActiveView("inventory")}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="list-outline" 
              size={18} 
              color={activeView === "inventory" ? colors.surface : colors.textSecondary} 
            />
            <Text style={[styles.toggleBtnText, activeView === "inventory" && styles.toggleBtnTextActive]}>
              Inventory
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleBtn, activeView === "custom" && styles.toggleBtnActive]}
            onPress={() => setActiveView("custom")}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="add-circle-outline" 
              size={18} 
              color={activeView === "custom" ? colors.surface : colors.textSecondary} 
            />
            <Text style={[styles.toggleBtnText, activeView === "custom" && styles.toggleBtnTextActive]}>
              Add Custom
            </Text>
          </TouchableOpacity>
        </View>

        {activeView === "inventory" && (
          <InventoryCatalogSection storeId={storeId} token={session?.token} />
        )}

        {activeView === "custom" && (
          <AddCustomSection storeId={storeId} token={session?.token} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InventoryCatalogSection({ storeId, token }: { storeId?: string | null; token?: string }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!storeId || !token) {
        setLoading(false);
        return;
      }
      try {
        const fromDb = await getMergedInventoryFromDb(storeId);
        if (Array.isArray(fromDb) && fromDb.length > 0) {
          setProducts(fromDb);
          setLoading(false);
          return;
        }
      } catch {
        // fall through to network fetch
      }

      try {
        const [masterRes, storeProductsRes] = await Promise.all([
          fetch(`${API_BASE}/api/products/master-products?isActive=true`),
          fetch(`${API_BASE}/store-owner/stores/${storeId}/products`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const [masterRaw, storeRaw] = await Promise.all([
          masterRes.text(),
          storeProductsRes.text(),
        ]);
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

        const byMasterId: Record<string, { id: string; is_active: boolean }> = {};
        storeList.forEach((sp: any) => {
          const mid = sp.master_product_id ?? sp.masterProductId;
          if (mid) {
            byMasterId[mid] = {
              id: sp.id,
              is_active: sp.is_active !== false,
            };
          }
        });

        const merged = masterList.map((mp: any) => {
          const storeRow = byMasterId[mp.id];
          return {
            ...mp,
            price: mp.base_price ?? mp.price,
            storeProductId: storeRow?.id ?? null,
            is_active: storeRow?.is_active ?? false,
          };
        });
        setProducts(merged);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId, token]);

  useFocusEffect(
    React.useCallback(() => {
      if (storeId && token) {
        // Optionally refresh on focus
      }
    }, [storeId, token])
  );

  const notInStore = products.filter((p) => !p.storeProductId);
  const q = search.trim().toLowerCase();

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
      : filteredBySearch.filter(
          (p) => (p.category || "").trim() === selectedCategory
        );
  const visible = filtered.slice(0, q === "" ? 40 : 60);

  const addProduct = async (product: any) => {
    if (!storeId || !token) return;
    setTogglingId(product.id);
    try {
      const inserted = await upsertStoreProduct(storeId, product.id);
      if (inserted && "id" in inserted && inserted.id) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id
              ? {
                  ...p,
                  storeProductId: inserted.id,
                  is_active: true,
                }
              : p
          )
        );
        Alert.alert("Success", "Product added to your stock!");
      } else if (inserted && "error" in inserted) {
        Alert.alert("Error", "Could not add product. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <View style={styles.catalogCard}>
      <Text style={styles.catalogTitle}>Add from Near&Now catalog</Text>
      <Text style={styles.catalogSubtitle}>
        Browse master products and add them to your store.
      </Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search products, brands or categories"
        placeholderTextColor={colors.textTertiary}
        style={styles.catalogSearch}
      />

      {categories.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catalogCategoryRow}
        >
          {categories.map((cat) => {
            const isAll = cat === "All";
            const isSelected = isAll
              ? !selectedCategory || selectedCategory === "All"
              : selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(isAll ? null : cat)}
                style={[
                  styles.catalogCategoryChip,
                  isSelected && styles.catalogCategoryChipActive,
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.catalogCategoryText,
                    isSelected && styles.catalogCategoryTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {formatCategoryLabel(cat)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading && products.length === 0 ? (
        <View style={styles.catalogLoading}>
          <View style={styles.skeletonContainer}>
            {[...Array(5)].map((_, i) => (
              <View key={i} style={styles.skeletonItem}>
                <View style={styles.skeletonImage} />
                <View style={styles.skeletonInfo}>
                  <View style={[styles.skeletonText, { width: "80%" }]} />
                  <View style={[styles.skeletonText, { width: "60%", marginTop: 6 }]} />
                  <View style={[styles.skeletonText, { width: "40%", marginTop: 6 }]} />
                </View>
                <View style={styles.skeletonButton} />
              </View>
            ))}
          </View>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.catalogEmpty}>
          <Text style={styles.catalogEmptyTitle}>
            {products.length === 0
              ? "No products available"
              : "No products match your filters"}
          </Text>
          <Text style={styles.catalogEmptyText}>
            {products.length === 0
              ? "Could not load master products. Check your connection."
              : "Try a different search or clear the category filter."}
          </Text>
        </View>
      ) : (
        <View style={styles.catalogList}>
          {visible.map((p) => {
            const name = p.name || p.product_name || "Product";
            const brand = p.brand;
            const cat = p.category ? formatCategoryLabel(p.category) : "";
            return (
              <View key={p.id} style={styles.catalogItem}>
                <Image
                  source={{ uri: p.image_url }}
                  style={styles.catalogItemImage}
                />
                <View style={styles.catalogItemInfo}>
                  <Text style={styles.catalogItemName} numberOfLines={2}>
                    {name}
                  </Text>
                  <Text style={styles.catalogItemMeta} numberOfLines={1}>
                    {brand ? `${brand} · ` : ""}
                    {cat}
                  </Text>
                  <Text style={styles.catalogItemPrice}>
                    ₹{p.price ?? p.base_price ?? 0}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.catalogAddBtn}
                  onPress={() => addProduct(p)}
                  disabled={togglingId === p.id}
                  activeOpacity={0.8}
                >
                  {togglingId === p.id ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Text style={styles.catalogAddBtnText}>Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function AddCustomSection({ storeId, token }: { storeId?: string | null; token?: string }) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const UNITS = ["kg", "g", "l", "ml", "pcs", "units", "bunch", "pack"];

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Camera access is needed.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.8,
    });
    if (!res.canceled) {
      setImageUri(res.assets[0].uri);
      setImageBase64(res.assets[0].base64 || null);
    }
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!res.canceled) {
      setImageUri(res.assets[0].uri);
      setImageBase64(res.assets[0].base64 || null);
    }
  };

  const addCustom = async () => {
    if (!storeId || !token) {
      Alert.alert("Not ready", "Store information is still loading. Please try again in a moment.");
      return;
    }
    if (!name || !category || !unit || !price || !imageUri || !imageBase64) {
      Alert.alert("Missing fields", "All fields marked * are required.");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(
        `${API_BASE}/store-owner/stores/${storeId}/products/custom`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            brand,
            category,
            subcategory,
            unit,
            image_url: `data:image/jpeg;base64,${imageBase64}`,
            price: Number(price),
            quantity: 100,
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
        Alert.alert("Error", "Failed to add product.");
        return;
      }
      Alert.alert("Success", "Custom product added to your stock!");
      setName("");
      setBrand("");
      setCategory("");
      setSubcategory("");
      setUnit("");
      setPrice("");
      setImageUri(null);
      setImageBase64(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.addCustomCard}>
      <Text style={styles.addCustomTitle}>Add Custom Product</Text>
      <Text style={styles.addCustomSubtitle}>Create a product unique to your store.</Text>

      <Text style={styles.addCustomLabel}>Product Name *</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Fresh Tomatoes"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
      />

      <Text style={styles.addCustomLabel}>Brand</Text>
      <TextInput
        value={brand}
        onChangeText={setBrand}
        placeholder="e.g. Local Farm (optional)"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
      />

      <Text style={styles.addCustomLabel}>Category *</Text>
      <TextInput
        value={category}
        onChangeText={setCategory}
        placeholder="e.g. Vegetables"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
      />

      <Text style={styles.addCustomLabel}>Subcategory</Text>
      <TextInput
        value={subcategory}
        onChangeText={setSubcategory}
        placeholder="e.g. Leafy Greens"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
      />

      <Text style={styles.addCustomLabel}>Unit *</Text>
      <View style={styles.addCustomChipsRow}>
        {UNITS.map((u) => (
          <TouchableOpacity
            key={u}
            onPress={() => setUnit(u)}
            style={[
              styles.addCustomChip,
              unit === u && styles.addCustomChipActive,
            ]}
          >
            <Text
              style={[
                styles.addCustomChipText,
                unit === u && styles.addCustomChipTextActive,
              ]}
            >
              {u}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.addCustomLabel}>Product Image *</Text>
      {imageUri ? (
        <View style={styles.addCustomImageBlock}>
          <Image source={{ uri: imageUri }} style={styles.addCustomImage} />
          <View style={styles.addCustomImageActions}>
            <TouchableOpacity style={styles.addCustomSmallBtn} onPress={pickFromCamera}>
              <Text style={styles.addCustomSmallBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addCustomSmallBtn} onPress={pickFromGallery}>
              <Text style={styles.addCustomSmallBtnText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addCustomRemoveBtn}
              onPress={() => {
                setImageUri(null);
                setImageBase64(null);
              }}
            >
              <Text style={styles.addCustomRemoveBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.addCustomImagePicker}>
          <Text style={styles.addCustomImageIcon}>📷</Text>
          <Text style={styles.addCustomImageLabel}>Add a photo of your product</Text>
          <View style={styles.addCustomImageActions}>
            <TouchableOpacity style={styles.addCustomSmallBtn} onPress={pickFromCamera}>
              <Text style={styles.addCustomSmallBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addCustomSmallBtn} onPress={pickFromGallery}>
              <Text style={styles.addCustomSmallBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.addCustomLabel}>Price (₹) *</Text>
      <TextInput
        value={price}
        onChangeText={setPrice}
        placeholder="0"
        placeholderTextColor={colors.textTertiary}
        style={styles.addCustomInput}
        keyboardType="numeric"
      />
      <Text style={styles.addCustomHint}>
        Product will be active and visible when your store is online.
      </Text>

      <TouchableOpacity
        style={[styles.addCustomSubmit, saving && styles.addCustomSubmitDisabled]}
        onPress={addCustom}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.addCustomSubmitText}>Add Custom Product</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
    alignItems: "center",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: -2,
  },

  toggleContainer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceVariant,
    padding: 4,
    borderRadius: radius.lg,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  toggleBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  toggleBtnTextActive: {
    color: colors.surface,
  },

  catalogCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  catalogTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  catalogSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  catalogSearch: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 13,
  },
  catalogCategoryRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  catalogCategoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceVariant,
  },
  catalogCategoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catalogCategoryText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },
  catalogCategoryTextActive: {
    color: colors.surface,
    fontWeight: "600",
  },
  catalogLoading: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  catalogLoadingText: {
    color: colors.textTertiary,
    fontSize: 13,
  },
  skeletonContainer: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  skeletonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  skeletonImage: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  skeletonInfo: {
    flex: 1,
    gap: 2,
  },
  skeletonText: {
    height: 12,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
  },
  skeletonButton: {
    width: 60,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  catalogEmpty: {
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  catalogEmptyTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  catalogEmptyText: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  catalogList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  catalogItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  catalogItemImage: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  catalogItemInfo: {
    flex: 1,
    gap: 2,
  },
  catalogItemName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  catalogItemMeta: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  catalogItemPrice: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  catalogAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  catalogAddBtnText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "700",
  },

  addCustomCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  addCustomTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  addCustomSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  addCustomLabel: {
    color: colors.textTertiary,
    fontSize: 12,
    marginBottom: 6,
    marginTop: 8,
  },
  addCustomInput: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
  },
  addCustomChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  addCustomChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceVariant,
  },
  addCustomChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  addCustomChipText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  addCustomChipTextActive: {
    color: colors.surface,
    fontWeight: "600",
  },
  addCustomImageBlock: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  addCustomImage: {
    width: "100%",
    height: 160,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  addCustomImagePicker: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  addCustomImageIcon: {
    fontSize: 28,
  },
  addCustomImageLabel: {
    color: colors.textTertiary,
    fontSize: 12,
  },
  addCustomImageActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  addCustomSmallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addCustomSmallBtnText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "500",
  },
  addCustomRemoveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  addCustomRemoveBtnText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "500",
  },
  addCustomHint: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 4,
  },
  addCustomSubmit: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  addCustomSubmitDisabled: {
    opacity: 0.6,
  },
  addCustomSubmitText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "700",
  },
});
