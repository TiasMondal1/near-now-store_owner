import React, { useEffect } from "react";
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { colors, layout, motion, radius, spacing } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";

// ─── Shared pulse ─────────────────────────────────────────────────────────────
// One module-level Animated.Value drives every visible box so a screen of
// skeletons pulses in sync and runs a single native loop. The loop starts
// with the first mounted box and stops with the last (refcounted).

const pulse = new Animated.Value(1);
let pulseLoop: Animated.CompositeAnimation | null = null;
let pulseRefs = 0;

function retainPulse(): () => void {
  pulseRefs += 1;
  if (pulseRefs === 1) {
    pulse.setValue(1);
    pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: motion.skeletonPulse / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: motion.skeletonPulse / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
  }
  return () => {
    pulseRefs -= 1;
    if (pulseRefs === 0) {
      pulseLoop?.stop();
      pulseLoop = null;
    }
  };
}

function usePulse(): Animated.Value {
  useEffect(retainPulse, []);
  return pulse;
}

export type SkeletonBoxProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

type RawBoxProps = SkeletonBoxProps & {
  /** True inside a composite skeleton that already announces "Loading" once. */
  hidden?: boolean;
};

function RawBox({ width = "100%", height = spacing.lg, radius: r = radius.md, style, hidden = false }: RawBoxProps) {
  const opacity = usePulse();
  return (
    <Animated.View
      accessible={!hidden}
      accessibilityLabel={hidden ? undefined : "Loading"}
      accessibilityRole={hidden ? undefined : "progressbar"}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={[styles.box, { width, height, borderRadius: r, opacity }, style]}
    />
  );
}

/** A single pulsing block; announces "Loading" on its own. */
function Box(props: SkeletonBoxProps) {
  return <RawBox {...props} />;
}

export type SkeletonTextProps = {
  /** Number of lines. Default 2. The last line is shorter. */
  lines?: number;
  width?: number | `${number}%`;
  /** Line height in dp. Default 14. */
  lineHeight?: number;
  style?: StyleProp<ViewStyle>;
};

/** Paragraph placeholder. */
function TextLines({ lines = 2, width = "100%", lineHeight = 14, style }: SkeletonTextProps) {
  const count = Math.max(1, lines);
  return (
    <View style={[styles.textWrap, { width }, style]} accessibilityLabel="Loading" accessibilityRole="progressbar" accessible>
      {Array.from({ length: count }).map((_, i) => (
        <RawBox
          key={i}
          hidden
          height={lineHeight}
          radius={radius.md / 2}
          width={i === count - 1 && count > 1 ? "60%" : "100%"}
        />
      ))}
    </View>
  );
}

export type SkeletonListRowProps = {
  /** Rows to render. Default 3. */
  count?: number;
  /** Zero horizontal padding (inside a padded Card). */
  inset?: boolean;
  /** Show the leading 40dp tile. Default true. */
  leading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Placeholder rows shaped like `ListRow`. */
function ListRowSkeleton({ count = 3, inset = false, leading = true, style }: SkeletonListRowProps) {
  const { gutter } = useLayout();
  return (
    <View style={style} accessibilityLabel="Loading" accessibilityRole="progressbar" accessible>
      {Array.from({ length: Math.max(1, count) }).map((_, i) => (
        <View key={i} style={[styles.row, { paddingHorizontal: inset ? 0 : gutter }]}>
          {leading ? <RawBox hidden width={layout.listRowLeadingSlot} height={layout.listRowLeadingSlot} /> : null}
          <View style={styles.rowText}>
            <RawBox hidden height={14} radius={radius.md / 2} width="55%" />
            <RawBox hidden height={12} radius={radius.md / 2} width="80%" />
          </View>
          <RawBox hidden width={spacing.xxxl} height={spacing.lg} radius={radius.full} />
        </View>
      ))}
    </View>
  );
}

export type SkeletonChipsProps = {
  /** Pills to render. Default 3. */
  count?: number;
  style?: StyleProp<ViewStyle>;
};

// Widths cycle so a chip row does not look like a ruler.
const CHIP_WIDTHS = [72, 96, 64, 88] as const;

/** Placeholder row of small `Chip`s (36dp pills). Announces "Loading" once. */
function ChipsSkeleton({ count = 3, style }: SkeletonChipsProps) {
  return (
    <View style={[styles.chips, style]} accessibilityLabel="Loading" accessibilityRole="progressbar" accessible>
      {Array.from({ length: Math.max(1, count) }).map((_, i) => (
        <RawBox key={i} hidden width={CHIP_WIDTHS[i % CHIP_WIDTHS.length]} height={layout.chipHeightSm} radius={radius.full} />
      ))}
    </View>
  );
}

export type SkeletonCardProps = {
  /** Body lines under the title. Default 2. */
  lines?: number;
  /** Show a title line. Default true. */
  title?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Placeholder shaped like a padded `Card`. */
function CardSkeleton({ lines = 2, title = true, style }: SkeletonCardProps) {
  return (
    <View style={[styles.card, style]} accessibilityLabel="Loading" accessibilityRole="progressbar" accessible>
      {title ? <RawBox hidden height={18} width="45%" radius={radius.md / 2} /> : null}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <TextLines lines={lines} />
      </View>
    </View>
  );
}

/**
 * Loading placeholders. Use shapes that match the real rows so the layout
 * does not jump when data lands.
 *
 *   <Skeleton.ListRow count={5} />
 *   <Skeleton.Chips count={4} />
 *   <Skeleton.Card lines={3} />
 *   <Skeleton.Text lines={2} />
 *   <Skeleton.Box width={120} height={20} />
 */
export const Skeleton = {
  Box,
  Text: TextLines,
  ListRow: ListRowSkeleton,
  Chips: ChipsSkeleton,
  Card: CardSkeleton,
};

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surfaceVariant, borderWidth: 1, borderColor: colors.borderLight },
  textWrap: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: layout.listRowMinHeight,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowText: { flex: 1, gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
});

export default Skeleton;
