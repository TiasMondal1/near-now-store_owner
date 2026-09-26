import React, { createRef, useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router, type Href } from "expo-router";
import { colors, spacing, typography } from "../lib/theme";
import { useBottomPadding, useLayout } from "../lib/useLayout";
import { goBackOr, useHardwareBackTo } from "../lib/navigation";
import { useSelectedStore } from "../lib/useSelectedStore";
import VerificationNavBar from "../components/VerificationNavBar";
import {
  ActionSheet,
  Button,
  ConfirmSheet,
  ErrorState,
  InlineNotice,
  NoticeSheet,
  ProgressBar,
  Screen,
  Skeleton,
  StickyFooter,
  TopBar,
  useToast,
} from "../components/ui";
import {
  DocumentCard,
  FORMATS_HINT,
  MAX_STORE_IMAGES,
  ONBOARDING_GROUP_KEYS,
  SECTION_BY_KEY,
  StorePhotosCard,
  buildPickerOptions,
  computeGroupStatus,
  isOnboardingKey,
  numberFieldConfig,
  numberHelper,
  numberLengthError,
  useDocFilePicker,
  useVerificationDocuments,
  visibleGroupsFor,
  visibleSectionsFor,
  type DocKey,
  type DocumentMember,
} from "../components/kyc";

