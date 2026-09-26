/**
 * Near & Now Store Owner — UI kit.
 *
 * Import components from here, tokens from `lib/theme`:
 *   import { Screen, TopBar, Button } from "../components/ui";
 *   import { colors, spacing } from "../lib/theme";
 *
 * See components/ui/README.md for every component's props and usage.
 */

// Shared types
export type { IoniconName, ActionSpec } from "./types";

// Layout
export { Screen, type ScreenProps } from "./Screen";
export { TopBar, type TopBarProps } from "./TopBar";
export { ScreenHeader, type ScreenHeaderProps } from "./ScreenHeader";
export { Section, SectionHeader, type SectionProps, type SectionHeaderProps, type SectionHeaderVariant } from "./Section";
export { Card, type CardProps } from "./Card";
export { Divider, type DividerProps } from "./Divider";
export { StickyFooter, type StickyFooterProps } from "./StickyFooter";

// Actions
export { Button, triggerHaptic, type ButtonProps, type ButtonVariant, type ButtonSize, type ButtonHaptic } from "./Button";
export { IconButton, type IconButtonProps, type IconButtonVariant } from "./IconButton";
export { Chip, type ChipProps } from "./Chip";
export { SegmentedControl, type SegmentedControlProps, type SegmentItem } from "./SegmentedControl";

// Data display
export { ListRow, type ListRowProps, type ListRowLeadingSize } from "./ListRow";
export { KeyValueRow, type KeyValueRowProps } from "./KeyValueRow";
export { Badge, type BadgeProps } from "./Badge";
export { CountBadge, type CountBadgeProps } from "./CountBadge";
export { InlineNotice, type InlineNoticeProps, type InlineNoticeTone } from "./InlineNotice";
export {
  Skeleton,
  type SkeletonBoxProps,
  type SkeletonTextProps,
  type SkeletonListRowProps,
  type SkeletonChipsProps,
  type SkeletonCardProps,
} from "./Skeleton";
export { EmptyState, type EmptyStateProps, type StateAction } from "./EmptyState";
export { ErrorState, type ErrorStateProps } from "./ErrorState";
export { Stepper, type StepperProps, type Step, type StepState } from "./Stepper";
export { ProgressBar, type ProgressBarProps } from "./ProgressBar";

// Inputs
export { TextField, type TextFieldProps } from "./TextField";
export { SearchField, type SearchFieldProps } from "./SearchField";
export { OtpInput, type OtpInputProps, type OtpInputHandle } from "./OtpInput";
export { Switch, type SwitchProps } from "./Switch";
export { Checkbox, type CheckboxProps } from "./Checkbox";

// Overlays
export { BottomSheet, type BottomSheetProps } from "./BottomSheet";
export { ConfirmSheet, type ConfirmSheetProps } from "./ConfirmSheet";
export { ActionSheet, type ActionSheetProps, type ActionSheetOption } from "./ActionSheet";
export { NoticeSheet, type NoticeSheetProps } from "./NoticeSheet";
export {
  ToastProvider,
  useToast,
  toast,
  setToastBottomOffset,
  getToastBottomOffset,
  type ToastProviderProps,
  type ToastOptions,
  type ToastTone,
} from "./Toast";
