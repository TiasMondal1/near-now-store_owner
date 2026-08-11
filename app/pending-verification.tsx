import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { clearSession, getSession } from "../session";
import { notificationService } from "../lib/notifications";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { config } from "../lib/config";
import { useStoreApprovalGate } from "../lib/useStoreApprovalGate";
import {
  fetchVerificationDocuments,
  ONBOARDING_REQUIRED_DOC_KEYS,
  type VerificationDocument,
} from "../lib/verificationDocuments";
import { fetchBillingInfo } from "../lib/billingInfo";
import VerificationNavBar from "../components/VerificationNavBar";

const API_BASE = config.API_BASE;
// Keep in sync with MAX_STORE_IMAGES in app/upload-documents.tsx — this
// screen's "required documents" count previously only tallied the 7
// business documents, so it kept reading "7/7" even when the shopkeeper
// still hadn't added any of their 5 required store photos.
const MAX_STORE_IMAGES = 5;

// Only Aadhaar + PAN gate onboarding today — Trade License/GST/FSSAI are
// collected later from the profile screen, so they're not shown here.
const DOC_LABELS: Record<(typeof ONBOARDING_REQUIRED_DOC_KEYS)[number], string> = {
  aadhaar_front: "Aadhaar Card (Front)",
  aadhaar_back: "Aadhaar Card (Back)",
  pan_front: "PAN Card (Front)",
  pan_back: "PAN Card (Back)",
};

const STEPS = [
  { key: "upload", label: "Upload documents", icon: "cloud-upload-outline" as const },
  { key: "billing", label: "Upload billing details", icon: "card-outline" as const },
  { key: "review", label: "Admin verification", icon: "shield-checkmark-outline" as const },
  { key: "live", label: "Store goes live", icon: "storefront-outline" as const },
];

