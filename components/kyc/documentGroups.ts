/**
 * Static configuration + pure status logic for the Documents screen. Kept
 * out of app/upload-documents.tsx so the screen holds only state and layout.
 */
import type { TextInputProps } from "react-native";
import {
  DOC_NUMBER_FORMATS,
  DOC_NUMBER_LENGTHS,
  ONBOARDING_REQUIRED_DOC_KEYS,
  type PickedDocFile,
  type RequiredDocKey,
  type VerificationDocument,
} from "../../lib/verificationDocuments";
import type { DocumentStatus } from "./DocumentCard";

export type DocKey = RequiredDocKey;
export type DocsState = Record<DocKey, VerificationDocument | null>;
export type PendingFiles = Partial<Record<DocKey, PickedDocFile>>;

/** Required store photos. The single source for the Documents and Status screens. */
export const MAX_STORE_IMAGES = 5;

export type DocumentSection = {
  key: DocKey;
  label: string;
  placeholder: string;
  hasNumber: boolean;
};

export const DOCUMENT_SECTIONS: readonly DocumentSection[] = [
  { key: "aadhaar_front", label: "Aadhaar card (front)", placeholder: "12-digit Aadhaar number", hasNumber: true },
  { key: "aadhaar_back", label: "Aadhaar card (back)", placeholder: "", hasNumber: false },
  { key: "pan_front", label: "PAN card (front)", placeholder: "10-character PAN, e.g. ABCDE1234F", hasNumber: true },
  { key: "pan_back", label: "PAN card (back)", placeholder: "", hasNumber: false },
  { key: "trade", label: "Trade licence", placeholder: "Trade licence number", hasNumber: true },
  { key: "gst", label: "GST certificate", placeholder: "15-character GSTIN, e.g. 22AAAAA0000A1Z5", hasNumber: true },
  { key: "fssai", label: "FSSAI licence", placeholder: "14-digit FSSAI number", hasNumber: true },
];

export const SECTION_BY_KEY = Object.fromEntries(DOCUMENT_SECTIONS.map((s) => [s.key, s])) as Record<
  DocKey,
  DocumentSection
>;

export const EMPTY_DOCS = (): DocsState => Object.fromEntries(DOCUMENT_SECTIONS.map((d) => [d.key, null])) as DocsState;
export const EMPTY_NUMBERS = (): Record<DocKey, string> =>
  Object.fromEntries(DOCUMENT_SECTIONS.map((d) => [d.key, ""])) as Record<DocKey, string>;

/**
 * Aadhaar and PAN each have 2 underlying document rows (front/back) but are
 * shown as one card — a single header + document number (taken from the
 * front, where the number is printed), then a front box and a back box.
 * Trade/GST/FSSAI are single-document cards.
 */
export type DocGroup = {
  groupKey: string;
  headerLabel: string;
  numberKey: DocKey | null;
  members: readonly DocKey[];
};

export const DOCUMENT_GROUPS: readonly DocGroup[] = [
  { groupKey: "aadhaar", headerLabel: "Aadhaar card", numberKey: "aadhaar_front", members: ["aadhaar_front", "aadhaar_back"] },
  { groupKey: "pan", headerLabel: "PAN card", numberKey: "pan_front", members: ["pan_front", "pan_back"] },
  { groupKey: "trade", headerLabel: "Trade licence", numberKey: "trade", members: ["trade"] },
  { groupKey: "gst", headerLabel: "GST certificate", numberKey: "gst", members: ["gst"] },
  { groupKey: "fssai", headerLabel: "FSSAI licence", numberKey: "fssai", members: ["fssai"] },
];

// Only Aadhaar + PAN are required to get a store approved for the first
// time — Trade licence/GST/FSSAI are shown only once the store is already
// approved, as an optional add-anytime step.
export const ONBOARDING_GROUP_KEYS: ReadonlySet<string> = new Set(["aadhaar", "pan"]);

export function isOnboardingKey(key: string): boolean {
  return (ONBOARDING_REQUIRED_DOC_KEYS as readonly string[]).includes(key);
}

