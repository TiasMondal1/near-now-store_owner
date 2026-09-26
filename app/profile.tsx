import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { isStoreApproved } from "../lib/storeApproval";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSession, type UserSession } from "../session";
import { spacing } from "../lib/theme";
import { useLayout, useBottomPadding } from "../lib/useLayout";
import { fetchStoresCached, forceFetchStores, peekStoresAny, clearStoreCache } from "../lib/appCache";
import { useSelectedStore } from "../lib/useSelectedStore";
import { config } from "../lib/config";
import { OWNER_IMAGE_KEY } from "../lib/storage";
import { useRequireStoreApproval } from "../lib/useRequireStoreApproval";
import { fetchVerificationDocuments, ONBOARDING_REQUIRED_DOC_KEYS } from "../lib/verificationDocuments";
import { useSmartPoll } from "../lib/useSmartPoll";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  InlineNotice,
  ListRow,
  Screen,
  StickyFooter,
  TopBar,
  triggerHaptic,
  useToast,
} from "../components/ui";
import {
  AccountCard,
  GalleryGrid,
  PendingChangesNotice,
  ProfileHero,
  ProfileSkeleton,
  StoreInfoForm,
  useOwnerPhoto,
  useStoreGallery,
  type PendingChangeRequest,
  type StoreInfoField,
} from "../components/profile";
import { MAX_STORE_IMAGES } from "../components/kyc";

const API_BASE = config.API_BASE;

