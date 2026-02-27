import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { getSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";

const API_BASE = config.API_BASE;

const UNITS = ["kg", "g", "l", "ml", "pcs", "units", "bunch", "pack"];

export default function AddProductScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [mode, setMode] = useState<"catalog" | "custom">("catalog");

  const [query, setQuery] = useState("");
  const [allCatalogProducts, setAllCatalogProducts] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  /** Selected catalog items: { product, quantity } — quantity is the stock the store will have */
  const [selected, setSelected] = useState<Array<{ product: any; quantity: number }>>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);


  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s: any = await getSession();
      if (!s?.token) return;
      setToken(s.token);

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
      if (json?.stores?.length) setStoreId(json.stores[0].id);
    })();
  }, []);

  // Load all master_products as soon as screen opens (so catalog tab is fast)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCatalogLoading(true);
        const res = await fetch(
          `${API_BASE}/api/products/master-products?isActive=true`
        );
        const raw = await res.text();
        let data: any = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = null;
        }
        if (!cancelled) setAllCatalogProducts(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setAllCatalogProducts([]);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      setImageBase64(res.assets[0].base64!);
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
      setImageBase64(res.assets[0].base64!);
    }
  };


  const confirmAddCatalog = async () => {
    if (!token || !storeId || selected.length === 0) return;

    try {
      setSaving(true);

      // Write directly to Supabase products table
      const upsertPromises = selected.map(async ({ product, quantity }) => {
        const { upsertStoreProduct } = await import("../lib/storeProducts");
        return upsertStoreProduct(storeId, product.id, Math.max(0, quantity));
      });

      const results = await Promise.all(upsertPromises);
      const failures = results.filter((r) => r && "error" in r);

      if (failures.length > 0) {
        const firstError = failures[0] as { error: string };
        Alert.alert("Error", `Failed to add some products: ${firstError.error}`);
        return;
      }

      // Invalidate cache so main page refreshes from database
      await AsyncStorage.removeItem("inventory_persisted_state");
      await AsyncStorage.removeItem("inventory_products_cache");

      setSelected([]);
      setQuery("");
      setConfirmOpen(false);
      Alert.alert("Success", "Products added to your inventory. View in Dashboard or Inventory.");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to add products.");
    } finally {
      setSaving(false);
    }
  };

  const addCustom = async () => {
    if (
      !name ||
      !category ||
      !subcategory ||
      !unit ||
      !price ||
      !quantity ||
      !imageUri ||
      !imageBase64
    ) {
      Alert.alert("Missing fields", "All fields are required.");
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
            quantity: Number(quantity),
          }),
        }
      );
      const resRaw = await res.text();
      let json: any = null;
      try {
        json = resRaw ? JSON.parse(resRaw) : null;
      } catch {
        json = null;
      }
      if (!res.ok || !json?.success) {
        Alert.alert("Error", "Failed to add product.");
        return;
      }

      Alert.alert("Success", "Custom product added.");
      setName("");
      setBrand("");
      setCategory("");
      setSubcategory("");
      setUnit("");
      setPrice("");
      setQuantity("");
      setImageUri(null);
      setImageBase64(null);

    } finally {
      setSaving(false);
    }
  };


  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Add Products</Text>
        <Text style={styles.subtitle}>
          Add items from catalog or create a custom product
        </Text>
      </View>

      <View style={styles.tabs}>
        <Tab label="Catalog" active={mode === "catalog"} onPress={() => setMode("catalog")} />
        <Tab label="Custom" active={mode === "custom"} onPress={() => setMode("custom")} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {mode === "catalog" && (
          <>
            <TextInput
              placeholder="Search catalog"
              placeholderTextColor={colors.textTertiary}
              style={styles.search}
              value={query}
              onChangeText={setQuery}
            />

            {catalogLoading && <ActivityIndicator color={colors.primary} />}

            {(() => {
              const q = query.trim().toLowerCase();
              const filtered = q
                ? allCatalogProducts.filter(
                    (p) =>
                      [p.name, p.brand, p.category]
                        .filter(Boolean)
                        .some((s: string) =>
                          String(s).toLowerCase().includes(q)
                        )
                  )
                : allCatalogProducts;
              // Limit rendering to prevent memory issues
              return filtered.slice(0, 50).map((p) => {
              const entry = selected.find((x) => x.product.id === p.id);
              const checked = !!entry;
              const qty = entry?.quantity ?? 0;
              return (
                <View key={p.id} style={styles.catalogItem}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                    onPress={() =>
                      setSelected((prev) =>
                        checked
                          ? prev.filter((x) => x.product.id !== p.id)
                          : [...prev, { product: p, quantity: 1 }]
                      )
                    }
                  >
                    <View style={styles.amountCol}>
                      <Text style={styles.amountText}>₹{p.base_price}</Text>
                    </View>

                    <Image source={{ uri: p.image_url }} style={styles.thumb} />

                    <View style={styles.catalogText}>
                      <Text numberOfLines={2} style={styles.catalogTitle}>
                        {p.name}
                      </Text>
                      <Text style={styles.catalogMeta}>
                        {p.brand ? `${p.brand} · ` : ""}
                        {p.category} · {p.unit}
                      </Text>
                    </View>

                    {checked ? (
                      <View style={styles.qtyStepper}>
                        <TouchableOpacity
                          style={styles.qtyStepperBtn}
                          onPress={() =>
                            setSelected((prev) =>
                              prev.map((item) =>
                                item.product.id === p.id
                                  ? { ...item, quantity: Math.max(0, item.quantity - 1) }
                                  : item
                              )
                            )}
                        >
                          <Text style={styles.qtyStepperText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyStepperNum}>{qty}</Text>
                        <TouchableOpacity
                          style={styles.qtyStepperBtn}
                          onPress={() =>
                            setSelected((prev) =>
                              prev.map((item) =>
                                item.product.id === p.id
                                  ? { ...item, quantity: item.quantity + 1 }
                                  : item
                              )
                            )}
                        >
                          <Text style={styles.qtyStepperText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.check}>○</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
              });
            })()}
          </>
        )}

        {mode === "custom" && (
          <>
            <View style={styles.card}>
              <Field label="Product Name" value={name} onChange={setName} />
              <Field label="Brand" value={brand} onChange={setBrand} />
              <Field label="Category" value={category} onChange={setCategory} />
              <Field label="Subcategory" value={subcategory} onChange={setSubcategory} />

              <Text style={styles.label}>Unit</Text>
              <View style={styles.chips}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    onPress={() => setUnit(u)}
                    style={[styles.chip, unit === u && styles.chipActive]}
                  >
                    <Text style={{ color: colors.textPrimary }}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Product Image</Text>

              {imageUri ? (
                <>
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                  <View style={styles.row}>
                    <Btn label="Camera" onPress={pickFromCamera} />
                    <Btn label="Gallery" onPress={pickFromGallery} />
                    <TouchableOpacity onPress={() => setImageUri(null)}>
                      <Text style={{ color: colors.error }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.row}>
                  <Btn label="Camera" onPress={pickFromCamera} />
                  <Btn label="Gallery" onPress={pickFromGallery} />
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Field label="Price" value={price} onChange={setPrice} keyboardType="numeric" />
              <Field
                label="Quantity"
                value={quantity}
                onChange={setQuantity}
                keyboardType="numeric"
              />
            </View>
          </>
        )}
      </ScrollView>

      {mode === "catalog" && selected.length > 0 && (
        <View style={styles.actionBar}>
          <Text style={{ color: colors.textPrimary }}>
            {selected.length} product{selected.length !== 1 ? "s" : ""} · Set quantities above
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setConfirmOpen(true)}>
            <Text style={styles.primaryText}>Add to store</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === "custom" && (
        <TouchableOpacity style={styles.primaryBtnFull} onPress={addCustom}>
          <Text style={styles.primaryText}>
            {saving ? "Adding..." : "Add Product"}
          </Text>
        </TouchableOpacity>
      )}

      <Modal transparent visible={confirmOpen} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              Add {selected.length} product{selected.length !== 1 ? "s" : ""} to store?
            </Text>
            <Text style={styles.modalText}>
              Stock (quantities) will appear in Inventory. Customers see these when ordering.
            </Text>
            <ScrollView style={{ maxHeight: 200, marginVertical: 8 }}>
              {selected.map(({ product, quantity }) => (
                <Text key={product.id} style={styles.modalRow}>
                  {product.name} × {quantity}
                </Text>
              ))}
            </ScrollView>
            <View style={styles.row}>
              <Btn label="Cancel" onPress={() => setConfirmOpen(false)} />
              <Btn label="Confirm" onPress={confirmAddCatalog} primary />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={{ color: active ? colors.textPrimary : colors.textTertiary }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChange, ...props }: any) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        placeholderTextColor={colors.textTertiary}
        {...props}
      />
    </>
  );
}

function Btn({ label, onPress, primary }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.btn, primary && { backgroundColor: colors.primary }]}
    >
      <Text style={{ color: primary ? colors.surface : colors.textPrimary }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textTertiary },

  tabs: { flexDirection: "row", borderBottomWidth: 1, borderColor: colors.border },
  tab: { flex: 1, padding: 14, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderColor: colors.primary },

  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },

  catalogItem: {
    flexDirection: "row",
    gap: spacing.md,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },

  thumb: { width: 48, height: 48, borderRadius: radius.sm },
  catalogTitle: { color: colors.textPrimary, fontWeight: "600" },
  catalogMeta: { color: colors.textTertiary, fontSize: 12 },
  qtyStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  qtyStepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyStepperText: { fontSize: 16, fontWeight: "700", color: colors.primary },
  qtyStepperNum: { minWidth: 24, textAlign: "center", fontWeight: "700", color: colors.textPrimary },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },

  label: { color: colors.textTertiary, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary },

  sectionTitle: { color: colors.textPrimary, fontWeight: "600", marginBottom: spacing.md },

  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    marginBottom: 10,
  },

  row: { flexDirection: "row", gap: spacing.md, alignItems: "center" },

  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  actionBar: {
    padding: 14,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.md,
  },

  primaryBtnFull: {
    backgroundColor: colors.primary,
    margin: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },

  amountCol: {
    width: 52,
    alignItems: "flex-start",
  },

  amountText: {
    color: colors.success,
    fontWeight: "800",
    fontSize: 14,
  },

  catalogText: {
    flex: 1,
  },

  check: {
    color: colors.textTertiary,
    fontSize: 18,
    marginLeft: 8,
  },

  catalogPrice: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },

  primaryText: { color: colors.surface, fontWeight: "700" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    width: "85%",
  },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  modalText: { color: colors.textTertiary, marginVertical: 12 },
  modalRow: { color: colors.textSecondary, fontSize: 13, marginBottom: 4 },
});
