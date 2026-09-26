import React, { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "../../lib/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { ListRow } from "./ListRow";
import type { IoniconName } from "./types";

export type ActionSheetOption = {
  key: string;
  label: string;
  description?: string;
  icon?: IoniconName;
  /** Renders in errorText. */
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export type ActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: readonly ActionSheetOption[];
  /** Text button under the options. Default "Cancel"; pass `null` to hide. */
  cancelLabel?: string | null;
  testID?: string;
};

/**
 * A list of choices in a `BottomSheet` ("Take photo / Choose from gallery /
 * Remove"). Selecting an option closes the sheet and runs its handler once
 * the sheet's `Modal` has fully dismissed, so the handler may safely open
 * another sheet or a native picker.
 */
export function ActionSheet({ visible, onClose, title, options, cancelLabel = "Cancel", testID }: ActionSheetProps) {
  const pendingRef = useRef<(() => void) | null>(null);

  const handleClosed = useCallback(() => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    fn?.();
  }, []);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={handleClosed}
      title={title}
      scrollable={options.length > 6}
      testID={testID}
    >
      <View>
        {options.map((opt, i) => (
          <ListRow
            key={opt.key}
            inset
            icon={opt.icon}
            title={opt.label}
            description={opt.description}
            destructive={opt.destructive}
            disabled={opt.disabled}
            showSeparator={i < options.length - 1}
            onPress={() => {
              pendingRef.current = opt.onPress;
              onClose();
            }}
          />
        ))}
      </View>
      {cancelLabel ? (
        <View style={styles.cancel}>
          <Button
            label={cancelLabel}
            onPress={() => {
              pendingRef.current = null;
              onClose();
            }}
            variant="text"
            size="md"
            fullWidth
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  cancel: { marginTop: spacing.sm },
});

export default ActionSheet;
