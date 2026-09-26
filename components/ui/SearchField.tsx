import React, { forwardRef, useCallback } from "react";
import type { TextInput } from "react-native";
import { TextField, type TextFieldProps } from "./TextField";

export type SearchFieldProps = Omit<
  TextFieldProps,
  "leftIcon" | "rightIcon" | "onRightIconPress" | "value" | "onChangeText" | "returnKeyType"
> & {
  value: string;
  onChangeText: (text: string) => void;
  /** Called after the clear button empties the field. */
  onClear?: () => void;
};

/**
 * `TextField` preset for search: leading search icon, clear button when
 * non-empty, `returnKeyType="search"`. Controlled only.
 */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, onClear, placeholder = "Search", accessibilityLabel = "Search", autoFocus, ...rest },
  ref
) {
  const clear = useCallback(() => {
    onChangeText("");
    onClear?.();
  }, [onChangeText, onClear]);

  return (
    <TextField
      ref={ref}
      {...rest}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      accessibilityLabel={accessibilityLabel}
      autoFocus={autoFocus}
      leftIcon="search-outline"
      rightIcon={value.length > 0 ? "close-circle-outline" : undefined}
      onRightIconPress={value.length > 0 ? clear : undefined}
      rightIconAccessibilityLabel="Clear search"
      returnKeyType="search"
      autoCorrect={rest.autoCorrect ?? false}
      autoCapitalize={rest.autoCapitalize ?? "none"}
      clearButtonMode="never"
    />
  );
});

export default SearchField;
