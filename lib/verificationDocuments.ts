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
): Promise<{ ok: true; document: VerificationDocument } | { ok: false; error: string }> {
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
    return { ok: true, document: json.document };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
