import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { colors } from "../../lib/theme";
import { StateBase, type StateAction } from "./EmptyState";
import type { IoniconName } from "./types";

export type ErrorStateProps = {
  /** Default "Something went wrong". */
  title?: string;
  message?: string;
  /** Default "alert-circle-outline". */
  icon?: IoniconName;
  /**
   * Retry action. Label defaults to "Try again", variant to `secondary`.
   * Pass `loading` while the retry is in flight.
   */
  action?: Partial<StateAction> & { onPress: () => void };
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Failure state when nothing else can be shown. When cached content is
 * visible, use an `InlineNotice` (warning) with Retry instead.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  icon = "alert-circle-outline",
  action,
  compact,
  style,
  testID,
}: ErrorStateProps) {
  return (
    <StateBase
      title={title}
      message={message}
      icon={icon}
      compact={compact}
      style={style}
      testID={testID}
      circleColor={colors.errorBg}
      iconColor={colors.errorText}
      defaultVariant="secondary"
      action={
        action
          ? {
              label: action.label ?? "Try again",
              onPress: action.onPress,
              variant: action.variant ?? "secondary",
              loading: action.loading,
            }
          : undefined
      }
    />
  );
}

export default ErrorState;
