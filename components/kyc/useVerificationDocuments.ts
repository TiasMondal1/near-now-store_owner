/**
 * Document state + save/delete orchestration for the Documents screen:
 * server documents, typed numbers, staged files, the store photo gallery
 * (saved in the same pass), the per-document save loop (`saveAll`), delete,
 * and the "store sent back for re-verification" hand-off that follows an
 * approved document being edited or removed.
 *
 * Endpoints, validation, the SAVE_FAILED short-circuit, the suspension
 * timers and every piece of copy are unchanged from when this lived inside
 * app/upload-documents.tsx; the screen keeps the picker sheet, confirm
 * sheets, refs and JSX.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { motion } from "../../lib/theme";
import { clearStoreCache } from "../../lib/appCache";
import {
  deleteVerificationDocument,
  docNumberErrorMessage,
  fetchVerificationDocuments,
  saveVerificationDocument,
  validateDocNumber,
  type PickedDocFile,
  type VerificationDocument,
} from "../../lib/verificationDocuments";
import { useToast } from "../ui";
import {
  EMPTY_DOCS,
  EMPTY_NUMBERS,
  MAX_STORE_IMAGES,
  SECTION_BY_KEY,
  numberLengthError,
  saveSummaryMessage,
  type DocKey,
  type DocsState,
  type DocumentSection,
  type PendingFiles,
} from "./documentGroups";
import { useStoreImages, type StoreImagesState } from "./useStoreImages";

// Sentinel returned by saveOne when a save was attempted and failed (as
// opposed to "nothing changed" or "saved"), so saveAll can stop.
const SAVE_FAILED = Symbol("save-failed");

// Wait for a ConfirmSheet's exit animation (plus a frame or two) before
// presenting the next sheet — two RN Modals in one commit can fail on iOS.
const SHEET_HANDOFF_MS = motion.sheetOut + 50;

export type DocumentsSaveNotice = { message: string; readyForBilling: boolean };

export type UseVerificationDocumentsOptions = {
  token: string | null;
  storeId: string | null;
  isApproved: boolean;
  visibleSections: readonly DocumentSection[];
  /** Called when a post-save / post-remove gallery reload fails. */
  onReloadError?: () => void;
  /** Focus the number field that failed validation on save. */
  focusNumber?: (key: DocKey) => void;
  /** Runs after a successful save (e.g. scroll the notice into view). */
  onSaved?: () => void;
};

export type VerificationDocumentsState = {
  /** Store photos: saved + staged, with its own add / remove handlers. */
  gallery: StoreImagesState;
  serverDocs: DocsState;
  numbers: Record<DocKey, string>;
  numberErrors: Partial<Record<DocKey, string>>;
  pendingFiles: PendingFiles;
  /** Documents have been fetched successfully at least once. */
  docsLoaded: boolean;
  savingKey: DocKey | null;
  saving: boolean;
  saveNotice: DocumentsSaveNotice | null;
  /** The last save was the first-time full submission — the footer offers "Continue to billing". */
  continueToBilling: boolean;
  /** Label of the first visible number that fails its check, blocking Save. */
  invalidNumberLabel: string | null;
  setNumber: (key: DocKey, text: string) => void;
  stageFile: (key: DocKey, file: PickedDocFile) => void;
  unstageFile: (key: DocKey) => void;
  clearSaveNotice: () => void;
  dismissSaveNotice: () => void;
  /** GET documents + gallery together. Resolves true when both loaded. */
  load: (authToken: string, targetStoreId: string) => Promise<boolean>;
  /** Saves every visible document, then the staged photos. Errors are toasted. */
  saveAll: () => Promise<void>;
  /** DELETE one document. Throws so a ConfirmSheet can show the error inline. */
  deleteDocument: (key: DocKey) => Promise<void>;
  /** Call when the delete ConfirmSheet closes — opens the suspension notice if a delete triggered it. */
  afterDeleteSheetClosed: () => void;
  suspendedOpen: boolean;
  continueAfterSuspension: () => void;
};

