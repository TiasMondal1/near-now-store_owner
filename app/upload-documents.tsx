import React, { useEffect, useRef, useState } from "react";
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
  Animated,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { getSession } from "../session";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { fetchStoresCached, peekStores, clearStoreCache } from "../lib/appCache";
import { config } from "../lib/config";
import { uploadVerificationDoc } from "../lib/storage";
import { DOCS_STORAGE_KEY } from "../lib/verificationDocuments";

const API_BASE = config.API_BASE;

const DOCUMENT_SECTIONS = [
  { key: "aadhaar", label: "Aadhaar Card", icon: "card-outline" as const, placeholder: "12-digit Aadhaar number" },
  { key: "pan", label: "PAN Card", icon: "id-card-outline" as const, placeholder: "e.g. ABCDE1234F" },
  { key: "trade", label: "Trade License", icon: "document-text-outline" as const, placeholder: "Trade license number" },
  { key: "gst", label: "GST Certificate", icon: "receipt-outline" as const, placeholder: "15-digit GSTIN" },
  { key: "fssai", label: "FSSAI License", icon: "restaurant-outline" as const, placeholder: "14-digit FSSAI number" },
] as const;

type DocKey = (typeof DOCUMENT_SECTIONS)[number]["key"];
type DocEntry = { number: string; url: string | null };
type DocsMap = Record<DocKey, DocEntry>;

const EMPTY_DOCS = (): DocsMap =>
  Object.fromEntries(DOCUMENT_SECTIONS.map((d) => [d.key, { number: "", url: null }])) as DocsMap;

function parseDocs(raw: unknown, legacyType?: string, legacyNumber?: string): DocsMap {
  const docs = EMPTY_DOCS();
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      for (const section of DOCUMENT_SECTIONS) {
        const entry = parsed?.[section.key];
        if (entry) {
          docs[section.key] = {
            number: entry.number ?? "",
            url: entry.url ?? null,
          };
        }
      }
      return docs;
    } catch {
      /* fall through */
    }
  }
  if (raw && typeof raw === "object") {
    for (const section of DOCUMENT_SECTIONS) {
      const entry = (raw as Record<string, DocEntry>)[section.key];
      if (entry) {
        docs[section.key] = {
          number: entry.number ?? "",
          url: entry.url ?? null,
        };
      }
    }
    return docs;
  }
  if (legacyType && DOCUMENT_SECTIONS.some((d) => d.key === legacyType)) {
    docs[legacyType as DocKey] = {
      number: legacyNumber ?? "",
      url: null,
    };
  }
  return docs;
}

