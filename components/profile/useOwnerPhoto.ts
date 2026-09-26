/**
 * Owner (KYC) photo state for Profile: local/remote uri, one-time lock,
 * picker → upload → AsyncStorage + PATCH, optimistic preview with rollback,
 * and the reconciliation against the server's `owner_image_url` that
 * `hydrate()` runs on every store refresh.
 *
 * Logic is unchanged from the pre-redesign screen; only feedback moved from
 * Alert to toast.
 */
import { useCallback, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "../../lib/config";
import { clearStoreCache } from "../../lib/appCache";
import { uploadOwnerImage, OWNER_IMAGE_KEY } from "../../lib/storage";
import { useToast } from "../ui";

const API_BASE = config.API_BASE;

type OwnerPhotoSession = { token?: string; user?: { id?: string } } | null;

export function useOwnerPhoto(session: OwnerPhotoSession, storeId: string | undefined) {
  const toast = useToast();
  const [uri, setUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Guards reconcile()'s owner-image update against a background store
  // refresh that was issued before a photo upload but resolves after it —
  // without this, the stale response's (still-empty) owner_image_url would
  // revert the just-uploaded photo back to null. Set the instant an upload
  // starts; checked against the timestamp a given fetch was issued.
  const uploadedAtRef = useRef(0);

  /** Same-mount-tick optimistic placeholder from AsyncStorage, before the store row arrives. */
  const seedFromStorage = useCallback((saved: string | null) => {
    if (saved) setUri(saved);
  }, []);

  /**
   * Always prefer the server's own owner_image_url over whatever's cached in
   * AsyncStorage — the cache is only ever a same-mount-tick optimistic
   * placeholder and, on a shared device, can otherwise still be a *previous*
   * shopkeeper's photo left over from before logout. This is the
   * authoritative reconciliation — unless a newer local upload already
   * supersedes this particular fetch (`fetchIssuedAt`).
   */
  const reconcile = useCallback((store: { owner_image_url?: string | null }, fetchIssuedAt?: number) => {
    if (fetchIssuedAt !== undefined && uploadedAtRef.current > fetchIssuedAt) return;
    if (store.owner_image_url) {
      setUri(store.owner_image_url);
      AsyncStorage.setItem(OWNER_IMAGE_KEY, store.owner_image_url).catch(() => {});
    } else {
      setUri(null);
      AsyncStorage.removeItem(OWNER_IMAGE_KEY).catch(() => {});
    }
  }, []);

  const patchStore = async (fields: Record<string, string>) => {
    if (!session?.token || !storeId) return;
    try {
      await fetch(`${API_BASE}/store-owner/stores/${storeId}`, {
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

  const pick = async () => {
    // Same one-time-lock as store-owner-signup.tsx/billing-info.tsx — this is
    // a KYC/identity photo, not an ordinary profile picture, and should never
    // be silently replaceable post-verification from any screen.
    if (uri || uploading) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      if (!session?.user?.id) {
        toast.show({ message: "Your session is still loading — try again in a moment.", tone: "error" });
        return;
      }
      const localUri = result.assets[0].uri;
      // Marked the instant the local preview is set (not just on upload
      // success) so a background reconcile() already in flight can't revert
      // even this optimistic state — see uploadedAtRef's declaration.
      uploadedAtRef.current = Date.now();
      setUri(localUri);
      setUploading(true);
      try {
        const res = await uploadOwnerImage(session.user.id, localUri);
        if (res.ok) {
          // Save remote URL so it persists across sessions
          await AsyncStorage.setItem(OWNER_IMAGE_KEY, res.url);
          setUri(res.url);
          // Also persist to store row if column exists
          await patchStore({ owner_image_url: res.url });
          toast.show({ message: "Owner photo saved", tone: "success" });
        } else {
          // Upload failed: roll the optimistic preview back so the avatar
          // isn't "locked" on a photo that never reached the server, and let
          // the shopkeeper retry. (Persisting the local file path here used
          // to lock them out until a later server reconcile.)
          uploadedAtRef.current = 0;
          setUri(null);
          toast.show({ message: res.error || "Could not upload your photo. Please try again.", tone: "error" });
        }
      } finally {
        setUploading(false);
      }
    } catch (err) {
      console.warn("[profile] pickOwnerImage failed:", err);
      toast.show({ message: "Couldn't open gallery. Please try again.", tone: "error" });
    }
  };

  return { uri, uploading, seedFromStorage, reconcile, pick };
}

export default useOwnerPhoto;
