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

const API_BASE = "http://192.168.1.117:3001";

const COLORS = {
  bg: "#05030A",
  card: "#120D24",
  soft: "#181134",
  border: "#2F245A",
  primary: "#7B6EF6",
  text: "#FFFFFF",
  muted: "#9C94D7",
  danger: "#FF6B6B",
};

const UNITS = ["kg", "g", "l", "ml", "pcs", "units", "bunch", "pack"];

export default function AddProductScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [mode, setMode] = useState<"catalog" | "custom">("catalog");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any[]>([]);
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

      const res = await fetch(`${API_BASE}/store-owner/stores`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const json = await res.json();
      if (json?.stores?.length) setStoreId(json.stores[0].id);
    })();
  }, []);

  useEffect(() => {
    if (mode !== "catalog" || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${API_BASE}/master-products/search?q=${encodeURIComponent(query)}`
        );
        const json = await res.json();
        setResults(json.products || []);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [query, mode]);

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

      const res = await fetch(
        `${API_BASE}/store-owner/stores/${storeId}/products/bulk-from-master`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: selected.map((p) => ({
              masterProductId: p.id,
              price: p.base_price,
              quantity: 0,
            })),
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        Alert.alert("Error", "Failed to add products.");
        return;
      }

      setSelected([]);
      setQuery("");
      setConfirmOpen(false);
      Alert.alert("Success", "Products added.");
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

      const json = await res.json();
      if (!res.ok || !json.success) {
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
              placeholderTextColor={COLORS.muted}
              style={styles.search}
              value={query}
              onChangeText={setQuery}
            />

            {loading && <ActivityIndicator color={COLORS.primary} />}

            {results.map((p) => {
              const checked = selected.some((x) => x.id === p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.catalogItem}
                  onPress={() =>
                    setSelected((prev) =>
                      checked ? prev.filter((x) => x.id !== p.id) : [...prev, p]
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

                  <Text style={styles.check}>
                    {checked ? "✓" : "○"}
                  </Text>
                </TouchableOpacity>

              );
            })}
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
                    <Text style={{ color: COLORS.text }}>{u}</Text>
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
                      <Text style={{ color: COLORS.danger }}>Remove</Text>
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
          <Text style={{ color: COLORS.text }}>
            {selected.length} selected
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setConfirmOpen(true)}>
            <Text style={styles.primaryText}>Add</Text>
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
              Add {selected.length} products?
            </Text>
            <Text style={styles.modalText}>
              Products will be added using catalog data.
            </Text>

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
      <Text style={{ color: active ? COLORS.text : COLORS.muted }}>
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
        placeholderTextColor={COLORS.muted}
        {...props}
      />
    </>
  );
}

function Btn({ label, onPress, primary }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.btn, primary && { backgroundColor: COLORS.primary }]}
    >
      <Text style={{ color: primary ? "#fff" : COLORS.text }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 16 },
  title: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
  subtitle: { color: COLORS.muted },

  tabs: { flexDirection: "row", borderBottomWidth: 1, borderColor: COLORS.border },
  tab: { flex: 1, padding: 14, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderColor: COLORS.primary },

  search: {
    backgroundColor: COLORS.soft,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },

  catalogItem: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },

  thumb: { width: 48, height: 48, borderRadius: 10 },
  catalogTitle: { color: COLORS.text, fontWeight: "600" },
  catalogMeta: { color: COLORS.muted, fontSize: 12 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },

  label: { color: COLORS.muted, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.soft,
    borderRadius: 12,
    padding: 12,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary },

  sectionTitle: { color: COLORS.text, fontWeight: "600", marginBottom: 12 },

  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginBottom: 10,
  },

  row: { flexDirection: "row", gap: 12, alignItems: "center" },

  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  actionBar: {
    padding: 14,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },

  primaryBtnFull: {
    backgroundColor: COLORS.primary,
    margin: 16,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },

  amountCol: {
    width: 52,
    alignItems: "flex-start",
  },

  amountText: {
    color: "#2ECC71",
    fontWeight: "800",
    fontSize: 14,
  },

  catalogText: {
    flex: 1,
  },

  check: {
    color: COLORS.muted,
    fontSize: 18,
    marginLeft: 8,
  },


  catalogPrice: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },


  primaryText: { color: "#fff", fontWeight: "700" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderRadius: 16,
    width: "85%",
  },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  modalText: { color: COLORS.muted, marginVertical: 12 },
});
