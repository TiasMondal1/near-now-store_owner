import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getSession } from "../session";
import { config } from "../lib/config";
import { colors, radius, spacing } from "../lib/theme";
const API_BASE = config.API_BASE;

const UNITS = ["kg", "g", "l", "ml", "pcs", "units", "bunch", "pack"];

export default function AddCustomProductScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

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
      try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
      if (json?.stores?.length) setStoreId(json.stores[0].id);
    })();
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

  const addCustom = async () => {
    if (
      !name ||
      !category ||
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Add Custom Product</Text>
          <Text style={styles.subtitle}>Create a product unique to your store</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Product Details</Text>
          <Field label="Product Name *" value={name} onChange={setName} placeholder="e.g. Fresh Tomatoes" />
          <Field label="Brand" value={brand} onChange={setBrand} placeholder="e.g. Local Farm (optional)" />
          <Field label="Category *" value={category} onChange={setCategory} placeholder="e.g. Vegetables" />
          <Field label="Subcategory" value={subcategory} onChange={setSubcategory} placeholder="e.g. Leafy Greens" />

          <Text style={styles.label}>Unit *</Text>
          <View style={styles.chips}>
            {UNITS.map((u) => (
              <TouchableOpacity
                key={u}
                onPress={() => setUnit(u)}
                style={[styles.chip, unit === u && styles.chipActive]}
              >
                <Text style={[styles.chipText, unit === u && styles.chipTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Product Image *</Text>
          {imageUri ? (
            <View>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              <View style={styles.row}>
                <Btn label="📷  Retake" onPress={pickFromCamera} />
                <Btn label="🖼  Gallery" onPress={pickFromGallery} />
                <TouchableOpacity style={styles.removeBtn} onPress={() => { setImageUri(null); setImageBase64(null); }}>
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.imagePicker}>
              <Text style={styles.imagePickerIcon}>📷</Text>
              <Text style={styles.imagePickerLabel}>Add a photo of your product</Text>
              <View style={styles.row}>
                <Btn label="Camera" onPress={pickFromCamera} />
                <Btn label="Gallery" onPress={pickFromGallery} />
              </View>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pricing & Stock</Text>
          <Field label="Price (₹) *" value={price} onChange={setPrice} keyboardType="numeric" placeholder="0" />
          <Field label="Initial Quantity *" value={quantity} onChange={setQuantity} keyboardType="numeric" placeholder="0" />
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <TouchableOpacity
        style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
        onPress={addCustom}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.submitBtnText}>Add Custom Product</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, ...props }: any) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        {...props}
      />
    </>
  );
}

function Btn({ label, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.btn}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  backArrow: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  headerText: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: "700" },
  subtitle: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },

  scrollContent: { padding: spacing.lg },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: spacing.md,
  },

  label: { color: colors.textTertiary, fontSize: 12, marginBottom: 6, marginTop: 2 },
  input: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    fontSize: 14,
  },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceVariant,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: colors.surface, fontWeight: "600" },

  imagePicker: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: "dashed",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  imagePickerIcon: { fontSize: 32 },
  imagePickerLabel: { color: colors.textTertiary, fontSize: 13, marginBottom: spacing.sm },

  imagePreview: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    resizeMode: "cover",
  },

  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center", flexWrap: "wrap" },

  btn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceVariant,
  },
  btnText: { color: colors.textPrimary, fontSize: 13, fontWeight: "500" },

  removeBtn: { paddingVertical: 9, paddingHorizontal: 12 },
  removeBtnText: { color: colors.error, fontSize: 13, fontWeight: "500" },

  submitBtn: {
    backgroundColor: colors.primary,
    margin: spacing.lg,
    marginTop: 0,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: colors.surface, fontWeight: "700", fontSize: 16 },
});
