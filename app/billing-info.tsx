import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { getSession } from "../session";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { config } from "../lib/config";
import { clearStoreCache, forceFetchStores, peekStores } from "../lib/appCache";
import { uploadOwnerImage, OWNER_IMAGE_KEY } from "../lib/storage";
import { fetchBillingInfo, saveBillingInfo, type BillingInfo, type PickedBillingFile } from "../lib/billingInfo";
import VerificationNavBar from "../components/VerificationNavBar";

const API_BASE = config.API_BASE;

export default function BillingInfoScreen() {
  const cachedStoreId = peekStores()?.[0]?.id ?? null;
  const [loading, setLoading] = useState(!cachedStoreId);
  const [storeId, setStoreId] = useState<string | null>(cachedStoreId);
  const [token, setToken] = useState<string | null>(null);

  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [ownerImageUrl, setOwnerImageUrl] = useState<string | null>(null);
  const [uploadingOwnerImage, setUploadingOwnerImage] = useState(false);

  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const [passbookUri, setPassbookUri] = useState<string | null>(null);
  const [pendingPassbookFile, setPendingPassbookFile] = useState<PickedBillingFile | null>(null);
  const [saving, setSaving] = useState(false);

  const applyBillingInfo = (info: BillingInfo) => {
    setOwnerName(info.ownerName);
    setOwnerImageUrl(info.ownerImageUrl);
    setAccountNumber(info.bankAccountNumber ?? "");
    setIfscCode(info.bankIfscCode ?? "");
    setBranchName(info.bankBranchName ?? "");
    setPassbookUri(info.passbookUrl);
  };

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session?.token) {
        router.replace("/landing");
        return;
      }
      setToken(session.token);

      // Always hit the network for the real, current store — a stale cached
      // entry (e.g. a wrong/blank name persisted from an earlier session)
      // would otherwise keep pointing this screen at bad data for up to the
      // cache's 10-minute TTL, and getBillingInfo's ownership check would
      // silently 403 if the cached id ever belonged to a different store.
      const stores = await forceFetchStores(session.token, session.user?.id);
      const store = stores[0];
      if (!store?.id) {
        setLoading(false);
        return;
      }
      setStoreId(store.id);

      try {
        const info = await fetchBillingInfo(session.token, store.id);
        applyBillingInfo(info);
      } catch {
        /* non-fatal — screen still renders with empty state */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pickOwnerImage = async () => {
    if (ownerImageUrl) return; // already set — read-only from here on
    if (!storeId || !token) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const session = await getSession();
    if (!session?.user?.id) return;
    setUploadingOwnerImage(true);
    try {
      const res = await uploadOwnerImage(session.user.id, result.assets[0].uri);
      if (!res.ok) {
        Alert.alert("Upload failed", res.error);
        return;
      }
      await fetch(`${API_BASE}/store-owner/stores/${storeId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ owner_image_url: res.url }),
      });
      clearStoreCache();
      // The Details screen's own avatar reads from this same AsyncStorage key
      // (not a network fetch) — without writing it here too, a photo
      // uploaded from Billing Info would never show up on Details.
      await AsyncStorage.setItem(OWNER_IMAGE_KEY, res.url);
      setOwnerImageUrl(res.url);
    } finally {
      setUploadingOwnerImage(false);
    }
  };

  const pickPassbookFile = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType || "image/jpeg";
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    setPendingPassbookFile({ uri: asset.uri, name: `passbook.${ext}`, type: mimeType });
    setPassbookUri(asset.uri);
  };

  const handleSave = async () => {
    if (!token || !storeId) return;
    if (accountNumber && !/^[0-9]{6,20}$/.test(accountNumber)) {
      Alert.alert("Invalid account number", "Bank account number must be 6-20 digits.");
      return;
    }
    if (ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase())) {
      Alert.alert("Invalid IFSC code", "Expected format e.g. SBIN0001234.");
      return;
    }
    setSaving(true);
    try {
      const res = await saveBillingInfo(token, storeId, {
        bankAccountNumber: accountNumber,
        bankIfscCode: ifscCode.toUpperCase(),
        bankBranchName: branchName,
        file: pendingPassbookFile ?? undefined,
      });
      if (!res.ok) {
        Alert.alert("Error", res.error);
        return;
      }
      setPendingPassbookFile(null);
      Alert.alert("Saved", "Your billing info has been saved.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ animation: "fade" }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ animation: "fade" }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View>
          <VerificationNavBar active="billing" />

          <View style={styles.infoBanner}>
            <View style={styles.infoIconWrap}>
              <Ionicons name="card" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Billing info</Text>
              <Text style={styles.infoText}>Bank details used to pay out your store's earnings.</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="person-outline" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Store Owner</Text>
              </View>
            </View>
            <View style={styles.sectionBody}>
              <View style={styles.avatarRow}>
                <TouchableOpacity
                  style={styles.avatarTouch}
                  onPress={pickOwnerImage}
                  disabled={uploadingOwnerImage || !!ownerImageUrl}
                  activeOpacity={ownerImageUrl ? 1 : 0.8}
                >
                  {uploadingOwnerImage ? (
                    <View style={styles.avatar}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : ownerImageUrl ? (
                    <Image source={{ uri: ownerImageUrl }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatar}>
                      <Ionicons name="person" size={30} color={colors.primary} />
                    </View>
                  )}
                  {!ownerImageUrl && (
                    <View style={styles.camBadge}>
                      <Ionicons name="camera" size={12} color="#fff" />
                    </View>
                  )}
                  {!!ownerImageUrl && (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={11} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Store owner name</Text>
                  <View style={styles.readonlyBox}>
                    <Text style={styles.readonlyText}>{ownerName || "—"}</Text>
                  </View>
                  <Text style={styles.formatHintText}>
                    {ownerImageUrl
                      ? "Photo already on file — locked."
                      : "Tap the circle to add your photo (one-time, becomes read-only after)."}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="business-outline" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Bank Details</Text>
                <Text style={styles.sectionSubtitle}>Used to pay out your earnings</Text>
              </View>
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.fieldLabel}>Bank Account Number</Text>
              <TextInput
                style={styles.fieldInput}
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="e.g. 123456789012"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>IFSC Code</Text>
              <TextInput
                style={styles.fieldInput}
                value={ifscCode}
                onChangeText={setIfscCode}
                placeholder="e.g. SBIN0001234"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Branch Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={branchName}
                onChangeText={setBranchName}
                placeholder="e.g. MG Road Branch"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Passbook / Cheque Photo</Text>
              <TouchableOpacity
                style={[styles.uploadArea, passbookUri && styles.uploadAreaFilled]}
                activeOpacity={0.8}
                onPress={pickPassbookFile}
              >
                {passbookUri ? (
                  <>
                    <Image source={{ uri: passbookUri }} style={styles.preview} resizeMode="cover" />
                    <View style={styles.reuploadOverlay}>
                      <Ionicons name="camera" size={22} color="#fff" />
                      <Text style={styles.reuploadText}>Change</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.uploadIcon}>
                      <Ionicons name="cloud-upload-outline" size={26} color={colors.primary} />
                    </View>
                    <Text style={styles.uploadLabel}>Upload Passbook / Cheque Photo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.55 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Save Billing Info</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, paddingBottom: 60 },

  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.primary + "08",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + "20",
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  infoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  infoText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },

  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surfaceVariant,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + "0C",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  sectionSubtitle: { color: colors.textTertiary, fontSize: 11, marginTop: 1 },
  sectionBody: { padding: spacing.lg },

  avatarRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatarTouch: { position: "relative" },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.surface,
    overflow: "hidden",
  },
  camBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  lockBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },

  fieldLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  fieldInput: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "500",
    borderWidth: 1.5,
    borderColor: colors.primary + "30",
  },
  readonlyBox: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
  },
  readonlyText: { fontSize: 14, color: colors.textPrimary, fontWeight: "600" },
  formatHintText: { color: colors.textTertiary, fontSize: 11, fontWeight: "500", marginTop: 6 },

  uploadArea: {
    marginTop: spacing.xs,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary + "35",
    borderRadius: radius.lg,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary + "04",
    gap: spacing.xs,
    overflow: "hidden",
  },
  uploadAreaFilled: { borderStyle: "solid", borderColor: colors.primary + "60" },
  uploadIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + "0C",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  uploadLabel: { color: colors.primary, fontSize: 14, fontWeight: "700", textAlign: "center", paddingHorizontal: spacing.md },
  preview: { ...StyleSheet.absoluteFillObject },
  reuploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.4)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  reuploadText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    marginTop: spacing.sm,
    ...shadows.md,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
