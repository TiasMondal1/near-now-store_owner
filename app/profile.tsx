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
import { notificationService } from "../lib/notifications";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { fetchStoresCached, forceFetchStores, peekStores, clearStoreCache } from "../lib/appCache";
import { config } from "../lib/config";
import { uploadStoreImage, uploadOwnerImage, OWNER_IMAGE_KEY } from "../lib/storage";
import { useRequireStoreApproval } from "../lib/useRequireStoreApproval";
import { fetchVerificationDocuments, ALL_DOC_KEYS } from "../lib/verificationDocuments";
import { useSmartPoll } from "../lib/useSmartPoll";

const API_BASE = config.API_BASE;
const MAX_STORE_IMAGES = 5;

// store_profile_change_requests now also carries bank/payout fields
// (saveBillingInfo in billing-info.tsx submits into the same table/queue
// this screen already polls) — this used to be a 3-way name/address/phone
// ternary that would have silently mislabeled any bank field as "Phone".
const CHANGE_FIELD_LABELS: Record<string, string> = {
  name: "Store Name",
  address: "Address",
  phone: "Phone",
  bank_account_number: "Bank Account Number",
  bank_ifsc_code: "IFSC Code",
  bank_branch_name: "Bank Branch",
  bank_passbook_storage_path: "Passbook/Cheque Photo",
};

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
  // Store gallery — up to MAX_STORE_IMAGES (enforced backend-side), replacing
  // the old single storeImageUri. `store_images` (migration 20260903000000)
  // is the source of truth; storeInfo.image_url is only used as a one-time
  // optimistic placeholder for the first paint, before the real list loads.
  const [storeImages, setStoreImages] = useState<{ id: string; url: string }[]>([]);
  const [uploadingOwnerImage, setUploadingOwnerImage] = useState(false);
  const [uploadingStoreImage, setUploadingStoreImage] = useState(false);
  const [removingImageId, setRemovingImageId] = useState<string | null>(null);
  const [uploadedDocCount, setUploadedDocCount] = useState(0);

  // Store name/address/phone edits now go through admin review instead of
  // applying immediately — see requestProfileChange() on the backend.
  const [pendingChangeRequest, setPendingChangeRequest] = useState<{
    id: string;
    changes: Record<string, { old: string | null; new: string }>;
  } | null>(null);
  // Mirrors pendingChangeRequest for the transition check in
  // loadPendingChangeRequest without reading state inside a setState
  // updater (React updaters must be pure — the store re-fetch/hydrate
  // there is a real side effect, and updaters can run more than once for a
  // single state transition). Also guards against an in-flight request
  // resolving out of order (e.g. a 20s poll tick issued just before a
  // same-screen submit, resolving just after) from clobbering fresher state.
  const pendingChangeRequestRef = useRef<typeof pendingChangeRequest>(null);
  const pendingRequestFetchSeq = useRef(0);
  // Guards hydrate()'s owner-image reconciliation against a background
  // store refresh that was issued before a photo upload but resolves after
  // it — without this, the stale response's (still-empty) owner_image_url
  // would revert the just-uploaded photo back to null. Set the instant an
  // upload succeeds; checked against the timestamp a given fetch was issued.
  const ownerImageUploadedAtRef = useRef(0);

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
        // Genuinely refetch — fetchStoresCached would just hand back the same
        // cached array while it's still warm (up to 10 min), so a stale
        // name/address shown from cache would never self-correct here.
        const fetchIssuedAt = Date.now();
        forceFetchStores(s.token, s.user?.id).then(async (fresh) => {
          if (!cancelled && fresh.length) {
            const freshPicked = (selId && fresh.find(s => s.id === selId)) || fresh[0];
            await hydrate(freshPicked, fetchIssuedAt);
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

  const loadDocCount = useCallback(async (storeId: string) => {
    try {
      const s = await getSession();
      if (!s?.token) return;
      const docs = await fetchVerificationDocuments(s.token, storeId);
      setUploadedDocCount(docs.filter((d) => !!d.url).length);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadPendingChangeRequest = useCallback(async (storeId: string) => {
    // Stale-response guard: only the most recently-issued fetch's result is
    // ever applied, so an earlier poll tick's response (e.g. one issued just
    // before a submit, resolving just after) can't clobber fresher state —
    // same pattern as useOrderTrackingRealtime's monotonic sequence refs.
    const seq = ++pendingRequestFetchSeq.current;
    try {
      const s = await getSession();
      if (!s?.token) return;
      const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/profile-change-request`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const json = await res.json().catch(() => null);
      if (seq !== pendingRequestFetchSeq.current) return;
      if (!res.ok || !json?.success) return;

      const nextRequest = json.request ?? null;
      const prev = pendingChangeRequestRef.current;
      pendingChangeRequestRef.current = nextRequest;
      setPendingChangeRequest(nextRequest);

      // A previously-pending request just resolved (approved/rejected) —
      // re-fetch the store row so approved name/address/phone values show
      // up without the shopkeeper needing to leave and re-enter the screen.
      if (prev && !nextRequest) {
        clearStoreCache();
        try {
          const fetchIssuedAt = Date.now();
          const fresh = await fetchStoresCached(s.token, s.user?.id);
          if (seq !== pendingRequestFetchSeq.current) return;
          const fresher = fresh.find((st: any) => st.id === storeId);
          if (fresher) await hydrate(fresher, fetchIssuedAt);
        } catch {
          /* non-fatal */
        }
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadStoreImages = useCallback(async (storeId: string) => {
    try {
      const s = await getSession();
      if (!s?.token) return;
      const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/images`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setStoreImages((json.images ?? []).map((img: any) => ({ id: img.id, url: img.url })));
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!storeInfo?.id) return;
      void loadDocCount(storeInfo.id);
      void loadPendingChangeRequest(storeInfo.id);
      void loadStoreImages(storeInfo.id);
    }, [storeInfo, loadDocCount, loadPendingChangeRequest, loadStoreImages])
  );

  // While a change request is pending, poll for the admin's decision so the
  // banner clears (and the resolved values apply) without needing to leave
  // and re-enter this screen.
  useSmartPoll(
    () => { if (storeInfo?.id) void loadPendingChangeRequest(storeInfo.id); },
    { intervalMs: 20_000, enabled: !!pendingChangeRequest && !!storeInfo?.id }
  );

  // fetchIssuedAt: when the store data behind this hydrate() call was
  // actually fetched (Date.now() captured right before the request went
  // out), if known. Used to skip the owner-image reconciliation below when
  // a photo was uploaded more recently than that — otherwise a background
  // refresh issued before the upload but resolving after it would revert
  // the just-uploaded photo back to null (the fetch's response reflects the
  // pre-upload state, not a real removal).
  const hydrate = async (store: any, fetchIssuedAt?: number) => {
    setStoreInfo(store);
    setStoreName(store.name ?? "");
    setStoreAddress(store.address ?? "");
    setStorePhone(store.phone ?? "");
    // Always prefer the server's own owner_image_url over whatever's cached
    // in AsyncStorage — the cache is only ever a same-mount-tick optimistic
    // placeholder (set at line ~95, before this runs) and, on a shared
    // device, can otherwise still be a *previous* shopkeeper's photo left
    // over from before logout. This is the authoritative reconciliation —
    // unless a newer local upload already supersedes this particular fetch.
    if (fetchIssuedAt === undefined || ownerImageUploadedAtRef.current <= fetchIssuedAt) {
      if (store.owner_image_url) {
        setOwnerImageUri(store.owner_image_url);
        AsyncStorage.setItem(OWNER_IMAGE_KEY, store.owner_image_url).catch(() => {});
      } else {
        setOwnerImageUri(null);
        AsyncStorage.removeItem(OWNER_IMAGE_KEY).catch(() => {});
      }
    }
    // Optimistic placeholder only, for the first paint before the real
    // gallery loads — never overwrites an already-loaded list.
    if (store.image_url) {
      setStoreImages((prev) => (prev.length ? prev : [{ id: "__placeholder__", url: store.image_url }]));
    }
    if (store?.id) {
      void loadDocCount(store.id);
      void loadStoreImages(store.id);
    }
  };

  const pickStoreImage = async () => {
    if (!storeInfo?.id) {
      Alert.alert("Can't upload yet", "Store info is still loading — try again in a moment.");
      return;
    }
    if (storeImages.length >= MAX_STORE_IMAGES) {
      Alert.alert("Gallery full", `A store can have at most ${MAX_STORE_IMAGES} photos. Remove one before adding another.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setUploadingStoreImage(true);
    try {
      const res = await uploadStoreImage(storeInfo.id, uri);
      if (!res.ok) {
        Alert.alert("Upload failed", res.error);
        return;
      }
      const s = await getSession();
      if (!s?.token) return;
      const addRes = await fetch(`${API_BASE}/store-owner/stores/${storeInfo.id}/images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: res.url }),
      });
      const addJson = await addRes.json().catch(() => null);
      if (!addRes.ok || !addJson?.success) {
        Alert.alert("Error", addJson?.error || "Photo uploaded but couldn't be added to your gallery.");
        return;
      }
      await loadStoreImages(storeInfo.id);
    } finally {
      setUploadingStoreImage(false);
    }
  };

  const removeStoreImage = (imageId: string) => {
    if (!storeInfo?.id || imageId === "__placeholder__") return;
    Alert.alert("Remove photo?", "This photo will be removed from your store's gallery.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setRemovingImageId(imageId);
          try {
            const s = await getSession();
            if (!s?.token) return;
            const res = await fetch(`${API_BASE}/store-owner/stores/${storeInfo.id}/images/${imageId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${s.token}` },
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) {
              Alert.alert("Error", json?.error || "Failed to remove photo.");
              return;
            }
            await loadStoreImages(storeInfo.id);
          } finally {
            setRemovingImageId(null);
          }
        },
      },
    ]);
  };

  const pickOwnerImage = async () => {
    // Same one-time-lock as store-owner-signup.tsx/billing-info.tsx — this is
    // a KYC/identity photo, not an ordinary profile picture, and should never
    // be silently replaceable post-verification from any screen.
    if (ownerImageUri) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    if (!session?.user?.id) {
      Alert.alert("Can't upload yet", "Your session is still loading — try again in a moment.");
      return;
    }
    const uri = result.assets[0].uri;
    // Marked the instant the local preview is set (not just on upload
    // success) so a background hydrate() already in flight can't revert even
    // this optimistic state — see ownerImageUploadedAtRef's declaration.
    ownerImageUploadedAtRef.current = Date.now();
    setOwnerImageUri(uri);
    setUploadingOwnerImage(true);
    try {
      const res = await uploadOwnerImage(session.user.id, uri);
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
      if (storeName.trim() && storeName.trim() !== (storeInfo.name ?? "")) patch.name = storeName.trim();
      if (storeAddress.trim() && storeAddress.trim() !== (storeInfo.address ?? "")) patch.address = storeAddress.trim();
      if (storePhone.trim() && storePhone.trim() !== (storeInfo.phone ?? "")) patch.phone = storePhone.trim();

      if (Object.keys(patch).length === 0) {
        setEditing(false);
        return;
      }

      // Name/address/phone no longer apply immediately — they go through
      // admin review (requestProfileChange on the backend). Revert the
      // visible fields to the still-current approved values; the pending
      // banner below shows what was actually submitted.
      const res = await fetch(`${API_BASE}/store-owner/stores/${storeInfo.id}/profile-change-request`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to submit changes");
      }
      // Invalidate any in-flight poll fetch issued before this submit — it
      // could otherwise resolve afterward with the pre-submit (null) state
      // and clobber the pending banner we're about to show.
      pendingRequestFetchSeq.current++;
      pendingChangeRequestRef.current = json.request;
      setPendingChangeRequest(json.request);
      await hydrate(storeInfo);
      setEditing(false);
      Alert.alert("Submitted for review", "Your requested changes have been sent to the admin team and will apply once approved.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save changes. Please try again.");
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
          await notificationService.unregister();
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
  // Store photos count toward the same "required for verification" total as
  // the 7 business documents — see the matching fix in upload-documents.tsx
  // and pending-verification.tsx (this screen already loads `storeImages`
  // for its own gallery, so no extra fetch is needed here).
  const TOTAL_REQUIRED = ALL_DOC_KEYS.length + MAX_STORE_IMAGES;
  const uploadedCount = uploadedDocCount + storeImages.length;
  const docsComplete = uploadedCount >= TOTAL_REQUIRED;

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
              {storeImages[0]?.url ? (
                <Image source={{ uri: storeImages[0].url }} style={styles.heroBannerImage} resizeMode="cover" />
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
              {editing && !uploadingStoreImage && storeImages.length < MAX_STORE_IMAGES && (
                <View style={styles.heroEditBadge}>
                  <Ionicons name="camera" size={13} color="#fff" />
                  <Text style={styles.heroEditBadgeText}>Add photo</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Owner avatar pinned to bottom-left of banner */}
            <View style={styles.ownerAvatarAnchor}>
              <TouchableOpacity
                activeOpacity={editing && !ownerImageUri ? 0.7 : 1}
                onPress={editing ? pickOwnerImage : undefined}
                disabled={uploadingOwnerImage || !!ownerImageUri}
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
                {/* Camera badge only shows before the photo is first set —
                    once uploaded it's a locked KYC photo, same as
                    store-owner-signup.tsx/billing-info.tsx, so no edit
                    affordance is shown here at all afterward. */}
                {editing && !uploadingOwnerImage && !ownerImageUri && (
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

          {storeImages.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryStrip}
            >
              {storeImages.map((img, idx) => (
                <View key={img.id} style={styles.galleryThumbWrap}>
                  <Image source={{ uri: img.url }} style={styles.galleryThumb} />
                  {idx === 0 && (
                    <View style={styles.galleryCoverBadge}>
                      <Text style={styles.galleryCoverBadgeText}>Cover</Text>
                    </View>
                  )}
                  {editing && img.id !== "__placeholder__" && (
                    <TouchableOpacity
                      style={styles.galleryRemoveBadge}
                      onPress={() => removeStoreImage(img.id)}
                      disabled={removingImageId === img.id}
                    >
                      {removingImageId === img.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Ionicons name="close" size={12} color="#fff" />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

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

          {pendingChangeRequest && (
            <View style={styles.pendingBanner}>
              <Ionicons name="time-outline" size={18} color={colors.warning} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.pendingBannerTitle}>Changes pending admin review</Text>
                {Object.entries(pendingChangeRequest.changes).map(([field, diff]) => (
                  <Text key={field} style={styles.pendingBannerLine}>
                    {CHANGE_FIELD_LABELS[field] || field}: {field === "bank_passbook_storage_path" ? "New photo uploaded" : diff.new}
                  </Text>
                ))}
              </View>
            </View>
          )}

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
                    Aadhaar & PAN, plus optional Trade License, GST, FSSAI & store photos
                  </Text>
                </View>
              </View>
              <View style={styles.docNavRight}>
                <View style={[styles.docCountBadge, docsComplete && styles.docCountBadgeComplete]}>
                  <Text style={[styles.docCountText, docsComplete && styles.docCountTextComplete]}>
                    {uploadedCount}/{TOTAL_REQUIRED}
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

  pendingBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.warning + "18",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning + "40",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  pendingBannerTitle: { fontWeight: "700", fontSize: 13, color: colors.textPrimary, marginBottom: 2 },
  pendingBannerLine: { fontSize: 12, color: colors.textSecondary },

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

  // Store photo gallery strip
  galleryStrip: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  galleryThumbWrap: { position: "relative", width: 72, height: 72 },
  galleryThumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.border },
  galleryCoverBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(15,23,42,0.65)",
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  galleryCoverBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  galleryRemoveBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
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
