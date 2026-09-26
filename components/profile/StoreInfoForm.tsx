/**
 * "Store information" card. View mode = `KeyValueRow`s; edit mode =
 * `TextField`s. The pending-review notice and any
 * submit error render inside the card, next to the fields they describe.
 */
import React, { useRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Card, InlineNotice, KeyValueRow, TextField } from "../ui";
import { spacing } from "../../lib/theme";

export type StoreInfoField = "name" | "address" | "phone";
export type StoreInfoValues = Record<StoreInfoField, string>;

/**
 * Helper shown under a field the owner cleared. Matches the save contract:
 * an emptied field is dropped from the change request rather than blocking
 * it, so the form says so instead of inventing a validation rule.
 */
const BLANK_FIELD_HELPER = "Left blank — this field won’t be changed";

function blankFieldHelper(values: StoreInfoValues, committed: StoreInfoValues, field: StoreInfoField): string | undefined {
  const cleared = !values[field].trim() && (committed[field] ?? "").trim().length > 0;
  return cleared ? BLANK_FIELD_HELPER : undefined;
}

export type StoreInfoFormProps = {
  editing: boolean;
  values: StoreInfoValues;
  /** Committed store values — drives the "left blank" helper on cleared fields. */
  committed: StoreInfoValues;
  onChange: (field: StoreInfoField, value: string) => void;
  deliveryRadiusKm?: number | null;
  /** Pending-review notice rendered above the fields. */
  notice?: React.ReactNode;
  /** Submit error shown inline (error `InlineNotice`). */
  formError?: string | null;
  disabled?: boolean;
};

const NOT_PROVIDED = "Not provided";

export function StoreInfoForm({
  editing,
  values,
  committed,
  onChange,
  deliveryRadiusKm,
  notice,
  formError,
  disabled = false,
}: StoreInfoFormProps) {
  // Return-key chaining only (name → address).
  const addressRef = useRef<TextInput>(null);

  const hasRadius = deliveryRadiusKm != null;

  return (
    <Card title="Store information">
      <View style={styles.body}>
        {notice}
        {formError ? <InlineNotice tone="error" title="Couldn't save changes" message={formError} /> : null}
        {editing ? (
          <View style={styles.fields}>
            <TextField
              label="Store name"
              value={values.name}
              onChangeText={(t) => onChange("name", t)}
              helper={blankFieldHelper(values, committed, "name")}
              placeholder="Your store name"
              autoCapitalize="sentences"
              returnKeyType="next"
              onSubmitEditing={() => addressRef.current?.focus()}
              blurOnSubmit={false}
              disabled={disabled}
            />
            <TextField
              ref={addressRef}
              label="Address"
              value={values.address}
              onChangeText={(t) => onChange("address", t)}
              helper={blankFieldHelper(values, committed, "address")}
              placeholder="Store address"
              autoCapitalize="sentences"
              multiline
              disabled={disabled}
            />
            <TextField
              label="Contact phone"
              value={values.phone}
              onChangeText={(t) => onChange("phone", t)}
              helper={blankFieldHelper(values, committed, "phone")}
              placeholder="Store contact number"
              keyboardType="phone-pad"
              returnKeyType="done"
              disabled={disabled}
            />
            {hasRadius ? <KeyValueRow label="Delivery radius" value={`${deliveryRadiusKm} km`} /> : null}
          </View>
        ) : (
          <View>
            <KeyValueRow label="Store name" value={values.name || NOT_PROVIDED} showSeparator />
            <KeyValueRow label="Address" value={values.address || NOT_PROVIDED} showSeparator />
            <KeyValueRow label="Contact phone" value={values.phone || NOT_PROVIDED} showSeparator={hasRadius} />
            {hasRadius ? <KeyValueRow label="Delivery radius" value={`${deliveryRadiusKm} km`} /> : null}
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  fields: { gap: spacing.md },
});

export default StoreInfoForm;