export function visibleGroupsFor(isApproved: boolean): readonly DocGroup[] {
  return isApproved ? DOCUMENT_GROUPS : DOCUMENT_GROUPS.filter((g) => ONBOARDING_GROUP_KEYS.has(g.groupKey));
}

export function visibleSectionsFor(isApproved: boolean): readonly DocumentSection[] {
  return DOCUMENT_SECTIONS.filter((s) => isApproved || isOnboardingKey(s.key));
}

const STATUS = {
  needsReupload: { label: "Needs re-upload", tone: "error" } as DocumentStatus,
  readyToSave: { label: "Ready to save", tone: "info" } as DocumentStatus,
  verified: { label: "Verified", tone: "success" } as DocumentStatus,
  pendingReview: { label: "Pending review", tone: "warning" } as DocumentStatus,
  saved: { label: "Saved", tone: "success" } as DocumentStatus,
} as const;

/**
 * Group status, in priority order: any member rejected with no pending file →
 * "Needs re-upload"; any pending file → "Ready to save"; any member missing a
 * url → none (still the shopkeeper's turn); all approved → "Verified"; else
 * "Pending review".
 */
export function computeGroupStatus(group: DocGroup, serverDocs: DocsState, pendingFiles: PendingFiles): DocumentStatus | null {
  if (group.members.some((k) => !pendingFiles[k] && serverDocs[k]?.status === "rejected")) return STATUS.needsReupload;
  if (group.members.some((k) => !!pendingFiles[k])) return STATUS.readyToSave;
  if (group.members.some((k) => !serverDocs[k]?.url)) return null;
  if (group.members.every((k) => serverDocs[k]?.status === "approved")) return STATUS.verified;
  return STATUS.pendingReview;
}

/** "Ready to save" while photos are staged, "Saved" once any are on the server. */
export function computeImagesStatus(savedCount: number, pendingCount: number): DocumentStatus | null {
  if (pendingCount > 0) return STATUS.readyToSave;
  if (savedCount > 0) return STATUS.saved;
  return null;
}

/** Per-field keyboard + length config for the document-number inputs. */
export function numberFieldConfig(key: DocKey): { keyboardType: TextInputProps["keyboardType"]; maxLength?: number } {
  const numeric = key === "aadhaar_front" || key === "fssai";
  return { keyboardType: numeric ? "number-pad" : "default", maxLength: DOC_NUMBER_LENGTHS[key] };
}

/** Persistent helper under a number field: "Format: 12 digits. Example: 2345…" (none for Trade licence). */
export function numberHelper(key: DocKey): string | undefined {
  const format = DOC_NUMBER_FORMATS[key];
  return format ? `Format: ${format.description}. Example: ${format.example}` : undefined;
}

/** Live length mismatch message while typing, or undefined when the length is fine / unknown. */
export function numberLengthError(key: DocKey, value: string): string | undefined {
  const format = DOC_NUMBER_FORMATS[key];
  const expected = DOC_NUMBER_LENGTHS[key];
  const current = value.length;
  if (!format || !expected || current === 0 || current === expected) return undefined;
  return `${current > expected ? "Too long" : "Too short"} — expected ${format.description} (currently ${current} characters).`;
}

export type SaveSummaryInput = {
  isApproved: boolean;
  allDocsApproved: boolean;
  allDocsSubmitted: boolean;
  imagesRemaining: number;
};

/** The post-save copy variants, unchanged from the original "Saved" alert. */
export function saveSummaryMessage({ isApproved, allDocsApproved, allDocsSubmitted, imagesRemaining }: SaveSummaryInput): string {
  const imagesComplete = imagesRemaining <= 0;
  if (isApproved) {
    return allDocsApproved
      ? "All documents and store photos are saved."
      : "Your changes have been saved. Newly added documents will be reviewed by our team.";
  }
  if (allDocsApproved && imagesComplete) return "All documents and store photos are saved.";
  if (allDocsSubmitted) {
    return imagesComplete
      ? "Your documents have been submitted. Our team will verify them before your shop goes live."
      : `Your documents have been submitted. Add ${imagesRemaining} more store photo${imagesRemaining !== 1 ? "s" : ""} to complete your gallery.`;
  }
  return "Upload the remaining documents to complete verification.";
}
