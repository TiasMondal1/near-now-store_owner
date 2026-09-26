import type React from "react";
import type { Ionicons } from "@expo/vector-icons";

/** Any Ionicons glyph name. Use the `-outline` family everywhere except tab icons and Badge glyphs. */
export type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/** A small labelled action, used by notices, empty states and section headers. */
export type ActionSpec = {
  label: string;
  onPress: () => void;
};
