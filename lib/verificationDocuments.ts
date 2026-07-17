import { config } from "./config";

export const REQUIRED_DOC_KEYS = ["aadhaar", "pan", "trade", "gst", "fssai"] as const;
export type RequiredDocKey = (typeof REQUIRED_DOC_KEYS)[number];

export type DocStatus = "pending" | "approved" | "rejected" | null;

export type VerificationDocument = {
  doc_type: RequiredDocKey;
  number: string | null;
  url: string | null;
  status: DocStatus;
  rejection_reason: string | null;
  uploaded_at: string | null;
  reviewed_at: string | null;
  /** Human-readable (e.g. "340 KB", "1.2 MB") — computed once server-side at upload time. */
  file_size: string | null;
};

export type PickedDocFile = { uri: string; name: string; type: string; size?: number };

/**
 * Format checks for the 4 centrally-standardized documents. Trade License
 * deliberately has no entry — unlike Aadhaar/PAN/GST/FSSAI, it's issued by
 * local municipal corporations with no single national format, so any fixed
 * pattern would be wrong for shopkeepers in most cities. Mirrors the backend
 * (backend/src/utils/verificationDocuments.ts) — the backend check is the
 * authoritative one; this is just for immediate client-side feedback.
 */
export const DOC_NUMBER_PATTERNS: Partial<Record<RequiredDocKey, RegExp>> = {
  aadhaar: /^[2-9][0-9]{11}$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  fssai: /^[0-9]{14}$/,
};

/** Format breakdown + example, shown both persistently under the field and in the save-time alert. */
export const DOC_NUMBER_FORMATS: Partial<Record<RequiredDocKey, { description: string; example: string }>> = {
  aadhaar: { description: "12 digits", example: "234567890123" },
  pan: { description: "5 letters + 4 digits + 1 letter (10 characters)", example: "ABCDE1234F" },
  gst: {
    description: '15 characters: 2-digit state code + 10-character PAN + 1 digit (entity number) + "Z" + 1 checksum character',
    example: "22AAAAA0000A1Z5",
  },
  fssai: { description: "14 digits", example: "12345678901234" },
};

export function docNumberErrorMessage(docType: RequiredDocKey): string {
  const format = DOC_NUMBER_FORMATS[docType];
  if (!format) return "Invalid document number format.";
  return `Invalid ${docType.toUpperCase()} number.\nFormat: ${format.description}\nExample: ${format.example}`;
}

/** Exact expected length for the 4 fixed-length documents — no entry for Trade License. */
export const DOC_NUMBER_LENGTHS: Partial<Record<RequiredDocKey, number>> = {
  aadhaar: 12,
  pan: 10,
  gst: 15,
  fssai: 14,
};

export function validateDocNumber(docType: RequiredDocKey, number: string): boolean {
  const pattern = DOC_NUMBER_PATTERNS[docType];
  if (!pattern) return true; // trade — no fixed format to check
  return pattern.test(number);
}

/** For a freshly picked (not yet saved) file's raw byte count — server documents already come formatted. */
export function formatPickedFileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const API_BASE = config.API_BASE;

/** Fetch the caller's store's 5 verification documents, each with a signed URL. */
export async function fetchVerificationDocuments(
  token: string,
  storeId: string
): Promise<VerificationDocument[]> {
  const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/verification-documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch verification documents");
  const json = await res.json();
  return json?.documents ?? [];
}

/**
 * Save one verification document's number and/or file. Uploads are proxied
 * through the backend (multipart) rather than direct-to-Supabase-Storage —
 * this app has no real Supabase Auth session to scope a client-side storage
 * policy to. Always resets that document's status back to "pending" server-side.
 */
export async function saveVerificationDocument(
  token: string,
  storeId: string,
  docType: RequiredDocKey,
  fields: { number?: string; file?: PickedDocFile }
): Promise<
  | { ok: true; document: VerificationDocument; storeSuspended: boolean }
  | { ok: false; error: string }
> {
  const form = new FormData();
  if (fields.number) form.append("number", fields.number);
  if (fields.file) {
    form.append("file", {
      uri: fields.file.uri,
      name: fields.file.name,
      type: fields.file.type,
    } as unknown as Blob);
  }

  try {
    const res = await fetch(
      `${API_BASE}/store-owner/stores/${storeId}/verification-documents/${docType}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { ok: false, error: json?.error || "Failed to save document" };
    }
    return { ok: true, document: json.document, storeSuspended: !!json.storeSuspended };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

/**
 * Delete an already-uploaded document, removing both the file and its record
 * so it can be re-uploaded from scratch. If the store was already approved,
 * editing/removing a document sends it back for full re-verification — same
 * as save (see storeSuspended).
 */
export async function deleteVerificationDocument(
  token: string,
  storeId: string,
  docType: RequiredDocKey
): Promise<{ ok: true; storeSuspended: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${API_BASE}/store-owner/stores/${storeId}/verification-documents/${docType}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { ok: false, error: json?.error || "Failed to delete document" };
    }
    return { ok: true, storeSuspended: !!json.storeSuspended };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