export default function PendingVerificationScreen() {
  // The gate hook is already the single source of truth for approval state —
  // it fetches on mount, on every screen focus, every 30s, and on realtime
  // updates. This screen used to run a second, fully independent
  // refreshStoreApproval() call on top of that, plus its own separate 30s
  // poll — doubling network round-trips on every visit, which is what made
  // navigating between Details/Status/Documents feel slow. Consolidated onto
  // the hook's own `refresh`/`approved` so there's exactly one fetch path.
  const { checking, store, approved, refresh } = useStoreApprovalGate("require-pending");
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [storeImageCount, setStoreImageCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Neither useStoreApprovalGate nor the documents/images fetch above knows
  // about bank/billing details — that lives entirely in billing-info.tsx's
  // own fetch + change-request endpoints — so this screen tracks it
  // separately to know whether the "Upload billing details" step is done.
  const [billingComplete, setBillingComplete] = useState(false);
  const checkBillingStatus = useCallback(async () => {
    if (!store?.id) {
      setBillingComplete(false);
      return;
    }
    try {
      const session = await getSession();
      if (!session?.token) return;
      const [info, changeReqJson] = await Promise.all([
        fetchBillingInfo(session.token, store.id),
        fetch(`${API_BASE}/store-owner/stores/${store.id}/profile-change-request`, {
          headers: { Authorization: `Bearer ${session.token}` },
        })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      const hasPendingBilling =
        !!changeReqJson?.request &&
        Object.keys(changeReqJson.request.changes ?? {}).some((f) =>
          ["bank_account_number", "bank_ifsc_code", "bank_branch_name", "bank_passbook_storage_path"].includes(f)
        );
      setBillingComplete(!!info.bankAccountNumber || hasPendingBilling);
    } catch {
      /* non-fatal — step just shows as not-yet-done */
    }
  }, [store?.id]);

  const loadDocuments = useCallback(async () => {
    if (!store?.id) {
      setDocuments([]);
      return;
    }
    try {
      const session = await getSession();
      if (!session?.token) return;
      const docs = await fetchVerificationDocuments(session.token, store.id);
      setDocuments(docs);
    } catch {
      /* non-fatal — keep showing whatever we last had */
    }
  }, [store?.id]);

  // Same store_images table/endpoint app/upload-documents.tsx's gallery
  // uses — this screen only needs the count, not the photos themselves.
  const loadStoreImageCount = useCallback(async () => {
    if (!store?.id) {
      setStoreImageCount(0);
      return;
    }
    try {
      const session = await getSession();
      if (!session?.token) return;
      const res = await fetch(`${API_BASE}/store-owner/stores/${store.id}/images`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setStoreImageCount((json.images ?? []).length);
      }
    } catch {
      /* non-fatal — keep showing whatever we last had */
    }
  }, [store?.id]);

  // Re-fetch on mount and every time this screen regains focus (e.g. coming
  // back from upload-documents after a re-upload), instead of waiting up to
  // 30s for the poll — a just-fixed rejection should clear immediately.
  useFocusEffect(
    useCallback(() => {
      void loadDocuments();
      void loadStoreImageCount();
      void checkBillingStatus();
    }, [loadDocuments, loadStoreImageCount, checkBillingStatus])
  );

  const TOTAL_REQUIRED = ONBOARDING_REQUIRED_DOC_KEYS.length + MAX_STORE_IMAGES;
  const onboardingDocs = documents.filter((d) =>
    (ONBOARDING_REQUIRED_DOC_KEYS as readonly string[]).includes(d.doc_type)
  );
  const uploadedCount = onboardingDocs.filter((d) => !!d.url).length + storeImageCount;
  const rejectedDocs = onboardingDocs.filter((d) => d.status === "rejected");

  const checkApprovalNow = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      await refresh();
      await loadDocuments();
      await loadStoreImageCount();
      await checkBillingStatus();
    } catch {
      if (!silent) Alert.alert("Could not refresh", "Check your connection and try again.");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [refresh, loadDocuments, loadStoreImageCount, checkBillingStatus]);

  // Once approved, this screen stays put (no auto-alert, no auto-navigate) —
  // the shopkeeper sees the "Verified" state right here and moves on to
  // /(tabs)/home only by tapping "Start Selling" below.

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

  if (checking) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ animation: "fade" }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const docsComplete = uploadedCount >= TOTAL_REQUIRED;
  const currentStep = approved ? 3 : billingComplete ? 2 : docsComplete ? 1 : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ animation: "fade" }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View>
          <VerificationNavBar active="status" />

          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons
                name={approved ? "checkmark-circle-outline" : "hourglass-outline"}
                size={34}
                color={approved ? colors.success : colors.primary}
              />
            </View>
            <Text style={styles.heroTitle}>{approved ? "Store Verified" : "Verification Pending"}</Text>
            <Text style={styles.heroSub}>
              {approved
                ? "Your documents have been approved. Tap below to start selling."
                : "Your shop will appear to customers only after our team verifies your documents."}
            </Text>
          </View>

          {store?.name ? (
            <View style={styles.storeCard}>
              <Ionicons name="storefront-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.storeName}>{store.name}</Text>
                <Text style={[styles.storeMeta, approved && styles.storeMetaVerified]}>
                  {approved ? "Verified" : "Not visible to customers yet"}
                </Text>
              </View>
            </View>
          ) : null}

          {approved && (
            <TouchableOpacity
              style={[styles.primaryBtn, { marginBottom: spacing.md }]}
              onPress={() => router.replace("/(tabs)/home")}
              activeOpacity={0.85}
            >
              <Ionicons name="storefront-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Start Selling</Text>
            </TouchableOpacity>
          )}

          {!approved && (
          <>
          <View style={styles.stepsCard}>
            <Text style={styles.sectionTitle}>What happens next</Text>
            {STEPS.map((step, index) => {
              const done = index < currentStep;
              const active = index === currentStep;
              return (
                <View key={step.key} style={styles.stepRow}>
                  <View
                    style={[
                      styles.stepDot,
                      done && styles.stepDotDone,
                      active && styles.stepDotActive,
                    ]}
                  >
                    <Ionicons
                      name={done ? "checkmark" : step.icon}
                      size={14}
                      color={done ? "#fff" : active ? colors.primary : colors.textTertiary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{step.label}</Text>
                    {active && step.key === "upload" && (
                      <Text style={styles.stepHint}>Upload all {TOTAL_REQUIRED} required items — documents and store photos</Text>
                    )}
                    {active && step.key === "billing" && (
                      <Text style={styles.stepHint}>Add your bank details so we can pay out your earnings</Text>
                    )}
                    {active && step.key === "review" && (
                      <Text style={styles.stepHint}>Our admins are reviewing your submission</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.docsCard}>
            <View style={styles.docsHeader}>
              <Text style={styles.sectionTitle}>Required documents</Text>
              <View style={[styles.countBadge, docsComplete && styles.countBadgeDone]}>
                <Text style={[styles.countText, docsComplete && styles.countTextDone]}>
                  {uploadedCount}/{TOTAL_REQUIRED}
                </Text>
              </View>
            </View>
            <Text style={styles.docsDesc}>
              Upload Aadhaar (front & back), PAN (front & back), and {MAX_STORE_IMAGES} store photos to continue verification. Trade License, GST Certificate, and FSSAI License can be added later from your profile once you&apos;re approved.
            </Text>

            {rejectedDocs.map((doc) => (
              <View key={doc.doc_type} style={styles.rejectionRow}>
                <Ionicons name="close-circle" size={15} color={colors.error} />
                <Text style={styles.rejectionRowText}>
                  {DOC_LABELS[doc.doc_type as keyof typeof DOC_LABELS]} needs to be re-uploaded
                  {doc.rejection_reason ? ` — ${doc.rejection_reason}` : ""}
                </Text>
              </View>
            ))}

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/upload-documents")}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {docsComplete ? "Review Uploaded Documents" : "Upload Documents"}
              </Text>
            </TouchableOpacity>
          </View>
          </>
          )}

          {!approved && (
            <TouchableOpacity
              style={[styles.secondaryBtn, refreshing && { opacity: 0.6 }]}
              onPress={() => checkApprovalNow(false)}
              disabled={refreshing}
              activeOpacity={0.85}
            >
              {refreshing ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                  <Text style={styles.secondaryBtnText}>Check Verification Status</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push("/help")} activeOpacity={0.7}>
            <Text style={styles.linkBtnText}>Need help? Contact support</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  hero: { alignItems: "center", marginBottom: spacing.xl, paddingTop: spacing.md },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary + "10",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  heroTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", letterSpacing: -0.4 },
  heroSub: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  storeName: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  storeMeta: { color: colors.warning, fontSize: 12, fontWeight: "600", marginTop: 2 },
  storeMetaVerified: { color: colors.success },
  stepsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginBottom: spacing.md },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.md },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { backgroundColor: colors.primary + "10", borderColor: colors.primary + "35" },
  stepDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  stepLabelActive: { color: colors.textPrimary, fontWeight: "700" },
  stepHint: { color: colors.textTertiary, fontSize: 12, marginTop: 2, lineHeight: 17 },
  docsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  docsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  countBadge: {
    backgroundColor: colors.warning + "14",
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeDone: { backgroundColor: colors.success + "14" },
  countText: { color: colors.warning, fontSize: 12, fontWeight: "700" },
  countTextDone: { color: colors.success },
  docsDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: spacing.lg },
  rejectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: colors.error + "0C",
    borderWidth: 1,
    borderColor: colors.error + "30",
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  rejectionRowText: { color: colors.error, fontSize: 12, fontWeight: "600", flex: 1, lineHeight: 16 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    ...shadows.md,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary + "30",
    paddingVertical: 14,
    marginBottom: spacing.md,
  },
  secondaryBtnText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  linkBtn: { alignItems: "center", paddingVertical: spacing.sm, marginBottom: spacing.sm },
  linkBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.error + "35",
    borderRadius: radius.lg,
    paddingVertical: 14,
    backgroundColor: colors.error + "06",
  },
  logoutText: { color: colors.error, fontSize: 15, fontWeight: "700" },
});
