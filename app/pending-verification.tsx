import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { clearSession, getSession } from "../session";
import { notificationService } from "../lib/notifications";
import { colors, spacing, typography, type Tone } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";
import { useHardwareBackTo } from "../lib/navigation";
import { apiClient } from "../lib/api-client";
import { useStoreApprovalGate } from "../lib/useStoreApprovalGate";
import {
  fetchVerificationDocuments,
  ONBOARDING_REQUIRED_DOC_KEYS,
  type VerificationDocument,
} from "../lib/verificationDocuments";
import { fetchBillingInfo } from "../lib/billingInfo";
import VerificationNavBar from "../components/VerificationNavBar";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  InlineNotice,
  ProgressBar,
  Screen,
  Skeleton,
  Stepper,
  TopBar,
  useToast,
  type Step,
} from "../components/ui";
import { MAX_STORE_IMAGES, SECTION_BY_KEY, formatClock, hasBillingChange } from "../components/kyc";

type RefreshSource = "pull" | "button" | null;

export default function PendingVerificationScreen() {
  // The gate hook is the single source of truth for approval state — it
  // fetches on mount, on every screen focus, every 30s, and on realtime
  // updates. Everything else on this screen (documents, photo count, billing
  // status) is loaded alongside it via loadAll below; there is exactly one
  // fetch path.
  const { checking, store, approved, refresh } = useStoreApprovalGate("require-pending");
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const toast = useToast();

  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [storeImageCount, setStoreImageCount] = useState(0);
  const [billingComplete, setBillingComplete] = useState(false);
  const [refreshSource, setRefreshSource] = useState<RefreshSource>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Documents + photo count have loaded at least once, so the counts below
  // describe real progress rather than the initial zeros.
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  // This screen is the root of the verification hub for an unapproved
  // shopkeeper, so Android back falls through to the OS there (exit) exactly
  // as on any app root. Once approved, back leads home instead of exiting.
  useHardwareBackTo("/(tabs)/home", approved);

  // Neither useStoreApprovalGate nor the documents/images fetch knows about
  // bank/billing details — that lives entirely in billing-info.tsx's own
  // fetch + change-request endpoints — so this screen tracks it separately
  // to know whether the "Billing" step is done.
  const checkBillingStatus = useCallback(async () => {
    if (!store?.id) {
      setBillingComplete(false);
      return;
    }
    const session = await getSession();
    if (!session?.token) return;
    const [info, changeReqRes] = await Promise.all([
      fetchBillingInfo(session.token, store.id),
      apiClient.get<{ request: { changes: Record<string, unknown> } | null }>(
        `/store-owner/stores/${store.id}/profile-change-request`,
        { Authorization: `Bearer ${session.token}` }
      ),
    ]);
    const changeReq = changeReqRes.success ? changeReqRes.data?.request : null;
    setBillingComplete(!!info.bankAccountNumber || hasBillingChange(changeReq?.changes));
  }, [store?.id]);

  const loadDocuments = useCallback(async () => {
    if (!store?.id) {
      setDocuments([]);
      return;
    }
    const session = await getSession();
    if (!session?.token) return;
    const docs = await fetchVerificationDocuments(session.token, store.id);
    setDocuments(docs);
  }, [store?.id]);

  // Same store_images table/endpoint app/upload-documents.tsx's gallery
  // uses — this screen only needs the count, not the photos themselves.
  const loadStoreImageCount = useCallback(async () => {
    if (!store?.id) {
      setStoreImageCount(0);
      return;
    }
    const session = await getSession();
    if (!session?.token) return;
    const res = await apiClient.get<{ images?: unknown[] }>(`/store-owner/stores/${store.id}/images`, {
      Authorization: `Bearer ${session.token}`,
    });
    if (!res.success) throw new Error(res.error || "Failed to load store images");
    setStoreImageCount((res.data?.images ?? []).length);
  }, [store?.id]);

  /**
   * Loads documents, photo count and billing status together. Failures keep
   * whatever was last shown and surface as the "Couldn't refresh" notice (or
   * an ErrorState when nothing has loaded yet) instead of being swallowed.
   * Returns true when everything loaded.
   */
  const loadAll = useCallback(async (): Promise<boolean> => {
    // Until the gate resolves a store there is nothing to fetch: the loaders
    // just reset to empty. Don't treat that pass as a successful load, or a
    // failing first real fetch would show "saved data" of 0 of 9.
    if (!store?.id) {
      await Promise.allSettled([loadDocuments(), loadStoreImageCount(), checkBillingStatus()]);
      return true;
    }
    const [docsRes, imagesRes, billingRes] = await Promise.allSettled([
      loadDocuments(),
      loadStoreImageCount(),
      checkBillingStatus(),
    ]);
    const ok = docsRes.status === "fulfilled" && imagesRes.status === "fulfilled" && billingRes.status === "fulfilled";
    if (docsRes.status === "fulfilled" && imagesRes.status === "fulfilled") setProgressLoaded(true);
    setLoadError(!ok);
    setLastCheckedAt(new Date());
    return ok;
  }, [store?.id, loadDocuments, loadStoreImageCount, checkBillingStatus]);

  // Re-fetch on mount and every time this screen regains focus (e.g. coming
  // back from upload-documents after a re-upload), instead of waiting up to
  // 30s for the poll — a just-fixed rejection should clear immediately.
  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll])
  );

  const TOTAL_REQUIRED = ONBOARDING_REQUIRED_DOC_KEYS.length + MAX_STORE_IMAGES;
  const onboardingDocs = useMemo(
    () => documents.filter((d) => (ONBOARDING_REQUIRED_DOC_KEYS as readonly string[]).includes(d.doc_type)),
    [documents]
  );
  const uploadedCount = onboardingDocs.filter((d) => !!d.url).length + storeImageCount;
  const rejectedDocs = onboardingDocs.filter((d) => d.status === "rejected");
  const docsComplete = uploadedCount >= TOTAL_REQUIRED;
  // 0 = documents, 1 = billing, 2 = admin review (approved hides the stepper).
  const currentStep = billingComplete ? 2 : docsComplete ? 1 : 0;

  const checkApprovalNow = useCallback(
    async (source: Exclude<RefreshSource, null>) => {
      setRefreshSource(source);
      try {
        await refresh();
        const ok = await loadAll();
        if (!ok) toast.show({ message: "Couldn't refresh. Check your connection and try again.", tone: "error" });
      } catch {
        toast.show({ message: "Couldn't refresh. Check your connection and try again.", tone: "error" });
      } finally {
        setRefreshSource(null);
      }
    },
    [refresh, loadAll, toast]
  );

  // Once approved, this screen stays put (no auto-navigate) — the shopkeeper
  // sees the "Approved" state right here and moves on to /(tabs)/home only by
  // tapping "Go to your store" below.

  const handleLogout = useCallback(async () => {
    await notificationService.unregister();
    await clearSession();
    router.replace("/landing");
  }, []);

  const hero = useMemo((): { tone: Tone; badge: string; body: string } => {
    if (approved) {
      return { tone: "success", badge: "Approved", body: "Your documents have been approved. You can start selling." };
    }
    if (rejectedDocs.length > 0) {
      return {
        tone: "error",
        badge: "Action needed",
        body: "One or more documents were rejected. Re-upload them to continue verification.",
      };
    }
    if (currentStep === 2) {
      return {
        tone: "warning",
        badge: "Under review",
        body: "Our team is reviewing your submission. Your shop will appear to customers once it's approved.",
      };
    }
    return {
      tone: "warning",
      badge: "In progress",
      body: "Your shop will appear to customers only after our team verifies your documents.",
    };
  }, [approved, rejectedDocs.length, currentStep]);

  // Details (always done, it's where the shopkeeper came from) → Documents →
  // Billing → Review → Store goes live. The stepper is hidden once approved,
  // so the last step only ever renders as upcoming.
  const steps = useMemo((): Step[] => {
    const stateFor = (index: number): Step["state"] =>
      index < currentStep ? "done" : index === currentStep ? "active" : "upcoming";
    const docsState = stateFor(0);
    const billingState = stateFor(1);
    const reviewState = stateFor(2);
    return [
      { title: "Details", state: "done" },
      {
        title: "Documents",
        state: docsState,
        description:
          docsState === "active"
            ? `${uploadedCount} of ${TOTAL_REQUIRED} uploaded — documents and store photos`
            : `${uploadedCount} of ${TOTAL_REQUIRED} uploaded`,
      },
      {
        title: "Billing",
        state: billingState,
        description: billingState === "active" ? "Add your bank details so we can pay out your earnings" : undefined,
      },
      {
        title: "Review",
        state: reviewState,
        description: reviewState === "active" ? "Our team is reviewing your submission" : undefined,
      },
      { title: "Store goes live", state: "upcoming" },
    ];
  }, [currentStep, uploadedCount, TOTAL_REQUIRED]);

  const refreshing = refreshSource !== null;
  // First load of the progress data failed: there are no saved counts to
  // show, so the progress cards give way to an ErrorState with Try again.
  const progressUnavailable = loadError && !progressLoaded;

  return (
    <Screen>
      <Stack.Screen options={{ animation: "fade" }} />
      <TopBar title="Verification status" />
      <VerificationNavBar active="status" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshSource === "pull"}
            onRefresh={() => void checkApprovalNow("pull")}
            tintColor={colors.primary}
            colors={[colors.primary]}
            enabled={!checking}
          />
        }
      >
        <View style={[styles.column, { width: contentWidth }]}>
          {checking ? (
            <>
              <Skeleton.Card lines={3} />
              <Skeleton.Card lines={4} />
              <Skeleton.Card lines={3} />
            </>
          ) : (
            <>
              {loadError && progressLoaded ? (
                <InlineNotice
                  tone="warning"
                  title="Couldn't refresh"
                  message="Showing saved data"
                  action={{ label: "Retry", onPress: () => void checkApprovalNow("button") }}
                />
              ) : null}

              <Card
                title={store?.name || "Your store"}
                accessory={<Badge label={hero.badge} tone={hero.tone} dot />}
                footer={
                  approved ? (
                    <Button
                      label="Go to your store"
                      size="md"
                      fullWidth
                      leftIcon="storefront-outline"
                      haptic="success"
                      onPress={() => router.replace("/(tabs)/home")}
                    />
                  ) : undefined
                }
              >
                <View style={styles.heroBody}>
                  <Text style={styles.body}>{hero.body}</Text>
                  <Text style={styles.meta}>{approved ? "Verified" : "Not visible to customers yet"}</Text>
                </View>
              </Card>

              {!approved && progressUnavailable ? (
                <Card>
                  <ErrorState
                    compact
                    icon="cloud-offline-outline"
                    title="Couldn't load your progress"
                    message="Check your connection and try again."
                    action={{ onPress: () => void checkApprovalNow("button"), loading: refreshSource === "button" }}
                  />
                </Card>
              ) : null}

              {!approved && !progressUnavailable ? (
                <>
                  <Card
                    title="What happens next"
                    footer={
                      currentStep === 1 ? (
                        <Button
                          label="Add billing details"
                          size="md"
                          fullWidth
                          leftIcon="card-outline"
                          onPress={() => router.replace("/billing-info")}
                        />
                      ) : undefined
                    }
                  >
                    <Stepper steps={steps} accessibilityLabel="Verification progress" />
                  </Card>

                  <Card
                    title="Required documents"
                    accessory={docsComplete ? <Badge label="Complete" tone="success" dot /> : undefined}
                    footer={
                      <Button
                        label={docsComplete ? "Review uploaded documents" : "Upload documents"}
                        size="md"
                        fullWidth
                        leftIcon="cloud-upload-outline"
                        onPress={() => router.push("/upload-documents")}
                      />
                    }
                  >
                    <View style={styles.docsBody}>
                      <ProgressBar
                        value={TOTAL_REQUIRED > 0 ? uploadedCount / TOTAL_REQUIRED : 0}
                        label={`${uploadedCount} of ${TOTAL_REQUIRED} uploaded`}
                        accessibilityLabel={`${uploadedCount} of ${TOTAL_REQUIRED} required items uploaded`}
                      />
                      <Text style={styles.body}>
                        Upload Aadhaar (front and back), PAN (front and back) and {MAX_STORE_IMAGES} store photos to
                        continue verification. Trade licence, GST certificate and FSSAI licence can be added later from
                        your profile once you&apos;re approved.
                      </Text>
                      {rejectedDocs.map((doc) => (
                        <InlineNotice
                          key={doc.doc_type}
                          tone="error"
                          title={`${SECTION_BY_KEY[doc.doc_type]?.label ?? doc.doc_type} needs to be re-uploaded`}
                          message={doc.rejection_reason ?? undefined}
                          action={{ label: "Re-upload", onPress: () => router.push("/upload-documents") }}
                        />
                      ))}
                    </View>
                  </Card>
                </>
              ) : null}

              {!approved ? (
                <View style={styles.refreshBlock}>
                  <Button
                    label="Refresh status"
                    variant="secondary"
                    size="md"
                    fullWidth
                    leftIcon="refresh-outline"
                    loading={refreshSource === "button"}
                    disabled={refreshing}
                    onPress={() => void checkApprovalNow("button")}
                  />
                  <Text style={styles.caption}>
                    {lastCheckedAt ? `Last checked ${formatClock(lastCheckedAt)} · pull down to refresh` : "Checking…"}
                  </Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Button
                  label="Need help? Contact support"
                  variant="text"
                  size="md"
                  fullWidth
                  onPress={() => router.push("/help")}
                />
                <Button
                  label="Log out"
                  variant="destructive"
                  size="md"
                  fullWidth
                  leftIcon="log-out-outline"
                  onPress={() => setLogoutOpen(true)}
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        destructive
        icon="log-out-outline"
        title="Log out?"
        message="You'll need to sign in again to check your verification status."
        confirmLabel="Log out"
        onConfirm={handleLogout}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, alignItems: "center" },
  column: { gap: spacing.xl },
  heroBody: { gap: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary },
  meta: { ...typography.description, color: colors.textMuted },
  docsBody: { gap: spacing.md },
  refreshBlock: { gap: spacing.sm, alignItems: "center" },
  caption: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  actions: { gap: spacing.sm },
});
