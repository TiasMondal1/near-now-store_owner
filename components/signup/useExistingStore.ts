/**
 * Post-signup data for the read-only "Store details" screen.
 *
 * Reached via direct navigation (the verification nav bar, or the back
 * button from documents/pending-verification) rather than fresh off OTP —
 * this app never saves a session before signup completes (see otp.tsx), so
 * a session existing with no `phone` param already means signup is done and
 * the screen shows the submitted details read-only.
 *
 * `phone` (route param) is available synchronously, so `viewOnly` is decided
 * on the very first render; the store is seeded from the shared cache
 * (appCache.ts's peekStores) so name/address appear immediately and only the
 * owner's own session fields fill in a moment later.
 */
import React, { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { getSession } from "../../session";
import { config } from "../../lib/config";
import { peekStores, persistStores, storeCacheGeneration, type CachedStore } from "../../lib/appCache";
import { OWNER_IMAGE_KEY } from "../../lib/storage";
import { fetchVerificationDocuments, type VerificationDocument } from "../../lib/verificationDocuments";

const API_BASE = config.API_BASE;

export type UseExistingStoreOptions = {
  /** Route param — set only when arriving fresh from OTP verification. */
  phone: string;
  /**
   * Receives the owner photo: the AsyncStorage placeholder at mount, then the
   * server's authoritative `owner_image_url` (or null) after every load.
   */
  onOwnerImage: (uri: string | null) => void;
};

export type ExistingStoreController = {
  viewOnly: boolean;
  /** First load with nothing cached — the view renders skeleton rows. */
  loadingExisting: boolean;
  existingStore: CachedStore | null;
  storeLoadFailed: boolean;
  rejectedDocs: VerificationDocument[];
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  retryLoadStore: () => Promise<void>;
};

export function useExistingStore({ phone, onOwnerImage }: UseExistingStoreOptions): ExistingStoreController {
  const cachedStore = !phone ? (peekStores()?.[0] ?? null) : null;
  const [viewOnly, setViewOnly] = useState(!phone);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [existingStore, setExistingStore] = useState<CachedStore | null>(cachedStore);
  const [storeLoadFailed, setStoreLoadFailed] = useState(false);
  // Whether loadStore has ever succeeded — lets the useFocusEffect below
  // self-heal a failed (or not-yet-attempted) first fetch on refocus.
  const storeFetchedRef = useRef(!!cachedStore);
  // Suspension always pairs with a rejected onboarding document server-side,
  // so surfacing rejected docs here restores that visibility regardless of
  // which verification tab the owner lands on first.
  const [rejectedDocs, setRejectedDocs] = useState<VerificationDocument[]>([]);
  // Read-only display copies, separate from the editable form.
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const onOwnerImageRef = useRef(onOwnerImage);
  onOwnerImageRef.current = onOwnerImage;

  // Identity fields (store name/address) must always be authoritative — this
  // screen bypasses the 10-minute store cache, hits the network directly, and
  // re-persists the fresh result so the rest of the app gets corrected data.
  const loadStore = async (session: { token: string }) => {
    setStoreLoadFailed(false);
    try {
      // Same in-flight-mutation guard every other writer of the shared store
      // cache carries: a logout or toggle landing while this GET runs means
      // the response is stale — don't re-persist it as fresh.
      const generationAtStart = storeCacheGeneration();
      const res = await fetch(`${API_BASE}/store-owner/stores`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const json = await res.json().catch(() => null);
      const stores: CachedStore[] = json?.stores ?? [];
      if (stores[0]) {
        storeFetchedRef.current = true;
        setExistingStore(stores[0]);
        if (storeCacheGeneration() === generationAtStart) await persistStores(stores);
        // The server's owner_image_url is authoritative over the AsyncStorage
        // placeholder read at mount (which, on a shared device, can be a
        // previous shopkeeper's photo left over from before logout).
        if (stores[0].owner_image_url) {
          onOwnerImageRef.current(stores[0].owner_image_url);
          AsyncStorage.setItem(OWNER_IMAGE_KEY, stores[0].owner_image_url).catch(() => {});
        } else {
          onOwnerImageRef.current(null);
          AsyncStorage.removeItem(OWNER_IMAGE_KEY).catch(() => {});
        }
        try {
          const docs = await fetchVerificationDocuments(session.token, stores[0].id);
          setRejectedDocs(docs.filter((d) => d.status === "rejected"));
        } catch {
          /* non-fatal — the notice just doesn't show */
        }
      } else {
        storeFetchedRef.current = false;
        setStoreLoadFailed(true);
      }
    } catch {
      storeFetchedRef.current = false;
      setStoreLoadFailed(true);
    }
  };

  useEffect(() => {
    (async () => {
      const savedOwnerImg = await AsyncStorage.getItem(OWNER_IMAGE_KEY);
      if (savedOwnerImg) onOwnerImageRef.current(savedOwnerImg);

      if (phone) return; // fresh from OTP verify — editable mode, nothing else to load
      const session = await getSession();
      if (!session?.token) {
        setViewOnly(false);
        return;
      }

      setViewOnly(true);
      setOwnerName(session.user?.name || "");
      setOwnerPhone(session.user?.phone || "");
      setOwnerEmail(session.user?.email || "");

      // Only show the skeleton if nothing was available from cache —
      // otherwise the page already has real content and this refreshes it
      // in the background.
      if (!cachedStore) setLoadingExisting(true);
      try {
        await loadStore(session);
      } finally {
        setLoadingExisting(false);
      }
    })();
    // `cachedStore` is intentionally read only once at mount to decide
    // whether to show the skeleton, not re-evaluated reactively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  // Self-heals a failed (or not-yet-attempted) first fetch the moment this
  // screen regains focus (e.g. switching to Status/Documents and back).
  useFocusEffect(
    React.useCallback(() => {
      if (viewOnly && !storeFetchedRef.current) {
        (async () => {
          const session = await getSession();
          if (session?.token) {
            if (!existingStore) setLoadingExisting(true);
            try {
              await loadStore(session);
            } finally {
              setLoadingExisting(false);
            }
          }
        })();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewOnly])
  );

  const retryLoadStore = async () => {
    const session = await getSession();
    if (session?.token) await loadStore(session);
  };

  return {
    viewOnly,
    loadingExisting,
    existingStore,
    storeLoadFailed,
    rejectedDocs,
    ownerName,
    ownerPhone,
    ownerEmail,
    retryLoadStore,
  };
}
