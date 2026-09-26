/**
 * Store gallery state + networking for Profile: list, add (picker → upload →
 * POST), and remove (ConfirmSheet → DELETE). Pulled out of app/profile.tsx so
 * the screen holds layout and form wiring only.
 *
 * Endpoints, payloads, guards and the `__placeholder__` seeding are unchanged
 * from the pre-redesign screen; only the feedback surface (toast / inline
 * sheet error instead of Alert) differs.
 */
import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { getSession } from "../../session";
import { config } from "../../lib/config";
import { uploadStoreImage } from "../../lib/storage";
import { useToast } from "../ui";
import type { GalleryImage } from "../kyc";

const API_BASE = config.API_BASE;

/** Id of the one-time optimistic tile seeded from `storeInfo.image_url`. */
export const GALLERY_PLACEHOLDER_ID = "__placeholder__";

export function useStoreGallery(storeId: string | undefined, max: number) {
  const toast = useToast();
  // `store_images` (migration 20260903000000) is the source of truth;
  // storeInfo.image_url is only a one-time optimistic placeholder for the
  // first paint, before the real list loads.
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Holds the id of the photo awaiting confirmation in the "Remove photo?" sheet.
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    try {
      const s = await getSession();
      if (!s?.token) return;
      const res = await fetch(`${API_BASE}/store-owner/stores/${id}/images`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setImages((json.images ?? []).map((img: any) => ({ id: img.id, url: img.url })));
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  /** Optimistic placeholder only — never overwrites an already-loaded list. */
  const seedPlaceholder = useCallback((url: string) => {
    setImages((prev) => (prev.length ? prev : [{ id: GALLERY_PLACEHOLDER_ID, url }]));
  }, []);

  const pick = async () => {
    if (!storeId) {
      toast.show({ message: "Store info is still loading — try again in a moment.", tone: "error" });
      return;
    }
    if (images.length >= max) {
      toast.show({ message: `A store can have at most ${max} photos. Remove one before adding another.`, tone: "error" });
      return;
    }
    if (uploading) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;

      const uri = result.assets[0].uri;
      setUploading(true);
      try {
        const res = await uploadStoreImage(storeId, uri);
        if (!res.ok) {
          toast.show({ message: res.error || "Upload failed. Please try again.", tone: "error" });
          return;
        }
        const s = await getSession();
        if (!s?.token) return;
        const addRes = await fetch(`${API_BASE}/store-owner/stores/${storeId}/images`, {
          method: "POST",
          headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: res.url }),
        });
        const addJson = await addRes.json().catch(() => null);
        if (!addRes.ok || !addJson?.success) {
          toast.show({ message: addJson?.error || "Photo uploaded but couldn't be added to your gallery.", tone: "error" });
          return;
        }
        await load(storeId);
        toast.show({ message: "Photo added", tone: "success" });
      } finally {
        setUploading(false);
      }
    } catch (err) {
      console.warn("[profile] pickStoreImage failed:", err);
      toast.show({ message: "Couldn't open gallery. Please try again.", tone: "error" });
    }
  };

  /** Opens the "Remove photo?" ConfirmSheet; the DELETE runs in `confirmRemove`. */
  const requestRemove = (imageId: string) => {
    if (!storeId || imageId === GALLERY_PLACEHOLDER_ID) return;
    setRemoveTargetId(imageId);
  };

  const cancelRemove = () => setRemoveTargetId(null);

  const confirmRemove = async () => {
    const imageId = removeTargetId;
    if (!storeId || !imageId) return;
    setRemovingId(imageId);
    try {
      const s = await getSession();
      if (!s?.token) return;
      const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/images/${imageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        // Rejecting keeps the sheet open with the error inline (never Alert).
        throw new Error(json?.error || "Failed to remove photo.");
      }
      await load(storeId);
      toast.show({ message: "Photo removed", tone: "success" });
    } finally {
      setRemovingId(null);
    }
  };

  return {
    images,
    uploading,
    removingId,
    removeTargetId,
    load,
    seedPlaceholder,
    pick,
    requestRemove,
    cancelRemove,
    confirmRemove,
  };
}

export default useStoreGallery;