export default function ProfileScreen() {
  useRequireStoreApproval();
  const { gutter, contentWidth } = useLayout();
  const paddingBottom = useBottomPadding();
  const toast = useToast();
  // Store resolution (selected_store_id → cache → fetch, focus re-read, Retry)
  // lives in the shared hook; this screen only hydrates its form from the
  // resolved row. The hook redirects to /landing itself with no session.
  const { session, store, storeId: selectedStoreId, loading: storeLoading, retry } = useSelectedStore();
  const [storeInfo, setStoreInfo] = useState<any>(null);
  // A background refresh over cache-painted content failed — rendered as a
  // warning notice above the cards with Retry.
  const [refreshError, setRefreshError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Submit failure shown inline in the Store information card (was Alert).
  const [formError, setFormError] = useState<string | null>(null);

  // Editable store fields
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");

  // Images — owner (KYC) photo and the store gallery live in their own hooks;
  // this screen only wires them to the hero/grid and the store hydrate.
  const ownerPhoto = useOwnerPhoto(session, storeInfo?.id);
  const gallery = useStoreGallery(storeInfo?.id, MAX_STORE_IMAGES);
  const [uploadedDocCount, setUploadedDocCount] = useState(0);

  // Store name/address/phone edits now go through admin review instead of
  // applying immediately — see requestProfileChange() on the backend.
  const [pendingChangeRequest, setPendingChangeRequest] = useState<PendingChangeRequest | null>(null);
  // Mirrors pendingChangeRequest for the transition check in
  // loadPendingChangeRequest without reading state inside a setState
  // updater (React updaters must be pure — the store re-fetch/hydrate
  // there is a real side effect, and updaters can run more than once for a
  // single state transition). Also guards against an in-flight request
  // resolving out of order (e.g. a 20s poll tick issued just before a
  // same-screen submit, resolving just after) from clobbering fresher state.
  const pendingChangeRequestRef = useRef<typeof pendingChangeRequest>(null);
  const pendingRequestFetchSeq = useRef(0);
  // Unmount guard for the async refresh chain.
  const mountedRef = useRef(true);
  // Set once the first store row has been hydrated this mount — the
  // AsyncStorage owner-photo seed must never land after the server value.
  const hydratedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // fetchIssuedAt: when the store data behind this hydrate() call was
  // actually fetched (Date.now() captured right before the request went
  // out), if known. useOwnerPhoto.reconcile uses it to skip the owner-image
  // update when a photo was uploaded more recently than that fetch.
  const seedGalleryPlaceholder = gallery.seedPlaceholder;
  const reconcileOwnerPhoto = ownerPhoto.reconcile;
  const hydrate = useCallback(async (store: any, fetchIssuedAt?: number) => {
    setStoreInfo(store);
    setStoreName(store.name ?? "");
    setStoreAddress(store.address ?? "");
    setStorePhone(store.phone ?? "");
    // Server owner_image_url wins over the AsyncStorage placeholder (unless a
    // newer local upload supersedes this fetch) — see useOwnerPhoto.
    reconcileOwnerPhoto(store, fetchIssuedAt);
    // Optimistic placeholder only, for the first paint before the real
    // gallery loads — never overwrites an already-loaded list.
    if (store.image_url) seedGalleryPlaceholder(store.image_url);
    // Doc count / gallery loads live in the focus effect (keyed on the store
    // id) — firing them from here too meant every background re-hydrate of
    // the same store re-downloaded both for nothing.
  }, [seedGalleryPlaceholder, reconcileOwnerPhoto]);

  // Genuinely refetch — fetchStoresCached would just hand back the same
  // cached array while it's still warm (up to 10 min), so a stale
  // name/address shown from cache would never self-correct here.
  //
  // forceFetchStores never rejects: on failure it hands back the last-known-
  // good array by reference (see lib/appCache.ts). A successful response is
  // always a freshly parsed array, so "same reference as before" is the
  // failure signal used to surface the "Couldn't refresh" notice.
  const refreshFromServer = useCallback(async (s: UserSession) => {
    setRefreshError(false);
    const before = peekStoresAny();
    const fetchIssuedAt = Date.now();
    try {
      const fresh = await forceFetchStores(s.token, s.user?.id);
      if (!mountedRef.current) return;
      if (fresh.length && fresh !== before) {
        const freshPicked = fresh.find((st) => st.id === selectedStoreId) ?? fresh[0];
        await hydrate(freshPicked, fetchIssuedAt);
      } else if (fresh === before) {
        setRefreshError(true);
      }
    } catch {
      if (mountedRef.current) setRefreshError(true);
    }
  }, [hydrate, selectedStoreId]);

  // Same-mount-tick optimistic owner-photo placeholder from AsyncStorage,
  // for the first paint before the store row arrives. Skipped if a hydrate
  // (whose reconcile is authoritative) already happened — a late seed could
  // otherwise resurrect a previous shopkeeper's photo on a shared device.
  const seedOwnerPhoto = ownerPhoto.seedFromStorage;
  useEffect(() => {
    AsyncStorage.getItem(OWNER_IMAGE_KEY)
      .then((saved) => {
        if (!mountedRef.current || hydratedRef.current) return;
        seedOwnerPhoto(saved);
      })
      .catch(() => {});
  }, [seedOwnerPhoto]);

  // Hydrate from the resolved store row, then genuinely refetch once in the
  // background so a stale name/address painted from the cache self-corrects
  // (the hook prefers the warm cache, which can be up to 10 min old).
  useEffect(() => {
    if (!store || !session) return;
    hydratedRef.current = true;
    void hydrate(store);
    void refreshFromServer(session);
    // Keyed on the id, not the object — the hook hands back a new object on
    // every focus where is_active/name changed; a full re-hydrate on each
    // would reset in-progress edits, and the background refresh covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, session]);

  const retryRefresh = useCallback(() => {
    if (session) void refreshFromServer(session);
  }, [session, refreshFromServer]);

  const loadDocCount = useCallback(async (storeId: string) => {
    try {
      const s = await getSession();
      if (!s?.token) return;
      const docs = await fetchVerificationDocuments(s.token, storeId);
      // Count only the documents that are actually *required* — the same
      // set pending-verification.tsx and upload-documents.tsx use. Counting
      // all 7 doc types here made an approved store show "9/12 incomplete"
      // on Profile while Status showed "9/9 complete".
      setUploadedDocCount(
        docs.filter(
          (d) => !!d.url && (ONBOARDING_REQUIRED_DOC_KEYS as readonly string[]).includes(d.doc_type)
        ).length
      );
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
  }, [hydrate]);

  const loadStoreImages = gallery.load;
  useFocusEffect(
    useCallback(() => {
      if (!storeInfo?.id) return;
      void loadDocCount(storeInfo.id);
      void loadPendingChangeRequest(storeInfo.id);
      void loadStoreImages(storeInfo.id);
      // Keyed on the id, not the storeInfo object — every background hydrate
      // commits a fresh object, and keying on identity re-fired all three
      // fetches on each one even though the store never changed.
    }, [storeInfo?.id, loadDocCount, loadPendingChangeRequest, loadStoreImages])
  );

  // While a change request is pending, poll for the admin's decision so the
  // banner clears (and the resolved values apply) without needing to leave
  // and re-enter this screen.
  useSmartPoll(
    () => { if (storeInfo?.id) void loadPendingChangeRequest(storeInfo.id); },
    { intervalMs: 20_000, enabled: !!pendingChangeRequest && !!storeInfo?.id }
  );

  // ── Form values ────────────────────────────────────────────────────────────
  // No client-side validation here by contract: a cleared field is dropped
  // from the change request (see handleSave), and phone format is left to the
  // backend. The form only shows a "left blank" helper on cleared fields.
  const formValues = useMemo(
    () => ({ name: storeName, address: storeAddress, phone: storePhone }),
    [storeName, storeAddress, storePhone]
  );
  const committedValues = useMemo(
    () => ({ name: storeInfo?.name ?? "", address: storeInfo?.address ?? "", phone: storeInfo?.phone ?? "" }),
    [storeInfo?.name, storeInfo?.address, storeInfo?.phone]
  );
  const handleFieldChange = useCallback((field: StoreInfoField, value: string) => {
    if (field === "name") setStoreName(value);
    else if (field === "address") setStoreAddress(value);
    else setStorePhone(value);
    setFormError(null);
  }, []);

  const handleSave = async () => {
    if (!session?.token || !storeInfo?.id) return;
    setSaving(true);
    setFormError(null);
    try {
      const patch: Record<string, string> = {};
      if (storeName.trim() && storeName.trim() !== (storeInfo.name ?? "")) patch.name = storeName.trim();
      if (storeAddress.trim() && storeAddress.trim() !== (storeInfo.address ?? "")) patch.address = storeAddress.trim();
      if (storePhone.trim() && storePhone.trim() !== (storeInfo.phone ?? "")) patch.phone = storePhone.trim();

      // A genuinely-untouched form only needs a local bail. But if every
      // edited field was reverted back to its committed value while an
      // identity-field change request from an earlier session is still
      // pending, an empty patch here must still reach the backend — that's
      // the only way it learns the field was reverted and can withdraw the
      // now-stale request (see submitProfileChangeRequest's ownedFields
      // reconciliation). Without this, a reverted field's stale pending
      // entry could sit forever with no way to cancel it (found 2026-08-11).
      const hasPendingIdentityFields =
        !!pendingChangeRequest &&
        Object.keys(pendingChangeRequest.changes).some((f) => (["name", "address", "phone"] as const).includes(f as "name" | "address" | "phone"));
      if (Object.keys(patch).length === 0 && !hasPendingIdentityFields) {
        setEditing(false);
        return;
      }

      // Name/address/phone no longer apply immediately — they go through
      // admin review (requestProfileChange on the backend). Revert the
      // visible fields to the still-current approved values; the pending
      // notice shows what was actually submitted.
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
        // User-facing wording only — the message is rendered verbatim in the
        // "Couldn't save changes" notice.
        throw new Error(
          typeof json?.error === "string" && json.error.trim() ? json.error : "Check your connection and try again."
        );
      }
      // Invalidate any in-flight poll fetch issued before this submit — it
      // could otherwise resolve afterward with the pre-submit (null) state
      // and clobber the pending notice we're about to show.
      pendingRequestFetchSeq.current++;
      pendingChangeRequestRef.current = json.request;
      setPendingChangeRequest(json.request);
      await hydrate(storeInfo);
      setEditing(false);
      // Success haptic only once the request has actually succeeded (the
      // Button's own press haptic is off so it can't fire before a failure).
      void triggerHaptic("success");
      if (json.cancelled) {
        toast.show({ message: "Request withdrawn — it matched your current details.", tone: "success" });
      } else {
        toast.show({ message: "Submitted for review. Changes apply once approved.", tone: "success" });
      }
    } catch (e: any) {
      void triggerHaptic("error");
      setFormError(e?.message || "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (storeInfo) void hydrate(storeInfo);
    setFormError(null);
    setEditing(false);
  };

  const handleEdit = () => {
    setFormError(null);
    setEditing(true);
  };

  // ── Derived display values ─────────────────────────────────────────────────
  const ownerInitial = (session?.user?.name || "?").charAt(0).toUpperCase();
  // Store photos count toward the same "required for verification" total as
  // the required onboarding documents — kept in lockstep with
  // upload-documents.tsx and pending-verification.tsx (this screen already
  // loads the gallery for its own grid, so no extra fetch is needed).
  const TOTAL_REQUIRED = ONBOARDING_REQUIRED_DOC_KEYS.length + MAX_STORE_IMAGES;
  const uploadedCount = uploadedDocCount + gallery.images.length;
  const docsComplete = uploadedCount >= TOTAL_REQUIRED;
  // Derived from the live store row, not session.user.isActivated — that
  // flag is written once at login and never refreshed, so a shop approved
  // after the last login showed "Pending" forever.
  const approved: boolean | null = storeInfo
    ? isStoreApproved(storeInfo)
    : session
      ? !!session.user?.isActivated
      : null;
  const memberSince = storeInfo?.created_at
    ? new Date(storeInfo.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const pendingNotice = pendingChangeRequest ? <PendingChangesNotice request={pendingChangeRequest} /> : null;
  // Skeleton while the hook bootstraps, and for the one render between the
  // store resolving and the hydrate effect committing the form state.
  const loading = storeLoading || (!!store && !storeInfo);
  // Bootstrap settled with nothing to show (no cache and the fetch failed or
  // returned no stores) — ErrorState with Try again.
  const showError = !storeLoading && !store && !storeInfo;

  return (
    <Screen keyboardAvoiding>
      <TopBar
        title="Profile"
        backHref="/settings"
        right={
          !editing && !loading && storeInfo ? (
            <Button label="Edit" variant="text" size="sm" onPress={handleEdit} accessibilityLabel="Edit store information" />
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingBottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.column, { width: contentWidth }]}>
          {loading ? (
            <ProfileSkeleton />
          ) : showError ? (
            <ErrorState
              icon="cloud-offline-outline"
              title="Couldn't load your profile"
              message="Check your connection and try again."
              action={{ onPress: retry }}
            />
          ) : (
            <>
              {refreshError ? (
                <InlineNotice
                  tone="warning"
                  title="Couldn't refresh"
                  message="Showing saved data"
                  action={{ label: "Retry", onPress: retryRefresh }}
                />
              ) : null}

              <ProfileHero
                storeName={storeName || storeInfo?.name || "My Store"}
                ownerInitial={ownerInitial}
                ownerImageUri={ownerPhoto.uri}
                uploading={ownerPhoto.uploading}
                editing={editing}
                onPickPhoto={ownerPhoto.pick}
                isActive={storeInfo ? !!storeInfo.is_active : null}
                approved={approved}
              />

              <GalleryGrid
                images={gallery.images}
                max={MAX_STORE_IMAGES}
                editing={editing}
                uploading={gallery.uploading}
                removingId={gallery.removingId}
                onAdd={gallery.pick}
                onRemove={gallery.requestRemove}
                onStartEditing={handleEdit}
              />

              <StoreInfoForm
                editing={editing}
                values={formValues}
                committed={committedValues}
                onChange={handleFieldChange}
                deliveryRadiusKm={storeInfo?.delivery_radius_km ?? null}
                notice={pendingNotice}
                formError={formError}
                disabled={saving}
              />

              <AccountCard
                ownerName={session?.user?.name ?? ""}
                ownerPhone={session?.user?.phone}
                ownerEmail={session?.user?.email}
                memberSince={memberSince}
                approved={approved}
              />

              <Card padded={false}>
                <ListRow
                  icon="shield-checkmark-outline"
                  iconTile
                  title="Verification documents"
                  description="Aadhaar, PAN, licences and store photos"
                  trailing={
                    <Badge
                      label={`${uploadedCount} of ${TOTAL_REQUIRED}`}
                      tone={docsComplete ? "success" : "warning"}
                      accessibilityLabel={`${uploadedCount} of ${TOTAL_REQUIRED} uploaded`}
                    />
                  }
                  chevron
                  onPress={() => router.push("/upload-documents")}
                  accessibilityLabel={`Verification documents, ${uploadedCount} of ${TOTAL_REQUIRED} uploaded`}
                />
              </Card>
            </>
          )}
        </View>
      </ScrollView>

      {editing ? (
        <StickyFooter>
          <View style={styles.footerRow}>
            <Button label="Cancel" variant="secondary" onPress={handleCancel} disabled={saving} style={styles.footerButton} />
            <Button
              label="Save changes"
              onPress={handleSave}
              loading={saving}
              haptic="none"
              style={styles.footerButton}
            />
          </View>
        </StickyFooter>
      ) : null}

      <ConfirmSheet
        visible={gallery.removeTargetId !== null}
        onClose={gallery.cancelRemove}
        destructive
        title="Remove photo?"
        message="This photo will be removed from your store's gallery."
        confirmLabel="Remove"
        onConfirm={gallery.confirmRemove}
      />
    </Screen>
  );
}

// ── Styles (layout only) ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, alignItems: "center" },
  column: { gap: spacing.xl },
  footerRow: { flexDirection: "row", gap: spacing.md },
  footerButton: { flex: 1 },
});
