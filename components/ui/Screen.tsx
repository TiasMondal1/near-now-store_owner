import React from "react";
import { KeyboardAvoidingView, Platform, StyleProp, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { colors } from "../../lib/theme";

export type ScreenProps = {
  children: React.ReactNode;
  /** Safe-area edges to pad. Defaults to `["top"]`; add `"bottom"` on screens without a tab bar or sticky footer. */
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
  /** Wraps children in a `KeyboardAvoidingView` (iOS `padding` behaviour). */
  keyboardAvoiding?: boolean;
};

const DEFAULT_EDGES: readonly Edge[] = ["top"];

/**
 * Root container for every screen: safe-area aware, `colors.background`.
 * Screens place a `TopBar` / `ScreenHeader` and their scroll view inside.
 */
export function Screen({ children, edges = DEFAULT_EDGES, style, keyboardAvoiding = false }: ScreenProps) {
  const content = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  ) : (
    children
  );
  return (
    <SafeAreaView edges={edges} style={[styles.root, style]}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
});

export default Screen;
