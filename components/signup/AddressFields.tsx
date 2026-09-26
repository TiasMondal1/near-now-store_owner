/**
 * The six address inputs of the store-details form with return-key chaining.
 * Presentation only — values and validation live in the screen. The forwarded
 * ref points at the first field so the previous input can chain into it.
 */
import React, { forwardRef, useRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { TextField } from "../ui";
import { spacing } from "../../lib/theme";

export type AddressValues = {
  house: string;
  street: string;
  area: string;
  city: string;
  stateName: string;
  postalCode: string;
};

export const EMPTY_ADDRESS: AddressValues = {
  house: "",
  street: "",
  area: "",
  city: "",
  stateName: "",
  postalCode: "",
};

export type AddressFieldsProps = {
  values: AddressValues;
  onChange: (key: keyof AddressValues, value: string) => void;
  /** City and State share a row when the form is wide enough. */
  twoColumn: boolean;
};

export const AddressFields = forwardRef<TextInput, AddressFieldsProps>(function AddressFields(
  { values, onChange, twoColumn },
  houseRef
) {
  const streetRef = useRef<TextInput>(null);
  const areaRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const stateRef = useRef<TextInput>(null);
  const postalRef = useRef<TextInput>(null);

  const cityField = (
    <TextField
      ref={cityRef}
      containerStyle={twoColumn ? styles.half : undefined}
      label="City"
      value={values.city}
      onChangeText={(v) => onChange("city", v)}
      placeholder="City"
      returnKeyType="next"
      onSubmitEditing={() => stateRef.current?.focus()}
      blurOnSubmit={false}
    />
  );
  const stateField = (
    <TextField
      ref={stateRef}
      containerStyle={twoColumn ? styles.half : undefined}
      label="State"
      value={values.stateName}
      onChangeText={(v) => onChange("stateName", v)}
      placeholder="State"
      returnKeyType="next"
      onSubmitEditing={() => postalRef.current?.focus()}
      blurOnSubmit={false}
    />
  );

  return (
    <>
      <TextField
        ref={houseRef}
        label="Shop / House no."
        value={values.house}
        onChangeText={(v) => onChange("house", v)}
        placeholder="Shop no."
        returnKeyType="next"
        onSubmitEditing={() => streetRef.current?.focus()}
        blurOnSubmit={false}
      />
      <TextField
        ref={streetRef}
        label="Street"
        value={values.street}
        onChangeText={(v) => onChange("street", v)}
        placeholder="Street / road"
        returnKeyType="next"
        onSubmitEditing={() => areaRef.current?.focus()}
        blurOnSubmit={false}
      />
      <TextField
        ref={areaRef}
        label="Area / Locality"
        value={values.area}
        onChangeText={(v) => onChange("area", v)}
        placeholder="Area / locality"
        returnKeyType="next"
        onSubmitEditing={() => cityRef.current?.focus()}
        blurOnSubmit={false}
      />
      {twoColumn ? (
        <View style={styles.row}>
          {cityField}
          {stateField}
        </View>
      ) : (
        <>
          {cityField}
          {stateField}
        </>
      )}
      <TextField
        ref={postalRef}
        label="PIN code"
        value={values.postalCode}
        onChangeText={(v) => onChange("postalCode", v)}
        placeholder="PIN code"
        keyboardType="number-pad"
        returnKeyType="done"
      />
    </>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});

export default AddressFields;
