import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, layout, motion, radius, shadows, spacing, typography } from "../../lib/theme";

export type BottomSheetProps = {
  visible: boolean;
  /** Called on backdrop tap, Android back, or a child asking to close. */
  onClose: () => void;
  /**
   * Fires once the exit animation has finished and the `Modal` has unmounted.
   * Open the next sheet / native picker here rather than in `onClose`, or it
   * presents over the still-visible modal.
   */
  onClosed?: () => void;
  /** While true the sheet cannot be dismissed (request in flight). */
  busy?: boolean;
  /** 18/600 heading with 12 below. */
  title?: string;
  children: React.ReactNode;
  /** Wraps children in a `ScrollView` capped at 85% of the window. */
  scrollable?: boolean;
  accessibilityLabel?: string;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shared animated sheet: scrim, surface body with `radius.xl` top corners,
 * handle, slide 260ms in / 200ms out on the native driver. Dismisses on
 * backdrop tap and hardware back unless `busy`. Rendered in a `Modal`, so the
 * OS back button arrives through `onRequestClose`.
 */
export function BottomSheet({
  visible,
  onClose,
  onClosed,
  busy = false,
  title,
  children,
  scrollable = false,
  accessibilityLabel,
  contentStyle,
  testID,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const closedPendingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      closedPendingRef.current = false;
      setMounted(true);
      progress.stopAnimation();
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.sheetIn,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      progress.stopAnimation();
      Animated.timing(progress, {
        toValue: 0,
        duration: motion.sheetOut,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          closedPendingRef.current = true;
          setMounted(false);
        }
      });
    }
  }, [visible, progress]);

  // Runs after the commit that removed the Modal, so `onClosed` handlers can
  // present another modal without stacking on this one.
  useEffect(() => {
    if (mounted || !closedPendingRef.current) return;
    closedPendingRef.current = false;
    onClosedRef.current?.();
  }, [mounted]);

  const requestClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] });
  const bottomPad = Math.max(insets.bottom, spacing.lg) + spacing.md;

  const body = scrollable ? (
    <ScrollView
      style={{ maxHeight: windowHeight * 0.85 - bottomPad }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
      testID={testID}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={styles.flex}
            onPress={requestClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityState={{ disabled: busy }}
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={styles.flexEnd}
        >
          <Animated.View
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel ?? title}
            style={[
              styles.sheet,
              { paddingBottom: bottomPad, maxHeight: windowHeight * 0.92, transform: [{ translateY }] },
            ]}
          >
            <View style={styles.handle} />
            {title ? (
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            <View style={[styles.content, contentStyle]}>{body}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  flex: { flex: 1 },
  flexEnd: { justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadows.md,
  },
  handle: {
    alignSelf: "center",
    width: layout.sheetHandleWidth,
    height: layout.sheetHandleHeight,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.md },
  content: {},
});

export default BottomSheet;
