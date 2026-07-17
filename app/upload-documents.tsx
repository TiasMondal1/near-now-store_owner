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
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { getSession } from "../session";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { fetchStoresCached, peekStores } from "../lib/appCache";
import {
  fetchVerificationDocuments,
  saveVerificationDocument,
  type PickedDocFile,
  type RequiredDocKey,
  type VerificationDocument,
} from "../lib/verificationDocuments";

const DOCUMENT_SECTIONS = [
  { key: "aadhaar", label: "Aadhaar Card", icon: "card-outline" as const, placeholder: "12-digit Aadhaar number" },
  { key: "pan", label: "PAN Card", icon: "id-card-outline" as const, placeholder: "10-character PAN, e.g. ABCDE1234F" },
  { key: "trade", label: "Trade License", icon: "document-text-outline" as const, placeholder: "Trade license number" },
  { key: "gst", label: "GST Certificate", icon: "receipt-outline" as const, placeholder: "15-character GSTIN, e.g. 22AAAAA0000A1Z5" },
  { key: "fssai", label: "FSSAI License", icon: "restaurant-outline" as const, placeholder: "14-digit FSSAI number" },
] as const;

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const FORMATS_DISCLAIMER = "Accepted formats: JPG, PNG, WEBP, PDF · Max size 2MB";

type DocKey = RequiredDocKey;
type DocsState = Record<DocKey, VerificationDocument | null>;

const EMPTY_DOCS = (): DocsState =>
  Object.fromEntries(DOCUMENT_SECTIONS.map((d) => [d.key, null])) as DocsState;

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  return "jpg";
}

