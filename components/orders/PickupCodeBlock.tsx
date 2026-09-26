import React from "react";
import { StyleSheet, Text } from "react-native";
import { colors } from "../../lib/theme";
import { InfoBlock } from "./InfoBlock";

export type PickupCodeBlockProps = {
  code: string;
  /** Default "Pickup Code". */
  label?: string;
  /** Default "Show this code to the delivery partner". */
  hint?: string;
  testID?: string;
};

/**
 * The pickup code in the pre-redesign style — 22/900 primary with 6dp
 * tracking on the tinted InfoBlock band, key icon in the 32dp square and the
 * "show this to the delivery partner" hint beside it.
 */
export function PickupCodeBlock({
  code,
  label = "Pickup Code",
  hint = "Show this code to the delivery partner",
  testID,
}: PickupCodeBlockProps) {
  const spoken = code.split("").join(" ");
  return (
    <InfoBlock icon="key-outline" label={label} hint={hint} accessibilityLabel={`${label}: ${spoken}. ${hint}`} testID={testID}>
      <Text style={styles.code} selectable>
        {code}
      </Text>
    </InfoBlock>
  );
}

const styles = StyleSheet.create({
  code: { color: colors.primary, fontSize: 22, fontWeight: "900", letterSpacing: 6 },
});

export default PickupCodeBlock;
