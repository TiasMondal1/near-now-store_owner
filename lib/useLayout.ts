/**
 * Responsive layout helpers.
 *
 * `useLayout()` replaces module-scope `Dimensions.get(...)` reads: it re-renders
 * on rotation / window resize and gives every screen the same gutter and
 * content-column maths. `useBottomPadding()` gives the bottom padding for the
 * scroll content of a screen — tab-bar height + 24 inside a tab navigator,
 * `insets.bottom + 24` everywhere else.
 */
import { useContext, useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { layout } from "./theme";

export type Layout = {
  /** Window width in dp. */
  width: number;
  /** Window height in dp. */
  height: number;
  /** Horizontal screen gutter: 16 on phones, 24 at >= 600dp. */
  gutter: number;
  /** Width of the centred content column: min(width - 2 * gutter, 640). */
  contentWidth: number;
  /** Width >= 600dp — wide gutter and centred columns apply. */
  isWide: boolean;
  /** Shortest side >= 600dp — a tablet in any orientation. */
  isTablet: boolean;
};

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const isWide = width >= layout.wideBreakpoint;
    const gutter = isWide ? layout.gutterWide : layout.gutter;
    const contentWidth = Math.max(0, Math.min(width - 2 * gutter, layout.maxContentWidth));
    const isTablet = Math.min(width, height) >= layout.wideBreakpoint;
    return { width, height, gutter, contentWidth, isWide, isTablet };
  }, [width, height]);
}

/**
 * Bottom padding for scrolling content so the last row clears the tab bar
 * (inside a tab navigator) or the home indicator (stack screens).
 *
 * Reads `BottomTabBarHeightContext` directly (undefined outside a tab
 * navigator) rather than `useBottomTabBarHeight`, which throws there.
 */
export function useBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  if (tabBarHeight != null && tabBarHeight > 0) {
    return tabBarHeight + layout.scrollBottomPadding;
  }
  return insets.bottom + layout.scrollBottomPadding;
}
