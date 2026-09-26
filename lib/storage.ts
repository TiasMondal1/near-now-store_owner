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

/**
 * Shared AsyncStorage key for the owner's profile photo URL — both
 * store-owner-signup.tsx (Details) and billing-info.tsx read/write the same
 * owner photo (backed by stores.owner_image_url), so both must use this same
 * key or an upload from one screen won't be visible on the other until the
 * next network refetch.
 */
export const OWNER_IMAGE_KEY = "owner_profile_image_url";

type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Hard cap on a single photo upload — matches the document-upload limit. */
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * Derive a safe file extension + MIME type from a picker URI.
 * `uri.split('.').pop()` on its own returned the *entire URI* for
 * extension-less `content://`/ImagePicker temp paths (producing garbage
 * object keys), and everything was labelled image/jpeg regardless of type.
 */
function imageExtAndMime(localUri: string): { ext: string; mime: string } {
  const withoutQuery = localUri.split(/[?#]/)[0];
  const lastSegment = withoutQuery.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  const rawExt = dot >= 0 ? lastSegment.slice(dot + 1).toLowerCase() : '';
  const ext = IMAGE_EXT_TO_MIME[rawExt] ? rawExt : 'jpg';
  return { ext, mime: IMAGE_EXT_TO_MIME[ext] };
}

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

    if (arrayBuffer.byteLength === 0) {
      return { ok: false, error: 'Selected image is empty or could not be read' };
    }
    if (arrayBuffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
      return { ok: false, error: 'Image is too large. Please choose a photo under 5 MB.' };
    }

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
  const { ext, mime } = imageExtAndMime(localUri);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${storeId}/${unique}.${ext}`;
  return uploadImage('store-images', path, localUri, mime);
}

/**
 * Upload the store owner's profile photo.
 *
 * NOTE: the bucket's anon write policy plus `upsert: true` on a predictable
 * `<ownerId>/avatar.*` path means anyone holding the (public) anon key can
 * overwrite any owner's photo. That can only be closed server-side — by
 * scoping the storage policy to the `x-shopkeeper-token` header the same
 * way the table RLS does — and is tracked as a backend follow-up.
 */
export async function uploadOwnerImage(
  ownerId: string,
  localUri: string
): Promise<UploadResult> {
  const { ext, mime } = imageExtAndMime(localUri);
  const path = `${ownerId}/avatar.${ext}`;
  return uploadImage('store-owner-images', path, localUri, mime);
}
