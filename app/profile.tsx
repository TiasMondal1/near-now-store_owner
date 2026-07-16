import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { getSession, clearSession } from "../session";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { fetchStoresCached, peekStores, clearStoreCache } from "../lib/appCache";
import { config } from "../lib/config";
import { uploadStoreImage, uploadOwnerImage } from "../lib/storage";
import { useRequireStoreApproval } from "../lib/useRequireStoreApproval";
import {
  countUploadedDocsFromRecord,
  DOCS_STORAGE_KEY,
  REQUIRED_DOC_KEYS,
} from "../lib/verificationDocuments";

const API_BASE = config.API_BASE;
const OWNER_IMAGE_KEY = "owner_profile_image_url";

function countUploadedDocs(store: any): number {
  let count = countUploadedDocsFromRecord(store?.verification_documents);
  if (store?.verification_document && count === 0) count = 1;
  return count;
}

export default function ProfileScreen() {
  useRequireStoreApproval();
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
  const [uploadedDocCount, setUploadedDocCount] = useState(0);

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

      const selId = await AsyncStorage.getItem('selected_store_id');
      const cached = peekStores();
      if (cached?.length) {
        const picked = (selId && cached.find((s: any) => s.id === selId)) || cached[0];
        await hydrate(picked);
        fetchStoresCached(s.token, s.user?.id).then(async (fresh) => {
          if (!cancelled && fresh.length) {
            const freshPicked = (selId && fresh.find(s => s.id === selId)) || fresh[0];
            await hydrate(freshPicked);
          }
        });
      } else {
        const stores = await fetchStoresCached(s.token, s.user?.id);
        if (!cancelled && stores.length) {
          const picked = (selId && stores.find(s => s.id === selId)) || stores[0];
          await hydrate(picked);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!storeInfo?.id) return;
      void (async () => {
        try {
          const localRaw = await AsyncStorage.getItem(DOCS_STORAGE_KEY(storeInfo.id));
          if (localRaw) {
            const local = JSON.parse(localRaw);
            setUploadedDocCount(REQUIRED_DOC_KEYS.filter((key) => local?.[key]?.url).length);
            return;
          }
        } catch {
          /* ignore */
        }
        setUploadedDocCount(countUploadedDocs(storeInfo));
      })();
    }, [storeInfo])
  );

  const hydrate = async (store: any) => {
    setStoreInfo(store);
    setStoreName(store.name ?? "");
    setStoreAddress(store.address ?? "");
    setStorePhone(store.phone ?? "");
    if (store.image_url) setStoreImageUri(store.image_url);

    let count = countUploadedDocs(store);
    if (store?.id) {
      try {
        const localRaw = await AsyncStorage.getItem(DOCS_STORAGE_KEY(store.id));
        if (localRaw) {
          const local = JSON.parse(localRaw);
          count = REQUIRED_DOC_KEYS.filter((key) => local?.[key]?.url).length;
        }
      } catch {
        /* ignore */
      }
    }
    setUploadedDocCount(count);
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

      await patchStore(patch);
      const fresh = await fetchStoresCached(session.token, session.user?.id);
      if (fresh.length) await hydrate(fresh[0]);
      setEditing(false);
    } catch {
      Alert.alert("Error", "Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (storeInfo) void hydrate(storeInfo);
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
  const docsComplete = uploadedDocCount >= REQUIRED_DOC_KEYS.length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profile</Text>
        {!editing ? (
          <TouchableOpacity style={styles.editChip} onPress={() => setEditing(true)} activeOpacity={0.8}>
            <Ionicons name="pencil" size={14} color="#fff" />
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
            <TouchableOpacity
              style={styles.docNavRow}
              onPress={() => router.push("/upload-documents")}
              activeOpacity={0.75}
            >
              <View style={styles.docNavLeft}>
                <View style={styles.docNavIcon}>
                  <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docNavTitle}>Upload Shop Documents</Text>
                  <Text style={styles.docNavDesc}>
                    Aadhaar, PAN, Trade License, GST & FSSAI
                  </Text>
                </View>
              </View>
              <View style={styles.docNavRight}>
                <View style={[styles.docCountBadge, docsComplete && styles.docCountBadgeComplete]}>
                  <Text style={[styles.docCountText, docsComplete && styles.docCountTextComplete]}>
                    {uploadedDocCount}/{REQUIRED_DOC_KEYS.length}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>
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
    backgroundColor: colors.background,
    marginRight: spacing.sm,
  },
  topBarTitle: { flex: 1, color: colors.textPrimary, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  editChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primary + "10",
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.primary + "30",
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
  heroBannerTouch: { width: "100%", height: 200, overflow: "hidden" },
  heroBannerImage: { width: "100%", height: "100%" },
  heroBannerPlaceholder: {
    backgroundColor: colors.primary + "08",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  heroBannerHint: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  heroUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEditBadge: {
    position: "absolute",
    bottom: 12,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(15,23,42,0.6)",
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  heroEditBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  ownerAvatarAnchor: { position: "absolute", bottom: -44, left: spacing.xl },
  ownerAvatarTouch: { position: "relative" },
  ownerAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary + "14",
    borderWidth: 4,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...shadows.md,
  },
  ownerAvatarText: { color: colors.primary, fontSize: 32, fontWeight: "800" },
  ownerCamBadge: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 24,
    height: 24,
    borderRadius: 12,
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
    marginLeft: 88 + spacing.xl + spacing.sm,
    minHeight: 50,
  },
  heroStoreName: {
    color: colors.textPrimary,
    fontSize: 18,
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
    borderRadius: radius.xl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surfaceVariant,
  },
  cardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + "0C",
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
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "500",
    borderWidth: 1.5,
    borderColor: colors.primary + "40",
  },
  fieldInputMulti: { height: 72, textAlignVertical: "top", paddingTop: 10 },

  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  infoRowLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  infoRowLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "500" },
  infoRowValue: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },

  // Document navigation
  docNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  docNavLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  docNavIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary + "0C",
    alignItems: "center",
    justifyContent: "center",
  },
  docNavTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  docNavDesc: { color: colors.textTertiary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  docNavRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  docCountBadge: {
    backgroundColor: colors.warning + "14",
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  docCountBadgeComplete: { backgroundColor: colors.success + "14" },
  docCountText: { color: colors.warning, fontSize: 12, fontWeight: "700" },
  docCountTextComplete: { color: colors.success },

  // Save / Logout
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.error + "35",
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.error + "06",
  },
  logoutBtnText: { color: colors.error, fontSize: 15, fontWeight: "700" },
  version: { color: colors.textTertiary, fontSize: 11, textAlign: "center", marginTop: 4, marginBottom: spacing.lg, fontWeight: "500" },
});
