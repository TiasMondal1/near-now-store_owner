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
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getSession } from "../session";
import {
  addCustomMasterProduct,
  formatMasterProductUnit,
  unitForLoosePricingBasis,
  type LoosePricingBasis,
} from "../lib/storeProducts";
import { colors, radius, spacing } from "../lib/theme";
const UNITS = ["kg", "g", "l", "ml", "pcs", "units", "bunch", "pack"];

export default function AddCustomProductScreen() {
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

  useEffect(() => {
    (async () => {
      const s: any = await getSession();
      if (!s?.token) router.replace("/landing");
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
        Alert.alert("Loose item", "Choose whether prices are per 1 kg or per 1 litre.");
        return;
      }
      unitStr = unitForLoosePricingBasis(looseBasis);
    } else {
      const pa = Number(String(packAmount).replace(/,/g, "").trim());
      if (!packSuffix || !Number.isFinite(pa) || pa <= 0) {
        Alert.alert(
          "Pack size",
          "Enter pack amount and unit (e.g. 200 + g for a 200g pack)."
        );
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
      Alert.alert("Quantities", "Min quantity must be a positive number.");
      return;
    }
    if (!Number.isFinite(maxParsed) || maxParsed < minParsed) {
      Alert.alert("Quantities", "Max quantity must be at least min quantity.");
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

      Alert.alert(
        "Success",
        "Product added to the catalog. Add it to your store from Inventory when you are ready."
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Add Custom Product</Text>
          <Text style={styles.subtitle}>Adds to catalog only — link to your store from Inventory</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Product Details</Text>
          <Field label="Product Name *" value={name} onChange={setName} placeholder="e.g. Fresh Tomatoes" />
          <Field label="Brand" value={brand} onChange={setBrand} placeholder="e.g. Local Farm (optional)" />
          <Field label="Category *" value={category} onChange={setCategory} placeholder="e.g. Vegetables" />
          <FieldMultiline
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="Short description (optional)"
          />

          <View style={styles.switchRow}>
            <View style={styles.switchRowText}>
              <Text style={styles.switchLabel}>Loose item</Text>
              <Text style={styles.switchHint}>
                On: sold loose at counter — no pack size. Off: set pack amount and unit below.
              </Text>
            </View>
            <Switch
              value={isLoose}
              onValueChange={(on) => {
                setIsLoose(on);
                if (on) setLooseBasis((b) => b ?? "kg");
                else setLooseBasis(null);
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {isLoose && (
            <>
              <Text style={styles.label}>Priced per *</Text>
              <Text style={styles.hintBelowField}>
                Base and selling prices apply to 1 kg or 1 litre (stored as unit 1kg or 1l).
              </Text>
              <View style={styles.chips}>
                <TouchableOpacity
                  onPress={() => setLooseBasis("kg")}
                  style={[styles.chip, looseBasis === "kg" && styles.chipActive]}
                >
                  <Text style={[styles.chipText, looseBasis === "kg" && styles.chipTextActive]}>1 kg</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setLooseBasis("l")}
                  style={[styles.chip, looseBasis === "l" && styles.chipActive]}
                >
                  <Text style={[styles.chipText, looseBasis === "l" && styles.chipTextActive]}>1 litre</Text>
                </TouchableOpacity>
              </View>
              {looseBasis ? (
                <Text style={styles.unitPreview}>
                  Stored unit:{" "}
                  <Text style={styles.unitPreviewValue}>{unitForLoosePricingBasis(looseBasis)}</Text>
                </Text>
              ) : null}
            </>
          )}

          {!isLoose && (
            <>
              <Field
                label="Pack amount (number) *"
                value={packAmount}
                onChange={setPackAmount}
                keyboardType="decimal-pad"
                placeholder="e.g. 200, 0.5, 300"
              />
              <Text style={styles.hintBelowField}>
                Fixed pack: number + unit below (e.g. 200 + g → 200g).
              </Text>
              <Text style={styles.label}>Pack unit *</Text>
              <View style={styles.chips}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    onPress={() => setPackSuffix(u)}
                    style={[styles.chip, packSuffix === u && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, packSuffix === u && styles.chipTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {(() => {
                const p = Number(String(packAmount).replace(/,/g, "").trim());
                if (!packSuffix || !Number.isFinite(p) || p <= 0) return null;
                return (
                  <Text style={styles.unitPreview}>
                    Stored unit:{" "}
                    <Text style={styles.unitPreviewValue}>
                      {formatMasterProductUnit(p, packSuffix)}
                    </Text>
                  </Text>
                );
              })()}
            </>
          )}
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
          <Field
            label="Or paste image URL (https://…)"
            value={imageUrlLink}
            onChange={setImageUrlLink}
            placeholder="Optional if you added a photo above"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pricing</Text>
          <Field
            label={
              isLoose
                ? `Base price / MRP (₹) per ${looseBasis === "l" ? "1 litre" : "1 kg"} *`
                : "Base price / MRP (₹) *"
            }
            value={basePrice}
            onChange={setBasePrice}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <Field
            label={
              isLoose
                ? `Selling price (₹) per ${looseBasis === "l" ? "1 litre" : "1 kg"} *`
                : "Selling / discounted price (₹) *"
            }
            value={discountedPrice}
            onChange={setDiscountedPrice}
            keyboardType="decimal-pad"
            placeholder="Must be ≤ base price"
          />
          <Text style={styles.hintBelowField}>
            {isLoose
              ? "Loose: both prices are for the same 1 kg or 1 litre basis. Selling ≤ base."
              : "Selling price cannot exceed base (MRP)."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order limits & visibility</Text>
          <Field
            label="Min quantity (optional)"
            value={minQty}
            onChange={setMinQty}
            keyboardType="decimal-pad"
            placeholder="Default 1"
          />
          <Field
            label="Max quantity (optional)"
            value={maxQty}
            onChange={setMaxQty}
            keyboardType="decimal-pad"
            placeholder="Default 100"
          />
          <Field
            label="Rating (optional)"
            value={rating}
            onChange={setRating}
            keyboardType="decimal-pad"
            placeholder="0–5, default 4"
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Product active</Text>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
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

function FieldMultiline({ label, value, onChange, placeholder }: any) {
  return (
    <View style={styles.fieldMultilineWrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={[styles.input, styles.inputMultiline]}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline
        textAlignVertical="top"
      />
    </View>
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
  fieldMultilineWrapper: {
    marginBottom: spacing.md,
    width: "100%",
  },
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

  switchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  switchRowText: { flex: 1, minWidth: 0, paddingRight: spacing.sm },
  switchLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  switchHint: { color: colors.textTertiary, fontSize: 11, marginTop: 6, lineHeight: 16 },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12,
    marginBottom: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  hintBelowField: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: -6,
    marginBottom: 12,
    lineHeight: 15,
  },
  unitPreview: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 10,
  },
  unitPreviewValue: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
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
