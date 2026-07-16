export const REQUIRED_DOC_KEYS = ["aadhaar", "pan", "trade", "gst", "fssai"] as const;
export type RequiredDocKey = (typeof REQUIRED_DOC_KEYS)[number];

export const DOCS_STORAGE_KEY = (storeId: string) => `store_verification_docs_${storeId}`;

export function countUploadedDocsFromRecord(raw: unknown): number {
  if (!raw) return 0;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return REQUIRED_DOC_KEYS.filter((key) => parsed?.[key]?.url).length;
  } catch {
    return 0;
  }
}
