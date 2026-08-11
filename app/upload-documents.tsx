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
  Easing,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";
import { getSession } from "../session";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { config } from "../lib/config";
import { clearStoreCache, fetchStoresCached, peekStores } from "../lib/appCache";
import { uploadStoreImage } from "../lib/storage";
import VerificationNavBar from "../components/VerificationNavBar";
import {
  DOC_NUMBER_FORMATS,
  DOC_NUMBER_LENGTHS,
  ONBOARDING_REQUIRED_DOC_KEYS,
  deleteVerificationDocument,
  docNumberErrorMessage,
  fetchVerificationDocuments,
  formatPickedFileSize,
  saveVerificationDocument,
  validateDocNumber,
  type PickedDocFile,
  type RequiredDocKey,
  type VerificationDocument,
} from "../lib/verificationDocuments";

const API_BASE = config.API_BASE;
const MAX_STORE_IMAGES = 5;

const DOCUMENT_SECTIONS = [
  { key: "aadhaar_front", label: "Aadhaar Card (Front)", icon: "card-outline" as const, placeholder: "12-digit Aadhaar number", hasNumber: true },
  { key: "aadhaar_back", label: "Aadhaar Card (Back)", icon: "card-outline" as const, placeholder: "", hasNumber: false },
  { key: "pan_front", label: "PAN Card (Front)", icon: "id-card-outline" as const, placeholder: "10-character PAN, e.g. ABCDE1234F", hasNumber: true },
  { key: "pan_back", label: "PAN Card (Back)", icon: "id-card-outline" as const, placeholder: "", hasNumber: false },
  { key: "trade", label: "Trade License", icon: "document-text-outline" as const, placeholder: "Trade license number", hasNumber: true },
  { key: "gst", label: "GST Certificate", icon: "receipt-outline" as const, placeholder: "15-character GSTIN, e.g. 22AAAAA0000A1Z5", hasNumber: true },
  { key: "fssai", label: "FSSAI License", icon: "restaurant-outline" as const, placeholder: "14-digit FSSAI number", hasNumber: true },
] as const;

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const FORMATS_DISCLAIMER = "Accepted formats: JPG, PNG, WEBP, PDF · Max size 5MB";

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

const SECTION_BY_KEY = Object.fromEntries(
  DOCUMENT_SECTIONS.map((s) => [s.key, s])
) as Record<DocKey, (typeof DOCUMENT_SECTIONS)[number]>;

/**
 * Aadhaar and PAN each have 2 underlying document rows (front/back), but are
 * shown as one card — a single header + document number (taken from the
 * front, which is where the number is printed), then a front box and a back
 * box underneath. Trade/GST/FSSAI are still single-document cards.
 */
type DocGroup = {
  groupKey: string;
  headerLabel: string;
  headerIcon: React.ComponentProps<typeof Ionicons>["name"];
  numberKey: DocKey | null;
  members: readonly DocKey[];
};

const DOCUMENT_GROUPS: DocGroup[] = [
  { groupKey: "aadhaar", headerLabel: "Aadhaar Card", headerIcon: "card-outline", numberKey: "aadhaar_front", members: ["aadhaar_front", "aadhaar_back"] },
  { groupKey: "pan", headerLabel: "PAN Card", headerIcon: "id-card-outline", numberKey: "pan_front", members: ["pan_front", "pan_back"] },
  { groupKey: "trade", headerLabel: "Trade License", headerIcon: "document-text-outline", numberKey: "trade", members: ["trade"] },
  { groupKey: "gst", headerLabel: "GST Certificate", headerIcon: "receipt-outline", numberKey: "gst", members: ["gst"] },
  { groupKey: "fssai", headerLabel: "FSSAI License", headerIcon: "restaurant-outline", numberKey: "fssai", members: ["fssai"] },
];

// Only Aadhaar + PAN are required to get a store approved for the first
// time — Trade License/GST/FSSAI are shown here too, but only once the
// store is already approved, as an optional add-anytime step (per product
// decision: minimize onboarding friction, collect the rest later).
const ONBOARDING_GROUP_KEYS = new Set(["aadhaar", "pan"]);