export default function UploadDocumentsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocsMap>(EMPTY_DOCS());
  const [uploadingKey, setUploadingKey] = useState<DocKey | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (!session?.token) {
        router.replace("/landing");
        return;
      }
      if (cancelled) return;
      setToken(session.token);

      const selId = await AsyncStorage.getItem("selected_store_id");
      const cached = peekStores();
      const stores = cached?.length
        ? cached
        : await fetchStoresCached(session.token, session.user?.id);
      const store = (selId && stores.find((s: any) => s.id === selId)) || stores[0];
      if (!store?.id) {
        setLoading(false);
        return;
      }

      setStoreId(store.id);

      let hydrated = parseDocs(
        (store as any).verification_documents,
        (store as any).verification_document,
        (store as any).verification_number
      );

      const localRaw = await AsyncStorage.getItem(DOCS_STORAGE_KEY(store.id));
      if (localRaw) {
        try {
          const local = JSON.parse(localRaw) as Partial<DocsMap>;
          for (const section of DOCUMENT_SECTIONS) {
            const localEntry = local[section.key];
            if (!localEntry) continue;
            hydrated[section.key] = {
              number: localEntry.number || hydrated[section.key].number,
              url: localEntry.url || hydrated[section.key].url,
            };
          }
        } catch {
          /* ignore */
        }
      }

      if (!cancelled) {
        setDocs(hydrated);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to upload documents.");
      return false;
    }
    return true;
  };

  const persistLocal = async (next: DocsMap) => {
    if (!storeId) return;
    await AsyncStorage.setItem(DOCS_STORAGE_KEY(storeId), JSON.stringify(next));
  };

  const patchStore = async (fields: Record<string, string>) => {
    if (!token || !storeId) return;
    try {
      await fetch(`${API_BASE}/store-owner/stores/${storeId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fields),
      });
      clearStoreCache();
    } catch {
      /* non-fatal */
    }
  };

  const updateDoc = (key: DocKey, patch: Partial<DocEntry>) => {
    setDocs((prev) => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      persistLocal(next);
      return next;
    });
  };

  const pickDocument = async (key: DocKey) => {
    if (!(await requestPermission()) || !storeId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setUploadingKey(key);
    try {
      const res = await uploadVerificationDoc(storeId, key, uri);
      if (res.ok) {
        updateDoc(key, { url: res.url });
      } else {
        Alert.alert("Upload failed", res.error);
      }
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSave = async () => {
    if (!storeId) return;
    setSaving(true);
    try {
      const payload = JSON.stringify(docs);
      await patchStore({ verification_documents: payload });
      await persistLocal(docs);
      const allUploaded = DOCUMENT_SECTIONS.every((section) => docs[section.key].url);
      Alert.alert(
        "Saved",
        allUploaded
          ? "All documents saved. Our team will verify them before your shop goes live to customers."
          : "Your documents have been saved. Upload the remaining documents to complete verification."
      );
    } catch {
      Alert.alert("Error", "Failed to save documents. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const uploadedCount = DOCUMENT_SECTIONS.filter((d) => docs[d.key].url).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Upload Documents</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={styles.infoBanner}>
            <View style={styles.infoIconWrap}>
              <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Shop verification</Text>
              <Text style={styles.infoText}>
                Upload clear photos of each document. {uploadedCount} of {DOCUMENT_SECTIONS.length} uploaded.
              </Text>
            </View>
          </View>

          {DOCUMENT_SECTIONS.map((section) => {
            const entry = docs[section.key];
            const isUploading = uploadingKey === section.key;
            const isUploaded = Boolean(entry.url);

            return (
              <View key={section.key} style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons name={section.icon} size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{section.label}</Text>
                    <Text style={styles.sectionSubtitle}>
                      {isUploaded ? "Document uploaded" : "Required for verification"}
                    </Text>
                  </View>
                  {isUploaded && (
                    <View style={styles.uploadedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={styles.uploadedBadgeText}>Done</Text>
                    </View>
                  )}
                </View>

                <View style={styles.sectionBody}>
                  <Text style={styles.fieldLabel}>Document Number</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={entry.number}
                    onChangeText={(text) => updateDoc(section.key, { number: text })}
                    placeholder={section.placeholder}
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="characters"
                  />

                  <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Document Image</Text>
                  <TouchableOpacity
                    style={[styles.uploadArea, isUploaded && styles.uploadAreaFilled]}
                    activeOpacity={0.8}
                    onPress={() => pickDocument(section.key)}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : isUploaded && entry.url ? (
                      <>
                        <Image source={{ uri: entry.url }} style={styles.preview} resizeMode="cover" />
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
                        <Text style={styles.uploadLabel}>Upload {section.label}</Text>
                        <Text style={styles.uploadSub}>JPG or PNG · max 5 MB</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

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
                <Text style={styles.saveBtnText}>Save Documents</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
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
  uploadedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.success + "12",
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  uploadedBadgeText: { color: colors.success, fontSize: 11, fontWeight: "700" },
  sectionBody: { padding: spacing.lg },

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
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "500",
    borderWidth: 1.5,
    borderColor: colors.primary + "30",
  },

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
  uploadLabel: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  uploadSub: { color: colors.textTertiary, fontSize: 11, fontWeight: "500" },
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
