/**
 * Store photo gallery state for the Documents screen: saved photos from the
 * server, locally staged photos (uploaded only on Save, mirroring how
 * document files work), and the add / remove / save handlers. The caller
 * owns all UI (grid, confirm sheet) and the save orchestration.
 */
import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { getSession } from "../../session";
import { config } from "../../lib/config";
import { uploadStoreImage } from "../../lib/storage";
import { useToast } from "../ui";
import type { GalleryImage } from "./PhotoGalleryGrid";

const API_BASE = config.API_BASE;

export type UseStoreImagesOptions = {
  storeId: string | null;
  /** Maximum saved + staged photos. */
  max: number;
  /** Called when a photo is staged (e.g. to clear a stale "Saved" notice). */
  onStaged?: () => void;
  /** Called when a post-save / post-remove gallery reload fails. */
  onReloadError?: () => void;
};

export type StoreImagesState = {
  images: GalleryImage[];
  pending: string[];
  uploading: boolean;
  removingId: string | null;
  /** GET the gallery. Throws on failure so callers can surface it. */
  load: (targetStoreId: string) => Promise<void>;
  /** Opens the gallery picker (16:9 crop) and stages the result. */
  pick: () => Promise<void>;
  removePending: (index: number) => void;
  /** Uploads + registers every staged photo. Returns false (toast already shown) on failure. */
  saveAll: () => Promise<boolean>;
  /** DELETE one saved photo. Throws so a ConfirmSheet can show the error inline. */
  removeSaved: (imageId: string) => Promise<void>;
};

export function useStoreImages({ storeId, max, onStaged, onReloadError }: UseStoreImagesOptions): StoreImagesState {
  const toast = useToast();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (targetStoreId: string) => {
    const session = await getSession();
    if (!session?.token) return;
    const res = await fetch(`${API_BASE}/store-owner/stores/${targetStoreId}/images`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load store images");
    setImages((json.images ?? []).map((img: { id: string; url: string }) => ({ id: img.id, url: img.url })));
  }, []);

  const reload = useCallback(
    async (targetStoreId: string) => {
      try {
        await load(targetStoreId);
      } catch {
        onReloadError?.();
      }
    },
    [load, onReloadError]
  );

  const pick = useCallback(async () => {
    if (!storeId) {
      toast.show({ message: "Store info is still loading — try again in a moment.", tone: "error" });
      return;
    }
    if (images.length + pending.length >= max) {
      toast.show({ message: `A store can have at most ${max} photos. Remove one before adding another.`, tone: "error" });
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      // Stage only — the upload happens on Save (see saveAll).
      setPending((prev) => [...prev, result.assets[0].uri]);
      onStaged?.();
    } catch (err) {
      console.warn("[upload-documents] pickStoreImage failed:", err);
      toast.show({ message: "Couldn't open gallery. Please try again.", tone: "error" });
    }
  }, [storeId, images.length, pending.length, max, onStaged, toast]);

  const removePending = useCallback((index: number) => {
    setPending((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const saveAll = useCallback(async (): Promise<boolean> => {
    if (!storeId || pending.length === 0) return true;
    setUploading(true);
    try {
      const session = await getSession();
      if (!session?.token) {
        toast.show({ message: "Your session has expired. Please sign in again.", tone: "error" });
        return false;
      }
      for (const uri of pending) {
        const res = await uploadStoreImage(storeId, uri);
        if (!res.ok) {
          toast.show({ message: res.error, tone: "error" });
          return false;
        }
        const addRes = await fetch(`${API_BASE}/store-owner/stores/${storeId}/images`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: res.url }),
        });
        const addJson = await addRes.json().catch(() => null);
        if (!addRes.ok || !addJson?.success) {
          toast.show({ message: addJson?.error || "Photo uploaded but couldn't be added to your gallery.", tone: "error" });
          return false;
        }
      }
      setPending([]);
      await reload(storeId);
      return true;
    } finally {
      setUploading(false);
    }
  }, [storeId, pending, reload, toast]);

  const removeSaved = useCallback(
    async (imageId: string) => {
      if (!storeId) return;
      setRemovingId(imageId);
      try {
        const session = await getSession();
        if (!session?.token) throw new Error("Your session has expired. Please sign in again.");
        const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/images/${imageId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to remove photo.");
        await reload(storeId);
        toast.show({ message: "Photo removed", tone: "success" });
      } finally {
        setRemovingId(null);
      }
    },
    [storeId, reload, toast]
  );

  return { images, pending, uploading, removingId, load, pick, removePending, saveAll, removeSaved };
}