export default function UploadDocumentsScreen() {
  // The store comes from the shared hook (selected_store_id → cache → network),
  // so a multi-store shopkeeper sees the same store here as on Billing/Settings.
  // Documents are never cached, so the body stays a skeleton until they settle.
  const { session, store, storeId, loading: storeLoading, retry: retryStore } = useSelectedStore();
  const token = session?.token ?? null;
  const isApproved = !!store?.is_approved;

  // Documents + gallery have been fetched (successfully or not) for this store.
  const [docsSettled, setDocsSettled] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Overlays
  const [pickerSheetKey, setPickerSheetKey] = useState<DocKey | null>(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<DocKey | null>(null);
  const [removeImageConfirmId, setRemoveImageConfirmId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const numberRefs = useRef<Record<DocKey, React.RefObject<TextInput | null>>>(
    Object.fromEntries(Object.keys(SECTION_BY_KEY).map((k) => [k, createRef<TextInput | null>()])) as Record<
      DocKey,
      React.RefObject<TextInput | null>
    >
  );

  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const toast = useToast();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Approved shopkeepers arrive here via push from Settings/Profile and need a
  // way back home; during first-time onboarding the Status tab is the root.
  const backFallback: Href = isApproved ? "/(tabs)/home" : "/pending-verification";
  useHardwareBackTo(backFallback);

  // ── Documents + store photos ───────────────────────────────────────────────

  const visibleGroups = visibleGroupsFor(isApproved);
  const visibleSections = visibleSectionsFor(isApproved);

  const flagLoadError = useCallback(() => setLoadError(true), []);
  const docs = useVerificationDocuments({
    token,
    storeId,
    isApproved,
    visibleSections,
    onReloadError: flagLoadError,
    focusNumber: (key) => numberRefs.current[key]?.current?.focus(),
    onSaved: () => scrollRef.current?.scrollTo({ y: 0, animated: true }),
  });
  const { gallery } = docs;

  // ── Loading ────────────────────────────────────────────────────────────────

  /** Documents + gallery together; a failure surfaces as ErrorState / the retryable notice instead of being swallowed. */
  const loadDocs = docs.load;
  const loadAll = useCallback(
    async (authToken: string, targetStoreId: string) => {
      const ok = await loadDocs(authToken, targetStoreId);
      if (!mountedRef.current) return;
      setLoadError(!ok);
      setDocsSettled(true);
    },
    [loadDocs]
  );

  useEffect(() => {
    if (token && storeId) void loadAll(token, storeId);
  }, [token, storeId, loadAll]);

  const retryLoad = useCallback(async () => {
    // No store resolved: re-run the store bootstrap; the effect above loads
    // the documents once a store arrives. Otherwise just reload the data.
    if (!storeId) {
      retryStore();
      return;
    }
    if (!token) return;
    setRetrying(true);
    try {
      await loadAll(token, storeId);
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  }, [storeId, token, retryStore, loadAll]);

  // ── Document files ─────────────────────────────────────────────────────────

  const showPickError = useCallback((message: string) => toast.show({ message, tone: "error" }), [toast]);

  // Camera / gallery / PDF with MIME + 5MB checks and the 1600px downscale.
  const picker = useDocFilePicker<DocKey>(docs.stageFile, showPickError);

  /** Runs inside the ConfirmSheet — throws so the sheet shows the error inline. */
  const confirmDeleteDocument = async () => {
    if (deleteConfirmKey) await docs.deleteDocument(deleteConfirmKey);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmKey(null);
    docs.afterDeleteSheetClosed();
  };

  const confirmRemoveStoreImage = async () => {
    if (removeImageConfirmId) await gallery.removeSaved(removeImageConfirmId);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const TOTAL_REQUIRED = visibleSections.length + MAX_STORE_IMAGES;
  const uploadedCount = visibleSections.filter((d) => docs.serverDocs[d.key]?.url).length + gallery.images.length;

  // router.canGoBack can throw before the root navigator is ready.
  let canGoBack = false;
  try {
    canGoBack = router.canGoBack();
  } catch {
    canGoBack = false;
  }
  const showBack = isApproved || canGoBack;

  const pickerSection = pickerSheetKey ? SECTION_BY_KEY[pickerSheetKey] : null;
  const pickerOptions = pickerSheetKey
    ? buildPickerOptions({
        takePhoto: picker.guarded(pickerSheetKey, picker.takePhoto),
        pickImage: picker.guarded(pickerSheetKey, picker.pickImage),
        pickPdf: picker.guarded(pickerSheetKey, picker.pickPdf),
        unstage: docs.pendingFiles[pickerSheetKey] ? () => docs.unstageFile(pickerSheetKey) : undefined,
        deleteUploaded: docs.serverDocs[pickerSheetKey]?.url ? () => setDeleteConfirmKey(pickerSheetKey) : undefined,
      })
    : [];

  const deleteDoc = deleteConfirmKey ? docs.serverDocs[deleteConfirmKey] : null;
  const deleteWarnsSuspension = !!deleteConfirmKey && deleteDoc?.status === "approved" && isOnboardingKey(deleteConfirmKey);

  // First bootstrap (store → documents + gallery) has settled.
  const ready = !storeLoading && (storeId ? docsSettled : true);
  // Nothing usable to show: the store never resolved, or documents never loaded.
  const showErrorState = ready && (!storeId || (loadError && !docs.docsLoaded));
  const showForm = ready && !showErrorState;
  const showCounts = ready && docs.docsLoaded;

  return (
    <Screen keyboardAvoiding>
      <Stack.Screen options={{ animation: "fade" }} />
      <TopBar title="Documents" onBack={showBack ? () => goBackOr(backFallback) : undefined} />
      {!storeLoading && !isApproved ? <VerificationNavBar active="documents" /> : null}
      <View style={[styles.progressWrap, { paddingHorizontal: gutter }]}>
        <View style={{ width: contentWidth }}>
          <ProgressBar
            value={showCounts && TOTAL_REQUIRED > 0 ? uploadedCount / TOTAL_REQUIRED : 0}
            accessibilityLabel={
              showCounts ? `${uploadedCount} of ${TOTAL_REQUIRED} required items uploaded` : "Loading upload progress"
            }
          />
        </View>
      </View>

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
              <Skeleton.Card lines={4} />
              <Skeleton.Card lines={4} />
            </>
          ) : null}

          {showErrorState ? (
            <ErrorState
              title="Couldn't load your documents"
              message="Check your connection and try again."
              action={{ onPress: () => void retryLoad(), loading: retrying }}
            />
          ) : null}

          {showForm ? (
            <>
              {loadError ? (
                <InlineNotice
                  tone="warning"
                  title="Couldn't refresh"
                  message="Showing saved data"
                  action={{ label: "Retry", onPress: () => void retryLoad() }}
                />
              ) : null}

              {docs.saveNotice ? (
                <InlineNotice
                  tone="success"
                  title={docs.saveNotice.readyForBilling ? "Documents submitted" : "Saved"}
                  message={docs.saveNotice.message}
                  onDismiss={docs.dismissSaveNotice}
                />
              ) : null}

              <Text style={styles.intro}>
                {isApproved
                  ? `Upload clear documents and store photos. ${FORMATS_HINT}.`
                  : `Only Aadhaar and PAN are needed to get started — Trade licence, GST certificate and FSSAI licence can be added later from your profile. ${FORMATS_HINT}.`}
              </Text>

              <StorePhotosCard
                images={gallery.images}
                pending={gallery.pending}
                max={MAX_STORE_IMAGES}
                onAdd={() => void gallery.pick()}
                onRemoveSaved={setRemoveImageConfirmId}
                onRemovePending={gallery.removePending}
                removingId={gallery.removingId}
                uploading={gallery.uploading}
                disabled={docs.saving}
              />

              {visibleGroups.map((group) => {
                const status = computeGroupStatus(group, docs.serverDocs, docs.pendingFiles);
                const numberSection = group.numberKey ? SECTION_BY_KEY[group.numberKey] : null;
                const isOptionalGroup = !ONBOARDING_GROUP_KEYS.has(group.groupKey);
                const numberKey = group.numberKey;
                const numberValue = numberKey ? docs.numbers[numberKey] ?? "" : "";
                const members: DocumentMember[] = group.members.map((memberKey) => ({
                  key: memberKey,
                  label: SECTION_BY_KEY[memberKey].label,
                  doc: docs.serverDocs[memberKey],
                  pendingFile: docs.pendingFiles[memberKey],
                  saving: docs.savingKey === memberKey,
                }));
                return (
                  <DocumentCard
                    key={group.groupKey}
                    title={group.headerLabel}
                    subtitle={isOptionalGroup ? "Optional — add anytime" : "Required for verification"}
                    status={status}
                    number={
                      numberSection && numberKey
                        ? {
                            value: numberValue,
                            onChangeText: (text) => docs.setNumber(numberKey, text),
                            placeholder: numberSection.placeholder,
                            helper: numberHelper(numberKey),
                            error: docs.numberErrors[numberKey] ?? numberLengthError(numberKey, numberValue),
                            inputRef: numberRefs.current[numberKey],
                            ...numberFieldConfig(numberKey),
                          }
                        : null
                    }
                    members={members}
                    onPressMember={(key) => setPickerSheetKey(key as DocKey)}
                    disabled={docs.saving}
                  />
                );
              })}
            </>
          ) : null}
        </View>
      </ScrollView>

      {showForm ? (
        <StickyFooter>
          {docs.invalidNumberLabel ? (
            <Text style={styles.footerHint} accessibilityLiveRegion="polite">
              Fix the {docs.invalidNumberLabel} number to save
            </Text>
          ) : null}
          {docs.continueToBilling ? (
            <Button
              label="Continue to billing"
              size="lg"
              fullWidth
              rightIcon="arrow-forward-outline"
              haptic="success"
              onPress={() => router.replace("/billing-info")}
            />
          ) : (
            <Button
              label="Save"
              size="lg"
              fullWidth
              loading={docs.saving}
              disabled={docs.saving || !!docs.invalidNumberLabel}
              haptic="success"
              onPress={() => void docs.saveAll()}
              accessibilityLabel="Save documents and photos"
            />
          )}
        </StickyFooter>
      ) : null}

      <ActionSheet
        visible={pickerSheetKey !== null}
        onClose={() => setPickerSheetKey(null)}
        title={pickerSection?.label ?? "Upload document"}
        options={pickerOptions}
      />

      <ConfirmSheet
        visible={deleteConfirmKey !== null}
        onClose={closeDeleteConfirm}
        destructive
        title={deleteConfirmKey ? `Delete ${SECTION_BY_KEY[deleteConfirmKey].label}?` : "Delete document?"}
        message={
          deleteWarnsSuspension
            ? "This document is already approved — deleting it means your store will be sent back for re-verification."
            : "This removes the uploaded file. You can upload a new one anytime."
        }
        confirmLabel="Delete"
        onConfirm={confirmDeleteDocument}
      />

      <ConfirmSheet
        visible={removeImageConfirmId !== null}
        onClose={() => setRemoveImageConfirmId(null)}
        destructive
        title="Remove photo?"
        message="This photo will be removed from your store's gallery."
        confirmLabel="Remove"
        onConfirm={confirmRemoveStoreImage}
      />

      <NoticeSheet
        visible={docs.suspendedOpen}
        tone="warning"
        icon="shield-outline"
        title="Store sent back for re-verification"
        message="Editing a verification document after approval requires your store to be re-verified before it's visible to customers again. Contact support from Help & support if you have questions."
        actionLabel="Continue"
        onAction={docs.continueAfterSuspension}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progressWrap: { alignItems: "center", paddingTop: spacing.md, backgroundColor: colors.background },
  scroll: { paddingTop: spacing.lg, alignItems: "center", flexGrow: 1 },
  column: { gap: spacing.xl, flexGrow: 1 },
  intro: { ...typography.body, color: colors.textSecondary },
  footerHint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
