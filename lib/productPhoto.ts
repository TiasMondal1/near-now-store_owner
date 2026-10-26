/**
 * Shrinks a picked product photo before it is sent inline (as a base64 data
 * URL) with POST /shopkeeper/product-submissions.
 *
 * 2026-10-26: the picker used to hand over the full-resolution photo at
 * quality 0.8 — 2–5 MB from a phone camera, 3–7 MB once base64-encoded — which
 * overflowed the API's JSON body cap (4 MB on that route, 4.5 MB at Vercel)
 * and, once approved, sat in master_products.image_url and every checkout
 * payload that carried it. A catalogue image never needs more than ~1000 px,
 * and at that size a photo is ~100–250 KB.
 *
 * Always re-encodes to JPEG, so the `data:image/jpeg` prefix the form builds
 * (customProductValidation.resolveImageUrl) is true even for a PNG or HEIC
 * picked from the gallery.
 */
import * as ImageManipulator from "expo-image-manipulator";

export const MAX_PRODUCT_PHOTO_DIMENSION = 1024;
export const PRODUCT_PHOTO_JPEG_QUALITY = 0.7;

/** Resize that caps the longest side at the limit, or null when it already fits (or size is unknown). */
export function productPhotoResize(
  width: number | undefined,
  height: number | undefined,
  max: number = MAX_PRODUCT_PHOTO_DIMENSION
): { width: number } | { height: number } | null {
  const w = width ?? 0;
  const h = height ?? 0;
  if (w <= 0 || h <= 0) return null;
  if (Math.max(w, h) <= max) return null;
  return w >= h ? { width: max } : { height: max };
}

export type PreparedProductPhoto = { uri: string; base64: string };

/**
 * Downscaled JPEG copy of a picked photo with its base64. Throws when the
 * image cannot be processed or no base64 comes back — the caller shows an
 * error rather than falling back to the full-size original.
 */
export async function prepareProductPhoto(asset: {
  uri: string;
  width?: number;
  height?: number;
}): Promise<PreparedProductPhoto> {
  const resize = productPhotoResize(asset.width, asset.height);
  const result = await ImageManipulator.manipulateAsync(asset.uri, resize ? [{ resize }] : [], {
    compress: PRODUCT_PHOTO_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!result.base64) throw new Error("Photo could not be encoded");
  return { uri: result.uri, base64: result.base64 };
}
