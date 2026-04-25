import React, { useEffect, useState, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  FlatList,
  TextInput,
  Alert,
  Image,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { getSession } from "../../session";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, spacing } from "../../lib/theme";
import {
  addCustomMasterProduct,
  formatMasterProductUnit,
  getMasterProductCategories,
  getMasterProductsPage,
  getStoreProductsFromDb,
  unitForLoosePricingBasis,
  upsertStoreProduct,
  CATALOG_PAGE_SIZE,
  type LoosePricingBasis,
} from "../../lib/storeProducts";
import { fetchStoresCached, peekStores } from "../../lib/appCache";

const PLACEHOLDER_IMAGE = require("../../assets/icon.png");

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
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s: any = await getSession();
        if (!s?.token) {
          if (!cancelled) router.replace("/landing");
          return;
        }
        if (cancelled) return;
        setSession(s);

        // Use cached storeId first — avoids network call on tab switch
        const cached = peekStores();
        if (cached && cached.length > 0) {
          setStoreId(cached[0].id);
          setLoading(false);
          return;
        }

        const stores = await fetchStoresCached(s.token, s.user?.id);
        if (cancelled) return;
        if (stores[0]) setStoreId(stores[0].id);
      } catch (e) {
        if (__DEV__) console.warn("[stock] Bootstrap error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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
          <InventoryCatalogSection
            storeId={storeId}
            token={session?.token}
            refreshKey={inventoryRefreshKey}
          />
        )}

        {activeView === "custom" && (
          <AddCustomSection onAdded={() => setInventoryRefreshKey((k) => k + 1)} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InventoryCatalogSection({
  storeId,
  token,
  refreshKey,
}: {
  storeId?: string | null;
  token?: string;
  refreshKey?: number;
}) {
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // catalog products fetched from Supabase, paginated
  const [products, setProducts] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // store products map: masterProductId -> { id, is_active }
  const [storeProductMap, setStoreProductMap] = useState<
    Record<string, { id: string; is_active: boolean }>
  >({});

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load category list (lightweight — just distinct category column)
  useEffect(() => {
    setCategoriesLoading(true);
    getMasterProductCategories()
      .then((cats) => setCategories(cats))
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  }, []);

  // Load store products so we know which master products are already added
  useEffect(() => {
    if (!storeId) return;
    getStoreProductsFromDb(storeId).then((rows) => {
      const map: Record<string, { id: string; is_active: boolean }> = {};
      rows.forEach((sp) => {
        map[sp.master_product_id] = { id: sp.id, is_active: sp.is_active !== false };
      });
      setStoreProductMap(map);
    });
  }, [storeId, refreshKey]);

  // Debounce search input
  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(text);
      setPage(0);
      setProducts([]);
      setHasMore(true);
    }, 350);
  };

  // Category change — reset pagination
  const selectCategory = (cat: string | null) => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);
    setPage(0);
    setProducts([]);
    setHasMore(true);
  };

  // Fetch products whenever category / search / page changes
  useEffect(() => {
    if (!storeId) return;
    setLoadingProducts(true);
    getMasterProductsPage({
      category: selectedCategory,
      search: debouncedSearch,
      from: page * CATALOG_PAGE_SIZE,
    })
      .then(({ data, hasMore: more }) => {
        let results = data;
        if (page === 0 && !selectedCategory && !debouncedSearch) {
          results = [...data].sort(() => Math.random() - 0.5);
        }
        setProducts((prev) => (page === 0 ? results : [...prev, ...results]));
        setHasMore(more);
      })
      .catch(() => { if (page === 0) setProducts([]); })
      .finally(() => setLoadingProducts(false));
  }, [storeId, selectedCategory, debouncedSearch, page]);

  // Products not yet added to this store, deduplicated by id
  const displayProducts = React.useMemo(() => {
    const seen = new Set<string>();
    return products.filter((p) => {
      if (storeProductMap[p.id] || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [products, storeProductMap]);

  const loadMore = () => {
    if (!hasMore || loadingProducts) return;
    setPage((p) => p + 1);
  };

  const addProduct = async (product: any) => {
    if (!storeId || !token) return;
    setTogglingId(product.id);
    try {
      const inserted = await upsertStoreProduct(storeId, product.id);
      if (inserted && "id" in inserted && inserted.id) {
        setStoreProductMap((prev) => ({
          ...prev,
          [product.id]: { id: inserted.id, is_active: true },
        }));
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
      <Text style={styles.catalogTitle}>Add from Near&amp;Now catalog</Text>
      <Text style={styles.catalogSubtitle}>
        Browse master products and add them to your store.
      </Text>

      <TextInput
        value={search}
        onChangeText={handleSearch}
        placeholder="Search products or brands"
        placeholderTextColor={colors.textTertiary}
        style={styles.catalogSearch}
        autoCorrect={false}
        autoCapitalize="none"
      />

      {/* Category chips */}
      {!categoriesLoading && categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catalogCategoryRow}
        >
          {/* All chip */}
          <TouchableOpacity
            onPress={() => selectCategory(null)}
            style={[
              styles.catalogCategoryChip,
              !selectedCategory && styles.catalogCategoryChipActive,
            ]}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.catalogCategoryText,
                !selectedCategory && styles.catalogCategoryTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => selectCategory(cat)}
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

      {/* Skeleton while first page loads */}
      {loadingProducts && products.length === 0 ? (
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
      ) : displayProducts.length === 0 && !loadingProducts ? (
        <View style={styles.catalogEmpty}>
          <Text style={styles.catalogEmptyTitle}>
            {products.length === 0
              ? "No products found"
              : "All products already in your store"}
          </Text>
          <Text style={styles.catalogEmptyText}>
            {products.length === 0
              ? "Try a different search or category."
              : "Check Your Stock on the Home tab to manage them."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayProducts}
          keyExtractor={(p) => p.id}
          scrollEnabled={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          contentContainerStyle={styles.catalogList}
          renderItem={({ item: p }) => {
            const name = p.name || p.product_name || "Product";
            const brand = p.brand;
            const cat = p.category ? formatCategoryLabel(p.category) : "";
            return (
              <CatalogItem
                key={p.id}
                p={p}
                name={name}
                brand={brand}
                cat={cat}
                togglingId={togglingId}
                onAdd={addProduct}
              />
            );
          }}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={loadMore}
                disabled={loadingProducts}
                activeOpacity={0.8}
              >
                {loadingProducts ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.loadMoreBtnText}>Load more</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
}

const CatalogItem = memo(function CatalogItem({
  p,
  name,
  brand,
  cat,
  togglingId,
  onAdd,
}: {
  p: any;
  name: string;
  brand?: string;
  cat: string;
  togglingId: string | null;
  onAdd: (p: any) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const imageSource =
    !imgError && p.image_url
      ? { uri: p.image_url }
      : PLACEHOLDER_IMAGE;

  return (
    <View style={styles.catalogItem}>
      <Image
        source={imageSource}
        style={styles.catalogItemImage}
        onError={() => setImgError(true)}
      />
      <View style={styles.catalogItemInfo}>
        <Text style={styles.catalogItemName} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.catalogItemMeta} numberOfLines={1}>
          {brand ? `${brand} · ` : ""}{cat}
        </Text>
        {p.description ? (
          <Text style={styles.catalogItemDesc} numberOfLines={2}>
            {p.description}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.catalogAddBtn}
        onPress={() => onAdd(p)}
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
});

function AddCustomSection({ onAdded }: { onAdded?: () => void }) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isLoose, setIsLoose] = useState(false);
  const [looseBasis, setLooseBasis] = useState<LoosePricingBasis | null>(null);
  const [packAmount, setPackAmount] = useState("");
  const [packSuffix, setPackSuffix] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageUrlLink, setImageUrlLink] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [discountedPrice, setDiscountedPrice] = useState("");
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [rating, setRating] = useState("");
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
    if (!name.trim() || !category.trim()) {
      Alert.alert("Missing fields", "Name and category are required.");
      return;
    }

    const imageUrl =
      imageBase64 != null
        ? `data:image/jpeg;base64,${imageBase64}`
        : imageUrlLink.trim();
    if (!imageUrl) {
      Alert.alert("Image required", "Add a photo or paste an image URL.");
      return;
    }

    let unitStr = "";
    if (isLoose) {
      if (!looseBasis) {
        Alert.alert("Loose item", "Choose per 1 kg or per 1 litre.");
        return;
      }
      unitStr = unitForLoosePricingBasis(looseBasis);
    } else {
      const pa = Number(String(packAmount).replace(/,/g, "").trim());
      if (!packSuffix || !Number.isFinite(pa) || pa <= 0) {
        Alert.alert("Pack size", "Enter pack amount and unit (e.g. 200 + g).");
        return;
      }
      unitStr = formatMasterProductUnit(pa, packSuffix);
    }

    const base = Number(String(basePrice).replace(/,/g, "").trim());
    const disc = Number(String(discountedPrice).replace(/,/g, "").trim());
    if (!Number.isFinite(base) || base < 0 || !Number.isFinite(disc) || disc < 0) {
      Alert.alert("Pricing", "Enter valid base and selling prices.");
      return;
    }
    if (disc > base) {
      Alert.alert("Pricing", "Selling price cannot be higher than base (MRP).");
      return;
    }

    const minParsed = minQty.trim() === "" ? 1 : Number(String(minQty).replace(/,/g, "").trim());
    const maxParsed = maxQty.trim() === "" ? 100 : Number(String(maxQty).replace(/,/g, "").trim());
    if (!Number.isFinite(minParsed) || minParsed <= 0) {
      Alert.alert("Quantities", "Min quantity must be positive.");
      return;
    }
    if (!Number.isFinite(maxParsed) || maxParsed < minParsed) {
      Alert.alert("Quantities", "Max quantity must be ≥ min quantity.");
      return;
    }

    let ratingVal = 4;
    if (rating.trim() !== "") {
      ratingVal = Number(String(rating).replace(/,/g, "").trim());
      if (!Number.isFinite(ratingVal) || ratingVal < 0 || ratingVal > 5) {
        Alert.alert("Rating", "Rating must be between 0 and 5.");
        return;
      }
    }

    try {
      setSaving(true);
      const result = await addCustomMasterProduct({
        name: name.trim(),
        brand,
        category,
        description: description.trim() || null,
        image_url: imageUrl,
        unit: unitStr,
        base_price: base,
        discounted_price: disc,
        is_loose: isLoose,
        min_quantity: minParsed,
        max_quantity: maxParsed,
        is_active: isActive,
        rating: ratingVal,
        rating_count: 0,
      });
      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to add product.");
        return;
      }
      onAdded?.();
      Alert.alert(
        "Success",
        "Product added to the catalog. Add it to your store from the Inventory tab when ready."
      );
      setName("");
      setBrand("");
      setCategory("");
      setDescription("");
      setIsLoose(false);
      setLooseBasis(null);
      setPackAmount("");
      setPackSuffix("");
      setImageUri(null);
      setImageBase64(null);
      setImageUrlLink("");
      setBasePrice("");
      setDiscountedPrice("");
      setMinQty("");
      setMaxQty("");
      setIsActive(true);
      setRating("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.addCustomCard}>
      {/* Header */}
      <View style={styles.addCustomHeader}>
        <View style={styles.addCustomHeaderIcon}>
          <Ionicons name="add-circle" size={24} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.addCustomTitle}>Add Custom Product</Text>
          <Text style={styles.addCustomSubtitle}>Adds to catalog. Use Inventory to add it to your store.</Text>
        </View>
      </View>

      {/* Section 1: Basic Info */}
      <View style={styles.addCustomSection}>
        <Text style={styles.addCustomSectionLabel}>BASIC INFO</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Product name *"
          placeholderTextColor={colors.textTertiary}
          style={styles.addCustomInput}
        />
        <View style={styles.addCustomRow}>
          <View style={{ flex: 1 }}>
            <TextInput
              value={brand}
              onChangeText={setBrand}
              placeholder="Brand (optional)"
              placeholderTextColor={colors.textTertiary}
              style={styles.addCustomInput}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="Category *"
              placeholderTextColor={colors.textTertiary}
              style={styles.addCustomInput}
            />
          </View>
        </View>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Description (optional)"
          placeholderTextColor={colors.textTertiary}
          style={[styles.addCustomInput, styles.addCustomInputMultiline]}
          multiline
          textAlignVertical="top"
        />
      </View>

      {/* Section 2: Product Image */}
      <View style={styles.addCustomSection}>
        <Text style={styles.addCustomSectionLabel}>PRODUCT IMAGE *</Text>
        {imageUri ? (
          <View style={styles.addCustomImageBlock}>
            <Image source={{ uri: imageUri }} style={styles.addCustomImage} />
            <View style={styles.addCustomImageOverlay}>
              <TouchableOpacity style={styles.addCustomImgOverlayBtn} onPress={pickFromCamera}>
                <Ionicons name="camera" size={16} color="#fff" />
                <Text style={styles.addCustomImgOverlayText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addCustomImgOverlayBtn} onPress={pickFromGallery}>
                <Ionicons name="images" size={16} color="#fff" />
                <Text style={styles.addCustomImgOverlayText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addCustomImgOverlayBtn, styles.addCustomImgOverlayBtnDanger]} onPress={() => { setImageUri(null); setImageBase64(null); }}>
                <Ionicons name="trash" size={16} color="#fff" />
                <Text style={styles.addCustomImgOverlayText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.addCustomImagePicker}>
            <View style={styles.addCustomImagePickerButtons}>
              <TouchableOpacity style={styles.addCustomImgPickBtn} onPress={pickFromCamera} activeOpacity={0.8}>
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
                <Text style={styles.addCustomImgPickBtnText}>Camera</Text>
              </TouchableOpacity>
              <View style={styles.addCustomImgPickDivider} />
              <TouchableOpacity style={styles.addCustomImgPickBtn} onPress={pickFromGallery} activeOpacity={0.8}>
                <Ionicons name="images-outline" size={22} color={colors.primary} />
                <Text style={styles.addCustomImgPickBtnText}>Gallery</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.addCustomImageLabel}>or use an image URL below</Text>
          </View>
        )}
        <TextInput
          value={imageUrlLink}
          onChangeText={setImageUrlLink}
          placeholder="https://… paste URL if no photo"
          placeholderTextColor={colors.textTertiary}
          style={[styles.addCustomInput, { marginTop: spacing.sm }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Section 3: Packaging */}
      <View style={styles.addCustomSection}>
        <Text style={styles.addCustomSectionLabel}>PACKAGING</Text>
        <View style={styles.addCustomSwitchRow}>
          <View style={styles.addCustomSwitchTextCol}>
            <Text style={styles.addCustomSwitchLabel}>Loose item (weighed at counter)</Text>
            <Text style={styles.addCustomSwitchHint}>
              Off = fixed pack size (e.g. 200g, 1L). On = priced per kg or litre.
            </Text>
          </View>
          <Switch
            value={isLoose}
            onValueChange={(on) => { setIsLoose(on); if (on) setLooseBasis((b) => b ?? "kg"); else setLooseBasis(null); }}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        {isLoose ? (
          <>
            <Text style={styles.addCustomLabel}>Priced per *</Text>
            <View style={styles.addCustomChipsRow}>
              {(["kg", "l"] as LoosePricingBasis[]).map((b) => (
                <TouchableOpacity key={b} onPress={() => setLooseBasis(b)} style={[styles.addCustomChip, looseBasis === b && styles.addCustomChipActive]}>
                  <Text style={[styles.addCustomChipText, looseBasis === b && styles.addCustomChipTextActive]}>1 {b === "kg" ? "kg" : "litre"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.addCustomRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addCustomLabel}>Pack amount *</Text>
                <TextInput value={packAmount} onChangeText={setPackAmount} placeholder="e.g. 200" placeholderTextColor={colors.textTertiary} style={styles.addCustomInput} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.addCustomLabel}>Pack unit *</Text>
                <View style={[styles.addCustomChipsRow, { flexWrap: "wrap" }]}>
                  {UNITS.map((u) => (
                    <TouchableOpacity key={u} onPress={() => setPackSuffix(u)} style={[styles.addCustomChip, packSuffix === u && styles.addCustomChipActive]}>
                      <Text style={[styles.addCustomChipText, packSuffix === u && styles.addCustomChipTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </>
        )}
        {(() => {
          if (isLoose && looseBasis) return (
            <Text style={styles.addCustomUnitPreview}>Unit: <Text style={styles.addCustomUnitPreviewValue}>{unitForLoosePricingBasis(looseBasis)}</Text></Text>
          );
          const p = Number(String(packAmount).replace(/,/g, "").trim());
          if (!isLoose && packSuffix && Number.isFinite(p) && p > 0) return (
            <Text style={styles.addCustomUnitPreview}>Unit: <Text style={styles.addCustomUnitPreviewValue}>{formatMasterProductUnit(p, packSuffix)}</Text></Text>
          );
          return null;
        })()}
      </View>

      {/* Section 4: Pricing */}
      <View style={styles.addCustomSection}>
        <Text style={styles.addCustomSectionLabel}>PRICING (₹){isLoose ? ` — per ${looseBasis === "l" ? "1 litre" : "1 kg"}` : ""}</Text>
        <View style={styles.addCustomRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.addCustomLabel}>MRP / Base *</Text>
            <TextInput value={basePrice} onChangeText={setBasePrice} placeholder="0.00" placeholderTextColor={colors.textTertiary} style={styles.addCustomInput} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addCustomLabel}>Selling price *</Text>
            <TextInput value={discountedPrice} onChangeText={setDiscountedPrice} placeholder="≤ base" placeholderTextColor={colors.textTertiary} style={styles.addCustomInput} keyboardType="decimal-pad" />
          </View>
        </View>
      </View>

      {/* Section 5: Order limits */}
      <View style={styles.addCustomSection}>
        <Text style={styles.addCustomSectionLabel}>ORDER LIMITS (optional)</Text>
        <View style={styles.addCustomRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.addCustomLabel}>Min qty</Text>
            <TextInput value={minQty} onChangeText={setMinQty} placeholder="Default 1" placeholderTextColor={colors.textTertiary} style={styles.addCustomInput} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addCustomLabel}>Max qty</Text>
            <TextInput value={maxQty} onChangeText={setMaxQty} placeholder="Default 100" placeholderTextColor={colors.textTertiary} style={styles.addCustomInput} keyboardType="decimal-pad" />
          </View>
        </View>
      </View>

      {/* Section 6: Settings */}
      <View style={[styles.addCustomSection, { marginBottom: 0 }]}>
        <Text style={styles.addCustomSectionLabel}>SETTINGS</Text>
        <View style={styles.addCustomSwitchRow}>
          <View style={styles.addCustomSwitchTextCol}>
            <Text style={styles.addCustomSwitchLabel}>Active on launch</Text>
            <Text style={styles.addCustomSwitchHint}>Product will be visible to customers when your store is online.</Text>
          </View>
          <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: colors.border, true: colors.primary }} />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.addCustomSubmit, saving && styles.addCustomSubmitDisabled]}
        onPress={addCustom}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={18} color={colors.surface} />
            <Text style={styles.addCustomSubmitText}>Add to Catalog</Text>
          </>
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
    paddingVertical: spacing.lg,
  },
  loadMoreBtn: {
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceVariant,
  },
  loadMoreBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
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
  catalogItemDesc: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
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
    gap: spacing.sm,
  },
  addCustomHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  addCustomHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  addCustomTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  addCustomSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  addCustomSection: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  addCustomSectionLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  addCustomRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  addCustomSwitchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: spacing.xs,
    gap: spacing.sm,
  },
  addCustomSwitchTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.sm,
  },
  addCustomSwitchLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  addCustomSwitchHint: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  addCustomInputMultiline: {
    minHeight: 68,
    paddingTop: 10,
  },
  addCustomLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
    marginTop: 4,
  },
  addCustomInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
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
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  addCustomChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addCustomChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  addCustomChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  addCustomChipTextActive: {
    color: colors.surface,
    fontWeight: "700",
  },
  addCustomImageBlock: {
    borderRadius: radius.md,
    overflow: "hidden",
    position: "relative",
  },
  addCustomImage: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
  },
  addCustomImageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  addCustomImgOverlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addCustomImgOverlayBtnDanger: {
    backgroundColor: "rgba(239,68,68,0.45)",
    marginLeft: "auto",
  },
  addCustomImgOverlayText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  addCustomImagePicker: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: "dashed",
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  addCustomImagePickerButtons: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  addCustomImgPickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  addCustomImgPickBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  addCustomImgPickDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  addCustomImageLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    textAlign: "center",
    paddingBottom: spacing.md,
  },
  addCustomAmountHint: {
    color: colors.textTertiary,
    fontSize: 11,
    lineHeight: 15,
  },
  addCustomUnitPreview: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  addCustomUnitPreviewValue: {
    color: colors.primary,
    fontWeight: "700",
  },
  addCustomHint: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 4,
  },
  addCustomSubmit: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  addCustomSubmitDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  addCustomSubmitText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "700",
  },
});
