import React, { useCallback } from "react";
import { Switch as RNSwitch, StyleProp, ViewStyle } from "react-native";
import { colors, layout } from "../../lib/theme";
import { triggerHaptic } from "./Button";

export type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Required — switches have no visible label of their own. */
  accessibilityLabel: string;
  disabled?: boolean;
  /** Light haptic on toggle. Default true. */
  haptic?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * RN `Switch` with token track colours and a required label.
 */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  haptic = true,
  accessibilityHint,
  style,
  testID,
}: SwitchProps) {
  const handleChange = useCallback(
    (next: boolean) => {
      if (haptic) void triggerHaptic("light");
      onValueChange(next);
    },
    [haptic, onValueChange]
  );

  return (
    <RNSwitch
      value={value}
      onValueChange={handleChange}
      disabled={disabled}
      trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor={colors.onPrimary}
      ios_backgroundColor={colors.border}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
      style={[disabled && { opacity: layout.disabledOpacity }, style]}
      testID={testID}
    />
  );
}

export default Switch;