export default function UploadDocumentsScreen() {
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverDocs, setServerDocs] = useState<DocsState>(EMPTY_DOCS());
  const [numbers, setNumbers] = useState<Record<DocKey, string>>(
    () => Object.fromEntries(DOCUMENT_SECTIONS.map((d) => [d.key, ""])) as Record<DocKey, string>
  );
  const [pendingFiles, setPendingFiles] = useState<Partial<Record<DocKey, PickedDocFile>>>({});
  const [savingKey, setSavingKey] = useState<DocKey | null>(null);
  const [saving, setSaving] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, []);

  const loadDocuments = async (authToken: string, targetStoreId: string) => {
    const docs = await fetchVerificationDocuments(authToken, targetStoreId);
    const next = EMPTY_DOCS();
    const nextNumbers = { ...numbers };
    for (const doc of docs) {
      next[doc.doc_type] = doc;
      nextNumbers[doc.doc_type] = doc.number ?? "";
    }
    setServerDocs(next);
    setNumbers(nextNumbers);
  };

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

      const cached = peekStores();
      const stores = cached?.length ? cached : await fetchStoresCached(session.token, session.user?.id);
      const store = stores[0];
      if (!store?.id) {
        setLoading(false);
        return;
      }
      setStoreId(store.id);
      if (!cancelled) setLoading(false); // render the form now — don't block on document status

      try {
        await loadDocuments(session.token, store.id); // status badges fill in once this resolves
      } catch {
        /* non-fatal — screen still renders with empty state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestLibraryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to upload documents.");
      return false;
    }
    return true;
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to take a photo.");
      return false;
    }
    return true;
  };

  const applyPickedImage = (key: DocKey, asset: ImagePicker.ImagePickerAsset) => {
    const type = asset.mimeType || "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(type)) {
      Alert.alert("Unsupported format", FORMATS_DISCLAIMER);
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_BYTES) {
      Alert.alert("File too large", FORMATS_DISCLAIMER);
      return;
    }
    setPendingFiles((prev) => ({
      ...prev,
      [key]: { uri: asset.uri, name: asset.fileName || `${key}.${extFromMime(type)}`, type },
    }));
  };

  const takePhoto = async (key: DocKey) => {
    if (!(await requestCameraPermission())) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    applyPickedImage(key, result.assets[0]);
  };

  const pickImage = async (key: DocKey) => {
    if (!(await requestLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    applyPickedImage(key, result.assets[0]);
  };

  const pickPdf = async (key: DocKey) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (asset.size && asset.size > MAX_FILE_SIZE_BYTES) {
      Alert.alert("File too large", FORMATS_DISCLAIMER);
      return;
    }
    setPendingFiles((prev) => ({
      ...prev,
      [key]: { uri: asset.uri, name: asset.name || "document.pdf", type: "application/pdf" },
    }));
  };

  const choosePickerFor = (key: DocKey) => {
    Alert.alert("Upload document", "Choose a source", [
      { text: "Take Photo", onPress: () => takePhoto(key) },
      { text: "Choose Image", onPress: () => pickImage(key) },
      { text: "Upload PDF", onPress: () => pickPdf(key) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const saveOne = async (key: DocKey): Promise<VerificationDocument | null> => {
    if (!token || !storeId) return null;
    const number = numbers[key]?.trim();
    const file = pendingFiles[key];
    const current = serverDocs[key];
    if (!file && (number ?? "") === (current?.number ?? "")) return current; // nothing changed

    setSavingKey(key);
    try {
      const res = await saveVerificationDocument(token, storeId, key, {
        number: number || undefined,
        file,
      });
      if (!res.ok) {
        Alert.alert("Upload failed", res.error);
        return current;
      }
      setServerDocs((prev) => ({ ...prev, [key]: res.document }));
      setPendingFiles((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return res.document;
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const results: Partial<Record<DocKey, VerificationDocument | null>> = {};
      for (const section of DOCUMENT_SECTIONS) {
        results[section.key] = await saveOne(section.key);
      }
      const allApproved = DOCUMENT_SECTIONS.every((s) => results[s.key]?.status === "approved");
      const anySubmitted = DOCUMENT_SECTIONS.every((s) => !!results[s.key]?.url);
      Alert.alert(
        "Saved",
        allApproved
          ? "All documents are approved."
          : anySubmitted
            ? "Your documents have been submitted. Our team will verify them before your shop goes live."
            : "Upload the remaining documents to complete verification."
      );
    } catch {
      Alert.alert("Error", "Failed to save one or more documents. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const uploadedCount = DOCUMENT_SECTIONS.filter((d) => serverDocs[d.key]?.url).length;

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
                Upload clear documents. {uploadedCount} of {DOCUMENT_SECTIONS.length} submitted.
              </Text>
            </View>
          </View>

          {DOCUMENT_SECTIONS.map((section) => {
            const doc = serverDocs[section.key];
            const pendingFile = pendingFiles[section.key];
            const isSavingThis = savingKey === section.key;
            const previewUri = pendingFile?.uri ?? (doc?.url && doc?.status !== "rejected" ? doc.url : doc?.url);
            const isPdf = pendingFile
              ? pendingFile.type === "application/pdf"
              : doc?.url?.toLowerCase().includes(".pdf");

            let statusBadge: {
              icon: React.ComponentProps<typeof Ionicons>["name"];
              text: string;
              color: string;
            } | null = null;
            if (doc?.status === "approved") {
              statusBadge = { icon: "checkmark-circle", text: "Verified", color: colors.success };
            } else if (doc?.status === "rejected") {
              statusBadge = { icon: "close-circle", text: "Needs re-upload", color: colors.error };
            } else if (doc?.url) {
              statusBadge = { icon: "time-outline", text: "Pending review", color: colors.warning };
            }

            return (
              <View key={section.key} style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons name={section.icon} size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{section.label}</Text>
                    <Text style={styles.sectionSubtitle}>
                      {statusBadge ? statusBadge.text : "Required for verification"}
                    </Text>
                  </View>
                  {statusBadge && (
                    <View style={[styles.statusBadge, { backgroundColor: statusBadge.color + "12" }]}>
                      <Ionicons name={statusBadge.icon} size={14} color={statusBadge.color} />
                      <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
                        {statusBadge.text}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.sectionBody}>
                  {doc?.status === "rejected" && doc.rejection_reason ? (
                    <View style={styles.rejectionBanner}>
                      <Ionicons name="alert-circle" size={14} color={colors.error} />
                      <Text style={styles.rejectionText}>{doc.rejection_reason}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.fieldLabel}>Document Number</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={numbers[section.key]}
                    onChangeText={(text) =>
                      setNumbers((prev) => ({ ...prev, [section.key]: text }))
                    }
                    placeholder={section.placeholder}
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="characters"
                  />

                  <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Document File</Text>
                  <TouchableOpacity
                    style={[styles.uploadArea, (pendingFile || doc?.url) && styles.uploadAreaFilled]}
                    activeOpacity={0.8}
                    onPress={() => choosePickerFor(section.key)}
                    disabled={isSavingThis}
                  >
                    {isSavingThis ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : pendingFile || doc?.url ? (
                      isPdf ? (
                        <View style={styles.pdfChip}>
                          <Ionicons name="document-text" size={28} color={colors.primary} />
                          <Text style={styles.pdfChipText} numberOfLines={1}>
                            {pendingFile?.name || "Document.pdf"}
                          </Text>
                        </View>
                      ) : (
                        <>
                          <Image source={{ uri: previewUri! }} style={styles.preview} resizeMode="cover" />
                          <View style={styles.reuploadOverlay}>
                            <Ionicons name="camera" size={22} color="#fff" />
                            <Text style={styles.reuploadText}>Change</Text>
                          </View>
                        </>
                      )
                    ) : (
                      <>
                        <View style={styles.uploadIcon}>
                          <Ionicons name="cloud-upload-outline" size={26} color={colors.primary} />
                        </View>
                        <Text style={styles.uploadLabel}>Upload {section.label}</Text>
                        <Text style={styles.uploadSub}>{FORMATS_DISCLAIMER}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {(pendingFile || doc?.url) && (
                    <Text style={styles.formatsHint}>{FORMATS_DISCLAIMER}</Text>
                  )}
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.55 }]}
            onPress={handleSaveAll}
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
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  sectionBody: { padding: spacing.lg },

  rejectionBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    backgroundColor: colors.error + "0C",
    borderWidth: 1,
    borderColor: colors.error + "30",
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  rejectionText: { color: colors.error, fontSize: 12, fontWeight: "600", flex: 1, lineHeight: 16 },

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
  uploadSub: { color: colors.textTertiary, fontSize: 11, fontWeight: "500", textAlign: "center", paddingHorizontal: spacing.md },
  formatsHint: { color: colors.textTertiary, fontSize: 11, fontWeight: "500", marginTop: 6 },
  preview: { ...StyleSheet.absoluteFillObject },
  reuploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.4)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  reuploadText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  pdfChip: { alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: spacing.lg },
  pdfChipText: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },

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
