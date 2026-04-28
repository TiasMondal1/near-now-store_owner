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
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { getSession, clearSession } from "../session";
import { colors, radius, spacing } from "../lib/theme";
import { fetchStoresCached, peekStores, clearStoreCache } from "../lib/appCache";
import { config } from "../lib/config";
import { uploadStoreImage, uploadOwnerImage, uploadVerificationDoc } from "../lib/storage";

const API_BASE = config.API_BASE;
const OWNER_IMAGE_KEY = "owner_profile_image_url";

const DOC_TYPES = [
  { key: "aadhaar", label: "Aadhaar Card" },
  { key: "pan", label: "PAN Card" },
  { key: "fssai", label: "FSSAI License" },
  { key: "gst", label: "GST Certificate" },
  { key: "trade", label: "Trade License" },
  { key: "other", label: "Other" },
];

export default function ProfileScreen() {
  const [session, setSession] = useState<any>(null);
  const [storeInfo, setStoreInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable store fields
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");

  // Images
  const [ownerImageUri, setOwnerImageUri] = useState<string | null>(null);
  const [storeImageUri, setStoreImageUri] = useState<string | null>(null);
  const [uploadingOwnerImage, setUploadingOwnerImage] = useState(false);
  const [uploadingStoreImage, setUploadingStoreImage] = useState(false);

  // Verification docs
  const [docType, setDocType] = useState("aadhaar");
  const [docNumber, setDocNumber] = useState("");
  const [docImageUri, setDocImageUri] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docPickerVisible, setDocPickerVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getSession();
      if (!s?.token) { router.replace("/landing"); return; }
      if (cancelled) return;
      setSession(s);

      // Load persisted owner image
      const savedOwnerImg = await AsyncStorage.getItem(OWNER_IMAGE_KEY);
      if (!cancelled && savedOwnerImg) setOwnerImageUri(savedOwnerImg);

      const cached = peekStores();
      if (cached?.length) {
        hydrate(cached[0]);
        fetchStoresCached(s.token, s.user?.id).then((fresh) => {
          if (!cancelled && fresh.length) hydrate(fresh[0]);
        });
      } else {
        const stores = await fetchStoresCached(s.token, s.user?.id);
        if (!cancelled && stores.length) hydrate(stores[0]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const hydrate = (store: any) => {
    setStoreInfo(store);
    setStoreName(store.name ?? "");
    setStoreAddress(store.address ?? "");
    setStorePhone(store.phone ?? "");
    if (store.image_url) setStoreImageUri(store.image_url);
    if (store.verification_document) setDocType(store.verification_document);
    if (store.verification_number) setDocNumber(store.verification_number);
  };

  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to upload images.");
      return false;
    }
    return true;
  };

  const pickStoreImage = async () => {
    if (!(await requestPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setStoreImageUri(uri);
    setUploadingStoreImage(true);
    try {
      const res = await uploadStoreImage(storeInfo?.id ?? "unknown", uri);
      if (res.ok) {
        await patchStore({ image_url: res.url });
        setStoreImageUri(res.url);
      } else {
        Alert.alert("Upload failed", res.error);
      }
    } finally {
      setUploadingStoreImage(false);
    }
  };

  const pickOwnerImage = async () => {
    if (!(await requestPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setOwnerImageUri(uri);
    setUploadingOwnerImage(true);
    try {
      const res = await uploadOwnerImage(session?.user?.id ?? "unknown", uri);
      if (res.ok) {
        // Save remote URL so it persists across sessions
        await AsyncStorage.setItem(OWNER_IMAGE_KEY, res.url);
        setOwnerImageUri(res.url);
        // Also persist to store row if column exists
        await patchStore({ owner_image_url: res.url });
      } else {
        // Fallback: save local URI in AsyncStorage
        await AsyncStorage.setItem(OWNER_IMAGE_KEY, uri);
      }
    } finally {
      setUploadingOwnerImage(false);
    }
  };

  const pickDocImage = async () => {
    if (!(await requestPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setDocImageUri(uri);
    setUploadingDoc(true);
    try {
      const res = await uploadVerificationDoc(storeInfo?.id ?? "unknown", docType, uri);
      if (res.ok) setDocImageUri(res.url);
      // Save doc type and number to store record
      await patchStore({
        verification_document: docType,
        ...(docNumber.trim() ? { verification_number: docNumber.trim() } : {}),
      });
    } finally {
      setUploadingDoc(false);
    }
  };

  const patchStore = async (fields: Record<string, string>) => {
    if (!session?.token || !storeInfo?.id) return;
    try {
      await fetch(`${API_BASE}/store-owner/stores/${storeInfo.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fields),
      });
      clearStoreCache();
    } catch { /* non-fatal */ }
  };

  const handleSave = async () => {
    if (!session?.token || !storeInfo?.id) return;
    setSaving(true);
    try {
      const patch: Record<string, string> = {};
      if (storeName.trim()) patch.name = storeName.trim();
      if (storeAddress.trim()) patch.address = storeAddress.trim();
      if (storePhone.trim()) patch.phone = storePhone.trim();
      if (docNumber.trim()) patch.verification_number = docNumber.trim();
      if (docType) patch.verification_document = docType;

      await patchStore(patch);
      const fresh = await fetchStoresCached(session.token, session.user?.id);
      if (fresh.length) hydrate(fresh[0]);
      setEditing(false);
    } catch {
      Alert.alert("Error", "Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (storeInfo) hydrate(storeInfo);
    setEditing(false);
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await clearSession();
          router.replace("/landing");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const ownerInitial = (session?.user?.name || "?").charAt(0).toUpperCase();
  const selectedDocLabel = DOC_TYPES.find((d) => d.key === docType)?.label ?? "Select type";

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profile</Text>
        {!editing ? (
          <TouchableOpacity style={styles.editChip} onPress={() => setEditing(true)} activeOpacity={0.8}>
            <Ionicons name="pencil" size={14} color={colors.primary} />
            <Text style={styles.editChipText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleCancel} style={styles.cancelChip} activeOpacity={0.8}>
            <Text style={styles.cancelChipText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Store Hero Banner */}
          <View style={styles.heroBanner}>
            <TouchableOpacity
              style={styles.heroBannerTouch}
              activeOpacity={editing ? 0.75 : 1}
              onPress={editing ? pickStoreImage : undefined}
              disabled={uploadingStoreImage}
            >
              {storeImageUri ? (
                <Image source={{ uri: storeImageUri }} style={styles.heroBannerImage} resizeMode="cover" />
              ) : (
                <View style={[styles.heroBannerImage, styles.heroBannerPlaceholder]}>
                  <Ionicons name="storefront-outline" size={52} color={colors.primary + "55"} />
                  {editing && <Text style={styles.heroBannerHint}>Add store photo</Text>}
                </View>
              )}
              {uploadingStoreImage && (
                <View style={styles.heroUploadOverlay}>
                  <ActivityIndicator color="#fff" size="large" />
                </View>
              )}
              {editing && !uploadingStoreImage && (
                <View style={styles.heroEditBadge}>
                  <Ionicons name="camera" size={13} color="#fff" />
                  <Text style={styles.heroEditBadgeText}>Change photo</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Owner avatar pinned to bottom-left of banner */}
            <View style={styles.ownerAvatarAnchor}>
              <TouchableOpacity
                activeOpacity={editing ? 0.7 : 1}
                onPress={editing ? pickOwnerImage : undefined}
                disabled={uploadingOwnerImage}
                style={styles.ownerAvatarTouch}
              >
                {uploadingOwnerImage ? (
                  <View style={styles.ownerAvatar}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : ownerImageUri ? (
                  <Image source={{ uri: ownerImageUri }} style={styles.ownerAvatar} />
                ) : (
                  <View style={styles.ownerAvatar}>
                    <Text style={styles.ownerAvatarText}>{ownerInitial}</Text>
                  </View>
                )}
                {editing && !uploadingOwnerImage && (
                  <View style={styles.ownerCamBadge}>
                    <Ionicons name="camera" size={11} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Store name + status — shown next to avatar */}
          <View style={styles.heroInfo}>
            <Text style={styles.heroStoreName} numberOfLines={1}>
              {storeName || storeInfo?.name || "My Store"}
            </Text>
            {storeInfo && (
              <View style={[styles.statusPill, { backgroundColor: storeInfo.is_active ? colors.success + "18" : colors.error + "18" }]}>
                <View style={[styles.statusDot, { backgroundColor: storeInfo.is_active ? colors.success : colors.error }]} />
                <Text style={[styles.statusPillText, { color: storeInfo.is_active ? colors.success : colors.error }]}>
                  {storeInfo.is_active ? "Online" : "Offline"}
                </Text>
              </View>
            )}
          </View>

          {/* Personal Information */}
          <SectionCard title="Account" icon="person-outline">
            <InfoRow icon="person" label="Owner" value={session?.user?.name ?? "—"} />
            <Divider />
            <InfoRow icon="call" label="Phone" value={session?.user?.phone ?? "—"} />
            {session?.user?.email ? (
              <>
                <Divider />
                <InfoRow icon="mail" label="Email" value={session.user.email} />
              </>
            ) : null}
          </SectionCard>

          {/* Store Information */}
          <SectionCard title="Store Information" icon="storefront-outline">
            <Field label="Store Name" value={storeName} editing={editing} onChangeText={setStoreName} placeholder="Your store name" icon="bag-handle" />
            <Divider />
            <Field label="Address" value={storeAddress} editing={editing} onChangeText={setStoreAddress} placeholder="Store address" multiline icon="location" />
            <Divider />
            <Field label="Contact Phone" value={storePhone} editing={editing} onChangeText={setStorePhone} placeholder="Store contact number" keyboardType="phone-pad" icon="call-outline" />
            {storeInfo?.delivery_radius_km != null && (
              <>
                <Divider />
                <InfoRow icon="navigate-circle" label="Delivery Radius" value={`${storeInfo.delivery_radius_km} km`} />
              </>
            )}
          </SectionCard>

          {/* Verification Documents */}
          <SectionCard title="Verification Documents" icon="shield-checkmark-outline">
            <View style={styles.docTypeRow}>
              <Text style={styles.fieldLabel}>Document Type</Text>
              <TouchableOpacity style={styles.docTypeBtn} onPress={() => setDocPickerVisible(true)} activeOpacity={0.8}>
                <Text style={styles.docTypeBtnText}>{selectedDocLabel}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Divider />
            <Field
              label="Document Number"
              value={docNumber}
              editing
              onChangeText={setDocNumber}
              placeholder="e.g. XXXXXXXXXX"
              icon="card"
              autoCapitalize="characters"
            />
            <Divider />
            <View style={styles.docUploadSection}>
              <Text style={styles.fieldLabel}>Document Image</Text>
              <TouchableOpacity
                style={[styles.docUploadArea, docImageUri && styles.docUploadAreaFilled]}
                activeOpacity={0.8}
                onPress={pickDocImage}
                disabled={uploadingDoc}
              >
                {uploadingDoc ? (
                  <ActivityIndicator color={colors.primary} />
                ) : docImageUri ? (
                  <>
                    <Image source={{ uri: docImageUri }} style={styles.docPreview} resizeMode="cover" />
                    <View style={styles.docReuploadOverlay}>
                      <Ionicons name="camera" size={22} color="#fff" />
                      <Text style={styles.docReuploadText}>Change</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.docUploadIcon}>
                      <Ionicons name="cloud-upload-outline" size={28} color={colors.primary} />
                    </View>
                    <Text style={styles.docUploadLabel}>Upload {selectedDocLabel}</Text>
                    <Text style={styles.docUploadSub}>JPG or PNG · max 5 MB</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </SectionCard>

          {/* Account meta */}
          <SectionCard title="Account Details" icon="person-circle-outline">
            <InfoRow
              icon="shield-checkmark"
              label="Status"
              value={session?.user?.isActivated ? "Active" : "Pending"}
              valueColor={session?.user?.isActivated ? colors.success : colors.warning}
            />
            {storeInfo?.created_at && (
              <>
                <Divider />
                <InfoRow
                  icon="calendar"
                  label="Member Since"
                  value={new Date(storeInfo.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                />
              </>
            )}
          </SectionCard>

          {/* Save */}
          {editing && (
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
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>

          <Text style={styles.version}>Near &amp; Now · Store Owner v1.0</Text>
        </Animated.View>
      </ScrollView>

      {/* Document type picker */}
      <Modal visible={docPickerVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setDocPickerVisible(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Select Document Type</Text>
          {DOC_TYPES.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={[styles.modalOption, docType === d.key && styles.modalOptionActive]}
              onPress={() => { setDocType(d.key); setDocPickerVisible(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalOptionText, docType === d.key && styles.modalOptionTextActive]}>{d.label}</Text>
              {docType === d.key && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <Ionicons name={icon as any} size={15} color={colors.primary} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function Field({
  label, value, editing, onChangeText, placeholder, keyboardType, autoCapitalize, multiline, icon,
}: {
  label: string; value: string; editing?: boolean; onChangeText?: (t: string) => void;
  placeholder?: string; keyboardType?: any; autoCapitalize?: any; multiline?: boolean; icon?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.fieldLabelRow}>
        {icon && <Ionicons name={icon as any} size={12} color={colors.primary} />}
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      {editing ? (
        <TextInput
          style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? "sentences"}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
        />
      ) : (
        <Text style={styles.fieldValue} numberOfLines={multiline ? 3 : 1}>
          {value || <Text style={{ color: colors.textTertiary }}>Not provided</Text>}
        </Text>
      )}
    </View>
  );
}

function InfoRow({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLeft}>
        <Ionicons name={icon as any} size={13} color={colors.primary} />
        <Text style={styles.infoRowLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoRowValue, valueColor ? { color: valueColor, fontWeight: "700" } : {}]}>{value}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: 60 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceVariant,
    marginRight: spacing.sm,
  },
  topBarTitle: { flex: 1, color: colors.textPrimary, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  editChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primary + "15",
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  editChipText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  cancelChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },

  // Hero
  heroBanner: { position: "relative", marginBottom: 52 },
  heroBannerTouch: { width: "100%", height: 190, overflow: "hidden" },
  heroBannerImage: { width: "100%", height: "100%" },
  heroBannerPlaceholder: {
    backgroundColor: colors.primary + "0E",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  heroBannerHint: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  heroUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEditBadge: {
    position: "absolute",
    bottom: 10,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  heroEditBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  ownerAvatarAnchor: { position: "absolute", bottom: -44, left: spacing.xl },
  ownerAvatarTouch: { position: "relative" },
  ownerAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary + "20",
    borderWidth: 4,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ownerAvatarText: { color: colors.primary, fontSize: 32, fontWeight: "800" },
  ownerCamBadge: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },

  heroInfo: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginLeft: 84 + spacing.xl + spacing.sm,
    minHeight: 50,
  },
  heroStoreName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: "700" },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surfaceVariant,
  },
  cardIconWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  cardBody: { padding: spacing.lg },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.sm },

  // Fields
  fieldWrap: { paddingVertical: 2 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 },
  fieldLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  fieldValue: { color: colors.textPrimary, fontSize: 15, fontWeight: "500" },
  fieldInput: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 11 : 8,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: colors.primary + "55",
  },
  fieldInputMulti: { height: 72, textAlignVertical: "top", paddingTop: 10 },

  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  infoRowLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  infoRowLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "500" },
  infoRowValue: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },

  // Document upload
  docTypeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  docTypeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docTypeBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  docUploadSection: { paddingVertical: 4 },
  docUploadArea: {
    marginTop: spacing.sm,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary + "50",
    borderRadius: radius.md,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary + "05",
    gap: spacing.xs,
    overflow: "hidden",
  },
  docUploadAreaFilled: { borderStyle: "solid", borderColor: colors.primary },
  docUploadIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  docUploadLabel: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  docUploadSub: { color: colors.textTertiary, fontSize: 11 },
  docPreview: { ...StyleSheet.absoluteFillObject },
  docReuploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  docReuploadText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // Save / Logout
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.error + "50",
    borderRadius: radius.md,
    paddingVertical: 14,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.error + "08",
  },
  logoutBtnText: { color: colors.error, fontSize: 15, fontWeight: "700" },
  version: { color: colors.textTertiary, fontSize: 11, textAlign: "center", marginTop: 4, marginBottom: spacing.lg },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 40,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "800", marginBottom: spacing.md },
  modalOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  modalOptionActive: { backgroundColor: colors.primary + "12" },
  modalOptionText: { color: colors.textPrimary, fontSize: 15, fontWeight: "500" },
  modalOptionTextActive: { color: colors.primary, fontWeight: "700" },
});
