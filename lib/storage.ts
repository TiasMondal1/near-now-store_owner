/**
 * Supabase Storage helpers for uploading images from the app.
 *
 * Buckets used:
 *   store-images      – store banner/cover photos
 *   owner-images      – store owner profile photos
 *   store-documents   – verification documents (Aadhaar, FSSAI, etc.)
 *
 * All three buckets should be PUBLIC so the returned URL is directly usable
 * in <Image source={{ uri }}> without signed-URL expiry.
 *
 * Run this SQL in Supabase to create the buckets and add the image columns
 * to the stores table:
 *
 *   -- Storage buckets (public)
 *   INSERT INTO storage.buckets (id, name, public)
 *   VALUES
 *     ('store-images',    'store-images',    true),
 *     ('owner-images',    'owner-images',    true),
 *     ('store-documents', 'store-documents', false)
 *   ON CONFLICT (id) DO NOTHING;
 *
 *   -- Columns on stores table
 *   ALTER TABLE stores
 *     ADD COLUMN IF NOT EXISTS image_url             TEXT,
 *     ADD COLUMN IF NOT EXISTS owner_image_url       TEXT,
 *     ADD COLUMN IF NOT EXISTS verification_document TEXT,
 *     ADD COLUMN IF NOT EXISTS verification_number   TEXT;
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

/** Upload the store's banner/cover photo. */
export async function uploadStoreImage(
  storeId: string,
  localUri: string
): Promise<UploadResult> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${storeId}/cover.${ext}`;
  return uploadImage('store-images', path, localUri);
}

/** Upload the store owner's profile photo. */
export async function uploadOwnerImage(
  ownerId: string,
  localUri: string
): Promise<UploadResult> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${ownerId}/avatar.${ext}`;
  return uploadImage('owner-images', path, localUri);
}

/** Upload a verification document image. */
export async function uploadVerificationDoc(
  storeId: string,
  docType: string,
  localUri: string
): Promise<UploadResult> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${storeId}/${docType}.${ext}`;
  return uploadImage('store-documents', path, localUri);
}