export default function UploadDocumentsScreen() {
  // Seed storeId from the shared store cache when warm (e.g. the shopkeeper
  // already visited Home/Status this session) so this screen renders
  // immediately instead of a blank spinner — loadDocuments/loadStoreImages
  // below still refresh in the background regardless.
  const cachedStoreId = peekStores()?.[0]?.id ?? null;
  const [loading, setLoading] = useState(!cachedStoreId);
  const [storeId, setStoreId] = useState<string | null>(cachedStoreId);
  const [isApproved, setIsApproved] = useState<boolean>(!!peekStores()?.[0]?.is_approved);
  const [token, setToken] = useState<string | null>(null);
  const [serverDocs, setServerDocs] = useState<DocsState>(EMPTY_DOCS());
  const [numbers, setNumbers] = useState<Record<DocKey, string>>(
    () => Object.fromEntries(DOCUMENT_SECTIONS.map((d) => [d.key, ""])) as Record<DocKey, string>
  );
  const [pendingFiles, setPendingFiles] = useState<Partial<Record<DocKey, PickedDocFile>>>({});
  const [savingKey, setSavingKey] = useState<DocKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerSheetKey, setPickerSheetKey] = useState<DocKey | null>(null);
  const suspendedRef = useRef(false);

  // Store photo gallery — same store_images table/endpoints profile.tsx's
  // hero banner already uses; kept editable in both places (per explicit
  // instruction) rather than moved, so a shopkeeper can manage it from
  // whichever screen they're already on.
  //
  // Picked photos are staged in pendingStoreImages (local uris only) instead
  // of uploading immediately — this mirrors how document files work
  // (pendingFiles + saveOne), gives the gallery a genuine "Ready to save"
  // state before the shopkeeper commits, and means the "Save" button below
  // actually does something for photos instead of them silently having
  // already been persisted with no on-screen confirmation either way.
  const [storeImages, setStoreImages] = useState<{ id: string; url: string }[]>([]);
  const [pendingStoreImages, setPendingStoreImages] = useState<string[]>([]);
  const [uploadingStoreImage, setUploadingStoreImage] = useState(false);
  const [removingImageId, setRemovingImageId] = useState<string | null>(null);

  const sheetAnim = useRef(new Animated.Value(0)).current;

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

  const loadStoreImages = async (targetStoreId: string) => {
    try {
      const session = await getSession();
      if (!session?.token) return;
      const res = await fetch(`${API_BASE}/store-owner/stores/${targetStoreId}/images`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setStoreImages((json.images ?? []).map((img: any) => ({ id: img.id, url: img.url })));
      }
    } catch {
      /* non-fatal */
    }
  };

  const pickStoreImage = async () => {
    if (!storeId) {
      Alert.alert("Can't upload yet", "Store info is still loading — try again in a moment.");
      return;
    }
    if (storeImages.length + pendingStoreImages.length >= MAX_STORE_IMAGES) {
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

    // Stage only — the actual upload + save happens when "Save Documents &
    // Photos" is pressed (see saveStoreImages), so the gallery gets a real
    // "Ready to save" state instead of the photo silently already being
    // persisted the moment it's picked.
    setPendingStoreImages((prev) => [...prev, result.assets[0].uri]);
  };

  const removePendingStoreImage = (index: number) => {
    setPendingStoreImages((prev) => prev.filter((_, i) => i !== index));
  };

  /** Uploads + saves every staged photo. Returns false (with an alert already shown) on failure. */
  const saveStoreImages = async (): Promise<boolean> => {
    if (!storeId || pendingStoreImages.length === 0) return true;
    setUploadingStoreImage(true);
    try {
      const session = await getSession();
      if (!session?.token) return false;
      for (const uri of pendingStoreImages) {
        const res = await uploadStoreImage(storeId, uri);
        if (!res.ok) {
          Alert.alert("Upload failed", res.error);
          return false;
        }
        const addRes = await fetch(`${API_BASE}/store-owner/stores/${storeId}/images`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: res.url }),
        });
        const addJson = await addRes.json().catch(() => null);
        if (!addRes.ok || !addJson?.success) {
          Alert.alert("Error", addJson?.error || "Photo uploaded but couldn't be added to your gallery.");
          return false;
        }
      }
      setPendingStoreImages([]);
      await loadStoreImages(storeId);
      return true;
    } finally {
      setUploadingStoreImage(false);
    }
  };

  const removeStoreImage = (imageId: string) => {
    if (!storeId) return;
    Alert.alert("Remove photo?", "This photo will be removed from your store's gallery.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setRemovingImageId(imageId);
          try {
            const session = await getSession();
            if (!session?.token) return;
            const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/images/${imageId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${session.token}` },
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) {
              Alert.alert("Error", json?.error || "Failed to remove photo.");
              return;
            }
            await loadStoreImages(storeId);
          } finally {
            setRemovingImageId(null);
          }
        },
      },
    ]);
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
      setIsApproved(!!store.is_approved);
      if (!cancelled) setLoading(false); // render the form now — don't block on document status

      try {
        await loadDocuments(session.token, store.id); // status badges fill in once this resolves
      } catch {
        /* non-fatal — screen still renders with empty state */
      }
      void loadStoreImages(store.id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to take a photo.");
      return false;
    }
    return true;
  };

  // Photos straight from a phone camera are often several thousand pixels
  // wide / several MB — decoding that at full resolution just to render a
  // ~130px preview box (up to 5 at once on this screen) is what made the
  // page feel slow whenever documents were already uploaded. Downscaling
  // before it ever becomes the pending/uploaded file fixes both the upload
  // size and every future preview load (this app's and the admin panel's).
  const MAX_IMAGE_DIMENSION = 1600;

  const applyPickedImage = async (key: DocKey, asset: ImagePicker.ImagePickerAsset) => {
    const originalType = asset.mimeType || "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(originalType)) {
      Alert.alert("Unsupported format", FORMATS_DISCLAIMER);
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_BYTES) {
      Alert.alert("File too large", FORMATS_DISCLAIMER);
      return;
    }

    let uri = asset.uri;
    let type = originalType;
    let size = asset.fileSize;

    if (asset.width && asset.width > MAX_IMAGE_DIMENSION) {
      try {
        const resized = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: MAX_IMAGE_DIMENSION } }],
          { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
        );
        uri = resized.uri;
        type = "image/jpeg";
        size = undefined; // unknown after resize — the saved size shown post-upload comes from the backend
      } catch {
        // fall back to the original picked file if resizing fails for any reason
      }
    }

    setPendingFiles((prev) => ({
      ...prev,
      [key]: {
        uri,
        name: asset.fileName || `${key}.${extFromMime(type)}`,
        type,
        size,
      },
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
    await applyPickedImage(key, result.assets[0]);
  };

  const pickImage = async (key: DocKey) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    await applyPickedImage(key, result.assets[0]);
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
      [key]: { uri: asset.uri, name: asset.name || "document.pdf", type: "application/pdf", size: asset.size },
    }));
  };

  const choosePickerFor = (key: DocKey) => {
    setPickerSheetKey(key);
    sheetAnim.setValue(0);
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closePickerSheet = () => {
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setPickerSheetKey(null));
  };

  const runPickerAction = (action: (key: DocKey) => void) => {
    const key = pickerSheetKey;
    closePickerSheet();
    if (key) action(key);
  };

  const showSuspendedNotice = () => {
    // The 10-minute store cache (appCache.ts) has no idea is_approved just
    // flipped server-side — without clearing it, the very next screen's own
    // approval gate would read the stale cached (still-approved) store and
    // immediately redirect back into the app, undoing the suspension.
    clearStoreCache();
    Alert.alert(
      "Store sent back for re-verification",
      "Editing a verification document after approval requires your store to be re-verified before it's visible to customers again. Contact admin if you have questions.",
      [{ text: "Continue", onPress: () => router.replace("/pending-verification") }]
    );
  };

  const saveOne = async (key: DocKey): Promise<VerificationDocument | null> => {
    if (!token || !storeId) return null;
    const number = numbers[key]?.trim();
    const file = pendingFiles[key];
    const current = serverDocs[key];
    if (!file && (number ?? "") === (current?.number ?? "")) return current; // nothing changed

    if (number && !validateDocNumber(key, number.toUpperCase())) {
      Alert.alert("Invalid number", docNumberErrorMessage(key));
      return current;
    }

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
      // res.document is the raw saved DB row — it has storage_path but no
      // signed `url` (that's only computed by the GET endpoint), so a plain
      // replace would blank the preview immediately after a successful save.
      // Keep whatever url was already showing (a number-only edit doesn't
      // change the file), or fall back to the just-uploaded local file's own
      // uri so the preview still shows correctly until the next full reload
      // swaps in a real signed URL.
      const mergedDoc = { ...res.document, url: res.document.url ?? current?.url ?? file?.uri ?? null };
      setServerDocs((prev) => ({ ...prev, [key]: mergedDoc }));
      setPendingFiles((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (res.storeSuspended) suspendedRef.current = true;
      return mergedDoc;
    } finally {
      setSavingKey(null);
    }
  };

  const deleteOne = (key: DocKey) => {
    const doc = serverDocs[key];
    if (!doc?.url) return;
    const canSuspend = (ONBOARDING_REQUIRED_DOC_KEYS as readonly string[]).includes(key);
    Alert.alert(
      "Delete document",
      doc.status === "approved" && canSuspend
        ? "This document is already approved — deleting it means your store will be sent back for re-verification. Continue?"
        : "This removes the uploaded file. You can upload a new one anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!token || !storeId) return;
            setSavingKey(key);
            try {
              const res = await deleteVerificationDocument(token, storeId, key);
              if (!res.ok) {
                Alert.alert("Delete failed", res.error);
                return;
              }
              setServerDocs((prev) => ({ ...prev, [key]: null }));
              setNumbers((prev) => ({ ...prev, [key]: "" }));
              setPendingFiles((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
              if (res.storeSuspended) showSuspendedNotice();
            } finally {
              setSavingKey(null);
            }
          },
        },
      ]
    );
  };

  // Trade License/GST/FSSAI only show up once the store is already approved
  // — an unapproved store only needs Aadhaar + PAN to get through onboarding.
  const visibleGroups = isApproved
    ? DOCUMENT_GROUPS
    : DOCUMENT_GROUPS.filter((g) => ONBOARDING_GROUP_KEYS.has(g.groupKey));
  const visibleSections = DOCUMENT_SECTIONS.filter((s) =>
    isApproved || (ONBOARDING_REQUIRED_DOC_KEYS as readonly string[]).includes(s.key)
  );

  const handleSaveAll = async () => {
    setSaving(true);
    suspendedRef.current = false;
    try {
      const results: Partial<Record<DocKey, VerificationDocument | null>> = {};
      for (const section of visibleSections) {
        results[section.key] = await saveOne(section.key);
      }
      if (suspendedRef.current) {
        showSuspendedNotice();
        return;
      }

      // storeImages/pendingStoreImages below are captured from this render's
      // closure — setState calls inside saveStoreImages() won't be reflected
      // in these variables until the next render, so the post-save total is
      // computed from what we know *will* be true on success (old saved
      // count + however many were staged), not by re-reading state.
      const pendingCountBeforeSave = pendingStoreImages.length;
      const imagesOk = await saveStoreImages();
      if (!imagesOk) return; // alert already shown inside saveStoreImages

      const allDocsApproved = visibleSections.every((s) => results[s.key]?.status === "approved");
      const allDocsSubmitted = visibleSections.every((s) => !!results[s.key]?.url);
      const totalImagesAfterSave = storeImages.length + pendingCountBeforeSave;
      const imagesRemaining = MAX_STORE_IMAGES - totalImagesAfterSave;
      const imagesComplete = imagesRemaining <= 0;

      // First-time full submission (not yet approved, all docs + photos in) is the
      // only case that should advance the flow — editing already-approved docs or
      // leaving something incomplete keeps the shopkeeper on this screen.
      const readyForBilling = !isApproved && allDocsSubmitted && imagesComplete;

      Alert.alert(
        "Saved",
        // Once approved, nothing here blocks the shop from being live —
        // Trade License/GST/FSSAI are optional additions, not a
        // re-verification gate, so this skips the "before your shop goes
        // live"/"complete verification" phrasing that only applies pre-approval.
        isApproved
          ? allDocsApproved
            ? "All documents and store photos are saved."
            : "Your changes have been saved. Newly added documents will be reviewed by our team."
          : allDocsApproved && imagesComplete
            ? "All documents and store photos are saved."
            : allDocsSubmitted
              ? imagesComplete
                ? "Your documents have been submitted. Our team will verify them before your shop goes live."
                : `Your documents have been submitted. Add ${imagesRemaining} more store photo${imagesRemaining !== 1 ? "s" : ""} to complete your gallery.`
              : "Upload the remaining documents to complete verification.",
        readyForBilling
          ? [{ text: "OK", onPress: () => router.replace("/billing-info") }]
          : undefined
      );
    } catch {
      Alert.alert("Error", "Failed to save one or more documents. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const TOTAL_REQUIRED = visibleSections.length + MAX_STORE_IMAGES;
  const uploadedCount = visibleSections.filter((d) => serverDocs[d.key]?.url).length + storeImages.length;

  type StatusBadge = { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string; color: string };

  // Mirrors computeGroupStatus below: a picked-but-unsaved photo shows
  // "Ready to save" (same as an unsaved document file), and once every
  // photo is confirmed on the server it flips to "Saved" — previously this
  // section had no status indicator of either kind.
  const computeImagesStatus = (): StatusBadge | null => {
    if (pendingStoreImages.length > 0) return { icon: "checkmark-circle-outline", text: "Ready to save", color: colors.primary };
    if (storeImages.length > 0) return { icon: "checkmark-circle", text: "Saved", color: colors.success };
    return null;
  };
  const imagesStatus = computeImagesStatus();

  const computeGroupStatus = (group: DocGroup): StatusBadge | null => {
    const rejectedAny = group.members.some(
      (k) => !pendingFiles[k] && serverDocs[k]?.status === "rejected"
    );
    if (rejectedAny) return { icon: "close-circle", text: "Needs re-upload", color: colors.error };

    const pendingFileAny = group.members.some((k) => !!pendingFiles[k]);
    if (pendingFileAny) return { icon: "checkmark-circle-outline", text: "Ready to save", color: colors.primary };

    // A member with no file uploaded at all yet is still on the shopkeeper's
    // side, not the admin's — must be checked before "allApproved"/"anyUploaded"
    // below, or a group with one side approved and the other never uploaded
    // reads as "Pending review" (implying it's awaiting admin action) when
    // it's actually awaiting the shopkeeper.
    const missingAny = group.members.some((k) => !serverDocs[k]?.url);
    if (missingAny) return null;

    const allApproved = group.members.every((k) => serverDocs[k]?.status === "approved");
    if (allApproved) return { icon: "checkmark-circle", text: "Verified", color: colors.success };

    return { icon: "time-outline", text: "Pending review", color: colors.warning };
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
          <VerificationNavBar active="documents" />

          <View style={styles.infoBanner}>
            <View style={styles.infoIconWrap}>
              <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Shop verification</Text>
              <Text style={styles.infoText}>
                {isApproved
                  ? `Upload clear documents and store photos. ${uploadedCount} of ${TOTAL_REQUIRED} submitted.`
                  : `Only Aadhaar and PAN are needed to get started — Trade License, GST, and FSSAI can be added later from your profile. ${uploadedCount} of ${TOTAL_REQUIRED} submitted.`}
              </Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="images-outline" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Store Images</Text>
                <Text style={styles.sectionSubtitle}>
                  {imagesStatus ? imagesStatus.text : `${storeImages.length}/${MAX_STORE_IMAGES} added — shown to customers`}
                </Text>
              </View>
              {imagesStatus && (
                <View style={[styles.statusBadge, { backgroundColor: imagesStatus.color + "12" }]}>
                  <Ionicons name={imagesStatus.icon} size={14} color={imagesStatus.color} />
                  <Text style={[styles.statusBadgeText, { color: imagesStatus.color }]}>
                    {imagesStatus.text}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.sectionBody}>
              <View style={styles.galleryStrip}>
                {storeImages.map((img, idx) => (
                  <View key={img.id} style={styles.galleryThumbWrap}>
                    <Image source={{ uri: img.url }} style={styles.galleryThumb} />
                    {idx === 0 && (
                      <View style={styles.galleryCoverBadge}>
                        <Text style={styles.galleryCoverBadgeText}>Cover</Text>
                      </View>
                    )}
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
                  </View>
                ))}
                {pendingStoreImages.map((uri, idx) => (
                  <View key={`pending-${uri}`} style={styles.galleryThumbWrap}>
                    <Image source={{ uri }} style={[styles.galleryThumb, styles.galleryThumbPending]} />
                    <View style={styles.galleryPendingBadge}>
                      <Text style={styles.galleryPendingBadgeText}>Ready to save</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.galleryRemoveBadge}
                      onPress={() => removePendingStoreImage(idx)}
                      disabled={uploadingStoreImage}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {storeImages.length + pendingStoreImages.length < MAX_STORE_IMAGES && (
                  <TouchableOpacity
                    style={styles.galleryAddBtn}
                    onPress={pickStoreImage}
                    disabled={uploadingStoreImage}
                    activeOpacity={0.8}
                  >
                    {uploadingStoreImage ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <>
                        <Ionicons name="add" size={22} color={colors.primary} />
                        <Text style={styles.galleryAddText}>Add</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.formatHintText}>
                {pendingStoreImages.length > 0
                  ? "Tap \"Save Documents & Photos\" below to upload these photos."
                  : "You can also manage these from your Profile page."}
              </Text>
            </View>
          </View>

          {visibleGroups.map((group) => {
            const status = computeGroupStatus(group);
            const numberSection = group.numberKey ? SECTION_BY_KEY[group.numberKey] : null;
            const isOptionalGroup = !ONBOARDING_GROUP_KEYS.has(group.groupKey);

            return (
              <View key={group.groupKey} style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons name={group.headerIcon} size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{group.headerLabel}</Text>
                    <Text style={styles.sectionSubtitle}>
                      {status ? status.text : isOptionalGroup ? "Optional — add anytime" : "Required for verification"}
                    </Text>
                  </View>
                  {status && (
                    <View style={[styles.statusBadge, { backgroundColor: status.color + "12" }]}>
                      <Ionicons name={status.icon} size={14} color={status.color} />
                      <Text style={[styles.statusBadgeText, { color: status.color }]}>
                        {status.text}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.sectionBody}>
                  {numberSection && (
                    <>
                      <Text style={styles.fieldLabel}>Document Number</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={numbers[numberSection.key]}
                        onChangeText={(text) =>
                          setNumbers((prev) => ({ ...prev, [numberSection.key]: text }))
                        }
                        placeholder={numberSection.placeholder}
                        placeholderTextColor={colors.textTertiary}
                        autoCapitalize="characters"
                      />
                      {(() => {
                        const format = DOC_NUMBER_FORMATS[numberSection.key];
                        if (!format) return null; // trade — no fixed format to show
                        const expectedLength = DOC_NUMBER_LENGTHS[numberSection.key];
                        const currentLength = numbers[numberSection.key]?.length ?? 0;
                        const mismatch = !!expectedLength && currentLength > 0 && currentLength !== expectedLength;
                        return (
                          <Text style={mismatch ? styles.lengthWarning : styles.formatHintText}>
                            {mismatch
                              ? `${currentLength > expectedLength! ? "Too long" : "Too short"} — expected ${format.description} (currently ${currentLength} characters).`
                              : `Format: ${format.description}. Example: ${format.example}`}
                          </Text>
                        );
                      })()}
                    </>
                  )}

                  {group.members.map((memberKey, idx) => {
                    const memberSection = SECTION_BY_KEY[memberKey];
                    const doc = serverDocs[memberKey];
                    const pendingFile = pendingFiles[memberKey];
                    const isSavingThis = savingKey === memberKey;
                    const previewUri = pendingFile?.uri ?? (doc?.url && doc?.status !== "rejected" ? doc.url : doc?.url);
                    const isPdf = pendingFile
                      ? pendingFile.type === "application/pdf"
                      : doc?.url?.toLowerCase().includes(".pdf");

                    // A freshly picked (not yet saved) file supersedes whatever
                    // the server last said — the shopkeeper has already acted
                    // on a rejection, so keep showing "Needs re-upload" until
                    // they save would be misleading.
                    const effectiveStatus = pendingFile ? null : doc?.status;
                    const isMultiMember = group.members.length > 1;

                    return (
                      <View
                        key={memberKey}
                        style={idx > 0 ? styles.memberBlockSpaced : undefined}
                      >
                        {isMultiMember ? (
                          <Text style={[styles.memberHeader, idx === 0 && styles.memberHeaderFirst]}>
                            {memberSection.label}
                          </Text>
                        ) : (
                          <Text style={[styles.fieldLabel, { marginTop: numberSection ? spacing.md : 0 }]}>
                            Document File
                          </Text>
                        )}

                        {effectiveStatus === "rejected" && doc?.rejection_reason ? (
                          <View style={styles.rejectionBanner}>
                            <Ionicons name="alert-circle" size={14} color={colors.error} />
                            <Text style={styles.rejectionText}>{doc.rejection_reason}</Text>
                          </View>
                        ) : null}

                        <TouchableOpacity
                          style={[styles.uploadArea, (pendingFile || doc?.url) && styles.uploadAreaFilled]}
                          activeOpacity={0.8}
                          onPress={() => choosePickerFor(memberKey)}
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
                              <Text style={styles.uploadLabel}>Upload {memberSection.label}</Text>
                              <Text style={styles.uploadSub}>{FORMATS_DISCLAIMER}</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        {(pendingFile || doc?.url) && (
                          <View style={styles.fileMetaRow}>
                            <Text style={styles.formatsHint}>{FORMATS_DISCLAIMER}</Text>
                            {(() => {
                              const sizeLabel = pendingFile?.size
                                ? formatPickedFileSize(pendingFile.size)
                                : doc?.file_size ?? null;
                              return sizeLabel ? <Text style={styles.fileSizeText}>{sizeLabel}</Text> : null;
                            })()}
                          </View>
                        )}
                        {doc?.url && (
                          <TouchableOpacity
                            style={styles.deleteBtn}
                            activeOpacity={0.7}
                            onPress={() => deleteOne(memberKey)}
                            disabled={isSavingThis}
                          >
                            <Ionicons name="trash-outline" size={14} color={colors.error} />
                            <Text style={styles.deleteBtnText}>Delete uploaded file</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
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
                <Text style={styles.saveBtnText}>Save Documents & Photos</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={pickerSheetKey !== null}
        transparent
        animationType="none"
        onRequestClose={closePickerSheet}
      >
        <View style={styles.sheetWrap}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={closePickerSheet}
          >
            <Animated.View style={[styles.sheetBackdrop, { opacity: sheetAnim }]} />
          </TouchableOpacity>

          <Animated.View
            style={[
              styles.sheet,
              {
                transform: [
                  {
                    translateY: sheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [320, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Upload document</Text>
              <TouchableOpacity
                onPress={closePickerSheet}
                style={styles.sheetCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.sheetOption}
              activeOpacity={0.7}
              onPress={() => runPickerAction(takePhoto)}
            >
              <Ionicons name="camera-outline" size={20} color={colors.primary} />
              <Text style={styles.sheetOptionText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetOption}
              activeOpacity={0.7}
              onPress={() => runPickerAction(pickImage)}
            >
              <Ionicons name="image-outline" size={20} color={colors.primary} />
              <Text style={styles.sheetOptionText}>Choose Image</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetOption}
              activeOpacity={0.7}
              onPress={() => runPickerAction(pickPdf)}
            >
              <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              <Text style={styles.sheetOptionText}>Upload PDF</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
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

  memberHeader: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", marginBottom: spacing.xs },
  memberHeaderFirst: { marginTop: spacing.md },
  memberBlockSpaced: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
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
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "500",
    borderWidth: 1.5,
    borderColor: colors.primary + "30",
  },
  lengthWarning: { color: colors.error, fontSize: 11, fontWeight: "600", marginTop: 4 },
  formatHintText: { color: colors.textTertiary, fontSize: 11, fontWeight: "500", marginTop: 4 },

  galleryStrip: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  galleryThumbWrap: { position: "relative", width: 72, height: 72 },
  galleryThumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.border },
  galleryCoverBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(15,23,42,0.65)",
    borderRadius: radius.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  galleryCoverBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  galleryThumbPending: { opacity: 0.55 },
  galleryPendingBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.xs,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: "center",
  },
  galleryPendingBadgeText: { color: "#fff", fontSize: 8, fontWeight: "700" },
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
  galleryAddBtn: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary + "06",
  },
  galleryAddText: { color: colors.primary, fontSize: 11, fontWeight: "700", marginTop: 2 },

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
  fileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  formatsHint: { color: colors.textTertiary, fontSize: 11, fontWeight: "500", flexShrink: 1 },
  fileSizeText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: spacing.sm,
    paddingVertical: 8,
  },
  deleteBtnText: { color: colors.error, fontSize: 12, fontWeight: "700" },
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

  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    ...shadows.md,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  sheetOptionText: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
});
