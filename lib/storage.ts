/**
 * Uploads the store's gallery photos and the owner's photo.
 *
 * Buckets (public, so the returned URL works directly in <Image>):
 *   store-images        – store gallery photos, up to MAX_STORE_IMAGES
 *   store-owner-images  – the store owner's profile photo
 *
 * How (2026-10-27): the backend checks who is asking and hands out a
 * one-photo upload token for a fresh path in that store's / owner's folder
 * (POST /store-owner/upload-url); the photo then goes straight to Storage with
 * uploadToSignedUrl, which needs no Storage policy. These uploads used the
 * anon key with `upsert: true`, so the buckets had to let anyone write —
 * anyone holding the (public) key could overwrite any owner's photo. Every
 * upload now gets a new path, so nothing is overwritten.
 *
 * Verification documents (Aadhaar, FSSAI, etc.) are NOT uploaded from here —
 * that bucket (store-documents) is private and uploads are proxied through
 * the backend (lib/verificationDocuments.ts). uploadStoreImage() results are
 * registered in `store_images` via POST /store-owner/stores/:id/images.
 */

import { supabase } from './supabase';
import { apiClient } from './api-client';
import { getSession } from '../session';

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

type UploadTarget = { kind: 'store_image'; store_id: string } | { kind: 'owner_photo' };

type UploadUrl = { bucket: string; path: string; token: string; public_url: string };

/**
 * Upload an image file from a local URI through a backend-issued upload token.
 * Returns the public URL on success.
 */
async function uploadImage(target: UploadTarget, localUri: string, mimeType = 'image/jpeg'): Promise<UploadResult> {
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

    const session = await getSession();
    if (!session?.token) return { ok: false, error: 'Please log in again to upload photos.' };

    const issued = await apiClient.post<UploadUrl & { success: boolean }>(
      '/store-owner/upload-url',
      { ...target, content_type: mimeType },
      { Authorization: `Bearer ${session.token}` }
    );
    const upload = issued.data;
    if (!issued.success || !upload?.token) {
      return { ok: false, error: issued.error || 'Could not prepare the upload. Please try again.' };
    }

    const { error } = await supabase.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, arrayBuffer, { contentType: mimeType });
    if (error) return { ok: false, error: error.message };

    return { ok: true, url: upload.public_url };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Upload failed' };
  }
}

/**
 * Upload one photo to the store's gallery (up to MAX_STORE_IMAGES, enforced
 * backend-side in storeOwner.controller.ts's addStoreImage). The backend picks
 * a new path for each upload, so a photo never overwrites another.
 */
export async function uploadStoreImage(
  storeId: string,
  localUri: string
): Promise<UploadResult> {
  const { mime } = imageExtAndMime(localUri);
  return uploadImage({ kind: 'store_image', store_id: storeId }, localUri, mime);
}

/** Upload the store owner's profile photo (to the signed-in owner's own folder). */
export async function uploadOwnerImage(localUri: string): Promise<UploadResult> {
  const { mime } = imageExtAndMime(localUri);
  return uploadImage({ kind: 'owner_photo' }, localUri, mime);
}