export function useVerificationDocuments({
  token,
  storeId,
  isApproved,
  visibleSections,
  onReloadError,
  focusNumber,
  onSaved,
}: UseVerificationDocumentsOptions): VerificationDocumentsState {
  const toast = useToast();
  const [serverDocs, setServerDocs] = useState<DocsState>(EMPTY_DOCS);
  const [numbers, setNumbers] = useState<Record<DocKey, string>>(EMPTY_NUMBERS);
  const [numberErrors, setNumberErrors] = useState<Partial<Record<DocKey, string>>>({});
  const [pendingFiles, setPendingFiles] = useState<PendingFiles>({});
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<DocKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<DocumentsSaveNotice | null>(null);
  // Independent of the dismissible notice and cleared by any new edit.
  const [continueToBilling, setContinueToBilling] = useState(false);
  const [suspendedOpen, setSuspendedOpen] = useState(false);

  const mountedRef = useRef(true);
  const suspendedRef = useRef(false);
  // Set when a delete suspended the store; the suspension sheet opens once the
  // delete ConfirmSheet has finished dismissing (see afterDeleteSheetClosed).
  const suspendAfterCloseRef = useRef(false);
  const suspendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (suspendTimerRef.current) clearTimeout(suspendTimerRef.current);
    };
  }, []);

  const clearSaveNotice = useCallback(() => {
    setSaveNotice(null);
    setContinueToBilling(false);
  }, []);
  const dismissSaveNotice = useCallback(() => setSaveNotice(null), []);

  // Staging a photo clears a stale "Saved" notice exactly like staging a file.
  const gallery = useStoreImages({ storeId, max: MAX_STORE_IMAGES, onStaged: clearSaveNotice, onReloadError });

  // ── Loading ────────────────────────────────────────────────────────────────

  const loadDocuments = useCallback(async (authToken: string, targetStoreId: string) => {
    const docs = await fetchVerificationDocuments(authToken, targetStoreId);
    const next = EMPTY_DOCS();
    const nextNumbers: Partial<Record<DocKey, string>> = {};
    for (const doc of docs) {
      next[doc.doc_type] = doc;
      nextNumbers[doc.doc_type] = doc.number ?? "";
    }
    if (!mountedRef.current) return;
    setServerDocs(next);
    setNumbers((prev) => ({ ...prev, ...nextNumbers }));
    setDocsLoaded(true);
  }, []);

  /** Documents + gallery together; a failure is reported, never swallowed. */
  const loadGallery = gallery.load;
  const load = useCallback(
    async (authToken: string, targetStoreId: string): Promise<boolean> => {
      const results = await Promise.allSettled([loadDocuments(authToken, targetStoreId), loadGallery(targetStoreId)]);
      return results.every((r) => r.status === "fulfilled");
    },
    [loadDocuments, loadGallery]
  );

  // ── Edits ──────────────────────────────────────────────────────────────────

  const setNumber = useCallback(
    (key: DocKey, text: string) => {
      setNumbers((prev) => ({ ...prev, [key]: text }));
      setNumberErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
      clearSaveNotice();
    },
    [clearSaveNotice]
  );

  const stageFile = useCallback(
    (key: DocKey, file: PickedDocFile) => {
      setPendingFiles((prev) => ({ ...prev, [key]: file }));
      clearSaveNotice();
    },
    [clearSaveNotice]
  );

  const unstageFile = useCallback((key: DocKey) => {
    setPendingFiles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────

  // Save is blocked (with a hint) while any visible number is present but
  // fails its live length check or the format check from a previous attempt.
  const invalidNumberLabel = useMemo(() => {
    for (const section of visibleSections) {
      if (!section.hasNumber) continue;
      const value = numbers[section.key] ?? "";
      if (!value.trim()) continue;
      if (numberErrors[section.key] || numberLengthError(section.key, value)) return section.label;
    }
    return null;
  }, [visibleSections, numbers, numberErrors]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const showSuspendedNotice = () => {
    // The store cache has no idea is_approved just flipped server-side —
    // without clearing it the next screen's gate would read the stale store.
    clearStoreCache();
    setSuspendedOpen(true);
  };

  const continueAfterSuspension = () => {
    setSuspendedOpen(false);
    router.replace("/pending-verification");
  };

  const saveOne = async (key: DocKey): Promise<VerificationDocument | null | typeof SAVE_FAILED> => {
    if (!token || !storeId) return null;
    // Document numbers are case-insensitive for the shopkeeper but validated
    // case-sensitively server-side — normalise once and send what we validated.
    const number = numbers[key]?.trim().toUpperCase();
    const file = pendingFiles[key];
    const current = serverDocs[key];
    if (!file && (number ?? "") === (current?.number ?? "").toUpperCase()) return current; // nothing changed

    if (number && !validateDocNumber(key, number)) {
      setNumberErrors((prev) => ({ ...prev, [key]: docNumberErrorMessage(key) }));
      focusNumber?.(key);
      return SAVE_FAILED;
    }

    setSavingKey(key);
    try {
      const res = await saveVerificationDocument(token, storeId, key, { number: number || undefined, file });
      if (!res.ok) {
        toast.show({ message: `${SECTION_BY_KEY[key].label}: ${res.error}`, tone: "error" });
        return SAVE_FAILED;
      }
      // res.document has no signed url (only the GET computes it) — keep the
      // url already showing, or the just-picked local uri, so the preview
      // survives until the next full reload swaps in a real signed URL.
      const mergedDoc = { ...res.document, url: res.document.url ?? current?.url ?? file?.uri ?? null };
      setServerDocs((prev) => ({ ...prev, [key]: mergedDoc }));
      unstageFile(key);
      if (res.storeSuspended) suspendedRef.current = true;
      return mergedDoc;
    } finally {
      setSavingKey(null);
    }
  };

  const saveAll = async () => {
    if (invalidNumberLabel) return;
    setSaving(true);
    clearSaveNotice();
    suspendedRef.current = false;
    try {
      const results: Partial<Record<DocKey, VerificationDocument | null>> = {};
      for (const section of visibleSections) {
        const saved = await saveOne(section.key);
        // A failed save has already surfaced its own error; stop here rather
        // than continuing on to store photos and a misleading "Saved".
        if (saved === SAVE_FAILED) return;
        results[section.key] = saved;
      }
      if (suspendedRef.current) {
        showSuspendedNotice();
        return;
      }

      // gallery.images / gallery.pending are this render's values — compute
      // the post-save total from what *will* be true on success.
      const pendingCountBeforeSave = gallery.pending.length;
      const imagesOk = await gallery.saveAll();
      if (!imagesOk) return;

      const allDocsApproved = visibleSections.every((s) => results[s.key]?.status === "approved");
      const allDocsSubmitted = visibleSections.every((s) => !!results[s.key]?.url);
      const imagesRemaining = MAX_STORE_IMAGES - (gallery.images.length + pendingCountBeforeSave);
      // First-time full submission (not yet approved, all docs + photos in) is
      // the only case that advances the flow to Billing.
      const readyForBilling = !isApproved && allDocsSubmitted && imagesRemaining <= 0;

      setSaveNotice({ message: saveSummaryMessage({ isApproved, allDocsApproved, allDocsSubmitted, imagesRemaining }), readyForBilling });
      setContinueToBilling(readyForBilling);
      toast.show({ message: "Saved", tone: "success" });
      onSaved?.();
    } catch {
      toast.show({ message: "Couldn't save your documents. Try again.", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  /** Runs inside the ConfirmSheet — throws so the sheet shows the error inline. */
  const deleteDocument = async (key: DocKey) => {
    if (!token || !storeId) return;
    setSavingKey(key);
    try {
      const res = await deleteVerificationDocument(token, storeId, key);
      if (!res.ok) throw new Error(res.error);
      setServerDocs((prev) => ({ ...prev, [key]: null }));
      setNumbers((prev) => ({ ...prev, [key]: "" }));
      setNumberErrors((prev) => ({ ...prev, [key]: undefined }));
      unstageFile(key);
      toast.show({ message: `${SECTION_BY_KEY[key].label} removed`, tone: "success" });
      if (res.storeSuspended) {
        // Same side effect as showSuspendedNotice, but the sheet itself waits
        // for the ConfirmSheet to finish dismissing (see afterDeleteSheetClosed).
        clearStoreCache();
        suspendAfterCloseRef.current = true;
      }
    } finally {
      setSavingKey(null);
    }
  };

  const afterDeleteSheetClosed = () => {
    if (!suspendAfterCloseRef.current) return;
    suspendAfterCloseRef.current = false;
    if (suspendTimerRef.current) clearTimeout(suspendTimerRef.current);
    suspendTimerRef.current = setTimeout(() => {
      suspendTimerRef.current = null;
      if (mountedRef.current) setSuspendedOpen(true);
    }, SHEET_HANDOFF_MS);
  };

  return {
    gallery,
    serverDocs,
    numbers,
    numberErrors,
    pendingFiles,
    docsLoaded,
    savingKey,
    saving,
    saveNotice,
    continueToBilling,
    invalidNumberLabel,
    setNumber,
    stageFile,
    unstageFile,
    clearSaveNotice,
    dismissSaveNotice,
    load,
    saveAll,
    deleteDocument,
    afterDeleteSheetClosed,
    suspendedOpen,
    continueAfterSuspension,
  };
}

export default useVerificationDocuments;
