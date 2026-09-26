/**
 * Verification-hub (KYC) building blocks shared by app/upload-documents.tsx,
 * app/billing-info.tsx and app/pending-verification.tsx. Only what a screen
 * imports is exported here; folder-internal helpers stay in their own files.
 */
export { UploadDropzone, type UploadDropzoneProps, type UploadDropzoneState } from "./UploadDropzone";
export { PhotoGalleryGrid, type PhotoGalleryGridProps, type GalleryImage } from "./PhotoGalleryGrid";
export { DocumentCard, type DocumentCardProps, type DocumentMember, type DocumentNumberField, type DocumentStatus } from "./DocumentCard";
export { StorePhotosCard, type StorePhotosCardProps } from "./StorePhotosCard";
export { useDocFilePicker, type DocFilePickerHandlers } from "./useDocFilePicker";
export { type StoreImagesState } from "./useStoreImages";
export { usePassbookPicker, type PassbookPickerOptions, type PassbookPickerState } from "./usePassbookPicker";
export {
  useVerificationDocuments,
  type DocumentsSaveNotice,
  type UseVerificationDocumentsOptions,
  type VerificationDocumentsState,
} from "./useVerificationDocuments";
export { buildPickerOptions, type PickerOptionHandlers } from "./pickerOptions";
export {
  BILLING_FIELDS,
  CHANGE_FIELD_LABELS,
  accountNumberError,
  hasBillingChange,
  ifscCodeError,
  pendingBillingChangeLines,
  type PendingBillingChangeRequest,
} from "./billing";
export {
  EMPTY_DOCS,
  EMPTY_NUMBERS,
  MAX_STORE_IMAGES,
  ONBOARDING_GROUP_KEYS,
  SECTION_BY_KEY,
  computeGroupStatus,
  isOnboardingKey,
  numberFieldConfig,
  numberHelper,
  numberLengthError,
  saveSummaryMessage,
  visibleGroupsFor,
  visibleSectionsFor,
  type DocGroup,
  type DocKey,
  type DocsState,
  type DocumentSection,
  type PendingFiles,
} from "./documentGroups";
export { FORMATS_HINT, IMAGE_FORMATS_HINT, extFromMime, formatClock, requestCameraPermission } from "./media";
