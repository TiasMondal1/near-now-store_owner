import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router, type Href } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";
import { goBackOr, useHardwareBackTo } from "../lib/navigation";
import { useSelectedStore } from "../lib/useSelectedStore";
import { config } from "../lib/config";
import { forceFetchStores } from "../lib/appCache";
import { fetchBillingInfo, saveBillingInfo, type BillingInfo } from "../lib/billingInfo";
import VerificationNavBar from "../components/VerificationNavBar";
import { useSmartPoll } from "../lib/useSmartPoll";
import { OwnerAvatar } from "../components/signup/OwnerAvatar";
import { useOwnerPhoto } from "../components/profile/useOwnerPhoto";
import {
  ActionSheet,
  Button,
  Card,
  ErrorState,
  InlineNotice,
  KeyValueRow,
  Screen,
  Skeleton,
  StickyFooter,
  TextField,
  TopBar,
  useToast,
} from "../components/ui";
import {
  IMAGE_FORMATS_HINT,
  UploadDropzone,
  accountNumberError,
  hasBillingChange,
  ifscCodeError,
  pendingBillingChangeLines,
  usePassbookPicker,
  type PendingBillingChangeRequest,
} from "../components/kyc";

const API_BASE = config.API_BASE;

type SaveNotice = { title: string; message: string; nextStep?: boolean };

