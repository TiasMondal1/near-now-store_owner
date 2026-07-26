/**
 * Supabase Storage helpers for uploading images from the app.
 *
 * Buckets used directly from the app:
 *   store-images        – store gallery photos, up to MAX_STORE_IMAGES (public)
 *   store-owner-images  – store owner profile photo (public)
 *
 * Both should be PUBLIC so the returned URL is directly usable in
 * <Image source={{ uri }}> without signed-URL expiry.
 *
 * Verification documents (Aadhaar, FSSAI, etc.) are NOT uploaded from here —
 * that bucket (store-documents) is private, and uploads are proxied through
 * the backend instead (see lib/verificationDocuments.ts), since this app has
 * no real Supabase Auth session to scope a client-side storage policy to.
 *
 * Buckets and the anon-key write policies these uploads rely on are created
 * by supabase/migrations/20260802000000_store_owner_images_buckets.sql in the
 * near-and-now repo (previously manual/untracked — see that file for why
 * these need an anon write policy, unlike the backend-proxied verification
 * documents flow). uploadStoreImage() results are registered in the
 * `store_images` table (migration 20260903000000) via
 * storeOwner.controller.ts's addStoreImage, not written straight to
 * stores.image_url anymore — see profile.tsx's gallery UI.
 */

import { supabase } from './supabase';

type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Upload an image file from a local URI to a Supabase Storage bucket.
 * Returns the public URL on success.
 */
async function uploadImage(
  bucket: string,
  path: string,
  localUri: string,
  mimeType = 'image/jpeg'
): Promise<UploadResult> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };

  try {
    // React Native: fetch the local file and convert to ArrayBuffer
    const response = await fetch(localUri);
    const arrayBuffer = await response.arrayBuffer();

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) return { ok: false, error: error.message };

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Upload failed' };
  }
}

/**
 * Upload one photo to the store's gallery (up to MAX_STORE_IMAGES, enforced
 * backend-side in storeOwner.controller.ts's addStoreImage). Each upload
 * gets its own path — a fixed `cover.${ext}` path would silently overwrite
 * whatever was there before, which is exactly the single-image limitation
 * this multi-image support replaces.
 */
export async function uploadStoreImage(
  storeId: string,
  localUri: string
): Promise<UploadResult> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${storeId}/${unique}.${ext}`;
  return uploadImage('store-images', path, localUri);
}

/** Upload the store owner's profile photo. */
export async function uploadOwnerImage(
  ownerId: string,
  localUri: string
): Promise<UploadResult> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${ownerId}/avatar.${ext}`;
  return uploadImage('store-owner-images', path, localUri);
}