export default function BillingInfoScreen() {
  // The store comes from the shared hook (selected_store_id → cache → network).
  // The form itself stays a skeleton until fetchBillingInfo has filled it (or
  // failed), so a late applyBillingInfo can never clobber something being typed.
  const { session, store, storeId, loading: storeLoading, retry: retryStore } = useSelectedStore();
  const token = session?.token ?? null;
  const isApproved = !!store?.is_approved;

  // The billing fetch has settled (successfully or not) for this store.
  const [infoSettled, setInfoSettled] = useState(false);
  // The billing fetch has succeeded at least once — lets the useFocusEffect
  // below self-heal a failed first fetch on the next focus.
  const [infoFetched, setInfoFetched] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [ownerName, setOwnerName] = useState<string | null>(null);
  // One-time KYC photo: picker → upload → PATCH, locked once set.
  const ownerPhoto = useOwnerPhoto(session, storeId ?? undefined);

  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingChangeRequest, setPendingChangeRequest] = useState<PendingBillingChangeRequest>(null);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  // Validation errors appear once a field has been touched or a submit was attempted.
  const [touched, setTouched] = useState<{ account: boolean; ifsc: boolean }>({ account: false, ifsc: false });

  const clearSaveNotice = useCallback(() => setSaveNotice(null), []);
  const passbook = usePassbookPicker({ onStaged: clearSaveNotice });

  const accountRef = useRef<TextInput>(null);
  const ifscRef = useRef<TextInput>(null);
  const branchRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const toast = useToast();

  const backFallback: Href = isApproved ? "/(tabs)/home" : "/pending-verification";
  useHardwareBackTo(backFallback);

  // ── Loading ────────────────────────────────────────────────────────────────

  const loadPendingChangeRequest = useCallback(async (t: string, sId: string) => {
    try {
      const res = await fetch(`${API_BASE}/store-owner/stores/${sId}/profile-change-request`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const json = await res.json().catch(() => null);
      // profile.tsx's identity-field edits share this request queue — only
      // surface it here if it actually contains a billing field.
      const req = json?.request as PendingBillingChangeRequest;
      if (req && hasBillingChange(req.changes)) {
        setPendingChangeRequest(req);
      } else {
        setPendingChangeRequest(null);
      }
    } catch {
      /* non-fatal — banner just doesn't show */
    }
  }, []);

  const reconcileOwnerPhoto = ownerPhoto.reconcile;
  const setPassbookServerUrl = passbook.setServerUrl;
  const applyBillingInfo = useCallback(
    (info: BillingInfo) => {
      setInfoFetched(true);
      setOwnerName(info.ownerName);
      reconcileOwnerPhoto({ owner_image_url: info.ownerImageUrl });
      setAccountNumber(info.bankAccountNumber ?? "");
      setIfscCode(info.bankIfscCode ?? "");
      setBranchName(info.bankBranchName ?? "");
      setPassbookServerUrl(info.passbookUrl);
    },
    [reconcileOwnerPhoto, setPassbookServerUrl]
  );

  const loadBillingInfo = useCallback(
    async (t: string, sId: string) => {
      try {
        const info = await fetchBillingInfo(t, sId);
        applyBillingInfo(info);
        setLoadError(false);
      } catch {
        // Surfaced as ErrorState / a retryable notice; the useFocusEffect below also self-heals.
        setLoadError(true);
      } finally {
        setInfoSettled(true);
      }
      // Independent of the billing fetch — the pending banner (and its poll)
      // should start even when the details themselves failed to load.
      void loadPendingChangeRequest(t, sId);
    },
    [applyBillingInfo, loadPendingChangeRequest]
  );

  useEffect(() => {
    if (!token || !storeId) return;
    // A stale cached store row could carry an old approval flag for up to the
    // cache TTL — refresh it from the network; the hook re-reads the cache on
    // the next focus.
    void forceFetchStores(token, session?.user?.id);
    void loadBillingInfo(token, storeId);
  }, [token, storeId, session?.user?.id, loadBillingInfo]);

  // Self-heals a failed first fetch the moment this screen regains focus —
  // e.g. bouncing to another VerificationNavBar tab and back.
  useFocusEffect(
    useCallback(() => {
      if (!infoFetched && token && storeId) void loadBillingInfo(token, storeId);
    }, [infoFetched, token, storeId, loadBillingInfo])
  );

  // While a billing change is pending, poll for the decision so the banner
  // clears without leaving and re-entering this screen.
  useSmartPoll(
    () => {
      if (token && storeId) void loadPendingChangeRequest(token, storeId);
    },
    { intervalMs: 20_000, enabled: !!pendingChangeRequest && !!token && !!storeId }
  );

  const retryLoad = () => {
    // No store resolved: re-run the store bootstrap (the effect above loads
    // the details once a store arrives). Otherwise just refetch.
    if (!storeId) {
      retryStore();
      return;
    }
    if (token) void loadBillingInfo(token, storeId);
  };

  // ── Validation + save ──────────────────────────────────────────────────────

  const acctErr = accountNumberError(accountNumber);
  const ifscErr = ifscCodeError(ifscCode);
  const canSubmit = !acctErr && !ifscErr;
  const submitHint = useMemo(() => {
    if (canSubmit) return null;
    if (acctErr && ifscErr) return "Enter your account number and IFSC code to submit";
    return acctErr ? "Enter a valid account number to submit" : "Enter a valid IFSC code to submit";
  }, [canSubmit, acctErr, ifscErr]);

  const handleSave = async () => {
    if (!token || !storeId) return;
    // Both bank fields are required; the regexes must pass before anything is sent.
    if (!canSubmit) {
      setTouched({ account: true, ifsc: true });
      (acctErr ? accountRef : ifscRef).current?.focus();
      return;
    }
    const acct = accountNumber.trim();
    const ifsc = ifscCode.trim().toUpperCase();
    setSaving(true);
    setSaveNotice(null);
    try {
      const res = await saveBillingInfo(token, storeId, {
        bankAccountNumber: acct,
        bankIfscCode: ifsc,
        bankBranchName: branchName.trim(),
        file: passbook.pendingFile ?? undefined,
      });
      if (!res.ok) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      passbook.clearPending();
      setIfscCode(ifsc);
      if (res.cancelled) {
        setSaveNotice({
          title: "Request withdrawn",
          message: "Your pending billing change has been withdrawn since it matched your current details.",
        });
        toast.show({ message: "Request withdrawn", tone: "success" });
      } else {
        setSaveNotice({
          title: "Submitted for review",
          message: "Your billing details have been sent to our team for review. They take effect once approved.",
          nextStep: !isApproved,
        });
        toast.show({ message: "Submitted for review", tone: "success" });
      }
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      void loadPendingChangeRequest(token, storeId);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // router.canGoBack can throw before the root navigator is ready.
  let canGoBack = false;
  try {
    canGoBack = router.canGoBack();
  } catch {
    canGoBack = false;
  }
  const showBack = isApproved || canGoBack;

  const pendingLines = pendingBillingChangeLines(pendingChangeRequest);
  const ownerPhotoLocked = !!ownerPhoto.uri && !ownerPhoto.uploading;

  // First bootstrap (store → billing details) has settled.
  const ready = !storeLoading && (storeId ? infoSettled : true);
  // Nothing usable to show: the store never resolved, or the details never loaded.
  const showErrorState = ready && (!storeId || (loadError && !infoFetched));
  const showForm = ready && !showErrorState;

  return (
    <Screen keyboardAvoiding>
      <Stack.Screen options={{ animation: "fade" }} />
      <TopBar title="Billing details" onBack={showBack ? () => goBackOr(backFallback) : undefined} />
      {!storeLoading && !isApproved ? <VerificationNavBar active="billing" /> : null}

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.column, { width: contentWidth }]}>
          {!ready ? (
            <>
              <Skeleton.Card lines={2} />
              <Skeleton.Card lines={5} />
            </>
          ) : null}

          {showErrorState ? (
            <ErrorState
              icon="cloud-offline-outline"
              title="Couldn't load your billing details"
              message="Check your connection and try again."
              action={{ onPress: retryLoad }}
            />
          ) : null}

          {showForm ? (
            <>
              {loadError ? (
                <InlineNotice
                  tone="warning"
                  title="Couldn't refresh"
                  message="Showing saved data"
                  action={{ label: "Retry", onPress: retryLoad }}
                />
              ) : null}

              {saveNotice ? (
                <InlineNotice
                  tone="success"
                  title={saveNotice.title}
                  message={saveNotice.message}
                  action={
                    saveNotice.nextStep ? { label: "View status", onPress: () => router.replace("/pending-verification") } : undefined
                  }
                  onDismiss={() => setSaveNotice(null)}
                />
              ) : null}

              {pendingLines.length > 0 ? (
                <InlineNotice tone="warning" icon="time-outline" title="Changes pending review" lines={pendingLines} />
              ) : null}

              <Text style={styles.intro}>Bank details used to pay out your store&apos;s earnings.</Text>

              <Card title="Store owner">
                <View style={styles.ownerRow}>
                  <OwnerAvatar
                    uri={ownerPhoto.uri}
                    uploading={ownerPhoto.uploading}
                    locked={ownerPhotoLocked}
                    onPress={() => void ownerPhoto.pick()}
                    accessibilityLabel={ownerPhotoLocked ? "Owner photo, saved" : "Add owner photo"}
                  />
                  <View style={styles.flex}>
                    <KeyValueRow label="Store owner name" value={ownerName || "—"} />
                    <Text style={styles.caption}>
                      {ownerPhotoLocked ? "Your photo is saved and can't be changed." : "Add your photo. It can't be changed later."}
                    </Text>
                  </View>
                </View>
              </Card>

              <Card title="Bank account">
                <View style={styles.fields}>
                  <TextField
                    ref={accountRef}
                    label="Bank account number"
                    value={accountNumber}
                    onChangeText={(t) => {
                      // Strip whitespace on input (pasted values often carry it) —
                      // no maxLength, so a padded paste isn't truncated before the strip.
                      setAccountNumber(t.replace(/\s+/g, ""));
                      setSaveNotice(null);
                    }}
                    onBlur={() => setTouched((p) => ({ ...p, account: true }))}
                    error={touched.account ? acctErr : undefined}
                    helper="6-20 digits"
                    placeholder="e.g. 123456789012"
                    keyboardType="number-pad"
                    returnKeyType="next"
                    onSubmitEditing={() => ifscRef.current?.focus()}
                    blurOnSubmit={false}
                    accessibilityLabel="Bank account number"
                  />
                  <TextField
                    ref={ifscRef}
                    label="IFSC code"
                    value={ifscCode}
                    onChangeText={(t) => {
                      setIfscCode(t.replace(/\s+/g, "").toUpperCase());
                      setSaveNotice(null);
                    }}
                    onBlur={() => setTouched((p) => ({ ...p, ifsc: true }))}
                    error={touched.ifsc ? ifscErr : undefined}
                    helper="11 characters, e.g. SBIN0001234"
                    placeholder="e.g. SBIN0001234"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => branchRef.current?.focus()}
                    blurOnSubmit={false}
                    accessibilityLabel="IFSC code"
                  />
                  <TextField
                    ref={branchRef}
                    label="Branch name"
                    value={branchName}
                    onChangeText={(t) => {
                      setBranchName(t);
                      setSaveNotice(null);
                    }}
                    placeholder="e.g. MG Road Branch"
                    returnKeyType="done"
                    accessibilityLabel="Branch name"
                  />
                  <View style={styles.passbook}>
                    <Text style={styles.fieldLabel}>Passbook / cheque photo</Text>
                    <UploadDropzone
                      label="Passbook / cheque photo"
                      state={passbook.state}
                      previewUri={passbook.previewUri}
                      staged={!!passbook.pendingFile}
                      hint={IMAGE_FORMATS_HINT}
                      onPress={passbook.openSheet}
                      disabled={saving}
                    />
                  </View>
                </View>
              </Card>
            </>
          ) : null}
        </View>
      </ScrollView>

      {showForm ? (
        <StickyFooter>
          {submitHint ? (
            <Text style={styles.footerHint} accessibilityLiveRegion="polite">
              {submitHint}
            </Text>
          ) : null}
          <Button
            label="Submit for review"
            size="lg"
            fullWidth
            loading={saving}
            disabled={saving || !canSubmit || !token || !storeId}
            haptic="success"
            onPress={() => void handleSave()}
          />
        </StickyFooter>
      ) : null}

      <ActionSheet visible={passbook.sheetOpen} onClose={passbook.closeSheet} title="Passbook / cheque photo" options={passbook.options} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: spacing.lg, alignItems: "center" },
  column: { gap: spacing.xl },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  intro: { ...typography.body, color: colors.textSecondary },
  caption: { ...typography.caption, color: colors.textMuted },
  fields: { gap: spacing.lg },
  passbook: { gap: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textSecondary },
  footerHint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
