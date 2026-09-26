import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, iconSize, layout, motion, radius, shadows, spacing, typography } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";
import type { ActionSpec } from "./types";

// ─── Bottom offset store ──────────────────────────────────────────────────────
// The tab layout (app/(tabs)/_layout.tsx) calls `setToastBottomOffset(height)`
// with its bar height while the tab navigator is focused, and resets it to 0
// when a stack screen covers it or it unmounts. At 0 the host falls back to
// `insets.bottom`. `ToastProvider`'s `bottomOffset` prop overrides this store.

let bottomOffset = 0;
const offsetListeners = new Set<() => void>();

export function setToastBottomOffset(value: number): void {
  const next = Number.isFinite(value) && value > 0 ? value : 0;
  if (next === bottomOffset) return;
  bottomOffset = next;
  offsetListeners.forEach((l) => l());
}

export function getToastBottomOffset(): number {
  return bottomOffset;
}

function subscribeOffset(listener: () => void): () => void {
  offsetListeners.add(listener);
  return () => {
    offsetListeners.delete(listener);
  };
}

// ─── Toast singleton ──────────────────────────────────────────────────────────

export type ToastTone = "neutral" | "success" | "error";

export type ToastOptions = {
  message: string;
  tone?: ToastTone;
  action?: ActionSpec;
  /** Auto-dismiss after this many ms. Default 4000. Pass 0 to keep it until replaced/hidden. */
  duration?: number;
};

type ToastHandler = {
  show: (options: ToastOptions) => void;
  hide: () => void;
};

let mountedHandler: ToastHandler | null = null;
let pendingOptions: ToastOptions | null = null;

/**
 * Module-level toast API for non-component code (services, hooks outside the
 * tree). Calls made before a `ToastProvider` mounts are held and shown once
 * it does.
 */
export const toast = {
  show(options: ToastOptions): void {
    if (mountedHandler) mountedHandler.show(options);
    else pendingOptions = options;
  },
  hide(): void {
    pendingOptions = null;
    mountedHandler?.hide();
  },
};

// ─── Provider ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastHandler>(toast);

/** `const { show } = useToast(); show({ message: "Saved", tone: "success" });` */
export function useToast(): ToastHandler {
  return useContext(ToastContext);
}

type ActiveToast = ToastOptions & { id: number };

export type ToastProviderProps = {
  children: React.ReactNode;
  /**
   * Fixed distance (dp) between the window bottom and the toast, e.g. a
   * custom bar height. When set it overrides `setToastBottomOffset`; when
   * omitted the shared offset (or `insets.bottom`) is used.
   */
  bottomOffset?: number;
};

/**
 * Mount once in `app/_layout.tsx`. Renders a single bottom-anchored toast;
 * a new `show` replaces the current one.
 */
export function ToastProvider({ children, bottomOffset: bottomOffsetProp }: ToastProviderProps) {
  const [active, setActive] = useState<ActiveToast | null>(null);
  const idRef = useRef(0);

  const hide = useCallback(() => setActive(null), []);
  const show = useCallback((options: ToastOptions) => {
    idRef.current += 1;
    setActive({ ...options, id: idRef.current });
  }, []);

  const handler = useMemo<ToastHandler>(() => ({ show, hide }), [show, hide]);

  useEffect(() => {
    mountedHandler = handler;
    if (pendingOptions) {
      const p = pendingOptions;
      pendingOptions = null;
      handler.show(p);
    }
    return () => {
      if (mountedHandler === handler) mountedHandler = null;
    };
  }, [handler]);

  return (
    <ToastContext.Provider value={handler}>
      {children}
      <ToastHost active={active} onHide={hide} bottomOffset={bottomOffsetProp} />
    </ToastContext.Provider>
  );
}

// ─── Host ─────────────────────────────────────────────────────────────────────

const TOAST_ICON: Record<ToastTone, React.ComponentProps<typeof Ionicons>["name"] | null> = {
  neutral: null,
  success: "checkmark-circle-outline",
  error: "alert-circle-outline",
};

type ToastHostProps = {
  active: ActiveToast | null;
  onHide: () => void;
  bottomOffset?: number;
};

function ToastHost({ active, onHide, bottomOffset: bottomOffsetProp }: ToastHostProps) {
  const insets = useSafeAreaInsets();
  const { gutter, contentWidth, isWide } = useLayout();
  const sharedOffset = useSyncExternalStore(subscribeOffset, getToastBottomOffset, getToastBottomOffset);
  const offset = bottomOffsetProp != null && Number.isFinite(bottomOffsetProp) ? bottomOffsetProp : sharedOffset;

  // Keep the last toast rendered while it animates out.
  const [rendered, setRendered] = useState<ActiveToast | null>(active);
  const progress = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (active) {
      setRendered(active);
      progress.stopAnimation();
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.toastIn,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      const duration = active.duration ?? 4000;
      if (duration > 0) {
        timerRef.current = setTimeout(onHide, duration);
      }
      // `accessibilityLiveRegion` is Android-only and `role="alert"` does not
      // auto-announce on iOS, so VoiceOver needs an explicit announcement.
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility(
          active.action ? `${active.message}. ${active.action.label}` : active.message
        );
      }
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: motion.toastOut,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(null);
      });
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, onHide, progress]);

  if (!rendered) return null;

  const tone: ToastTone = rendered.tone ?? "neutral";
  const icon = TOAST_ICON[tone];
  const bottom = (offset > 0 ? offset : insets.bottom) + spacing.lg;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [spacing.xl, 0] });

  const handleAction = () => {
    rendered.action?.onPress();
    onHide();
  };

  return (
    <View style={[styles.host, { bottom, paddingHorizontal: gutter }]} pointerEvents="box-none">
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          tone === "error" ? styles.errorFill : styles.darkFill,
          isWide && { width: contentWidth, alignSelf: "center" },
          { opacity: progress, transform: [{ translateY }] },
        ]}
      >
        {icon ? <Ionicons name={icon} size={iconSize.md} color={colors.onPrimary} /> : null}
        <Text style={styles.message} numberOfLines={3}>
          {rendered.message}
        </Text>
        {rendered.action ? (
          <Pressable
            onPress={handleAction}
            hitSlop={spacing.sm}
            accessibilityRole="button"
            accessibilityLabel={rendered.action.label}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionLabel}>{rendered.action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: layout.touchTarget + spacing.sm,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.lg,
    ...shadows.md,
  },
  darkFill: { backgroundColor: colors.textPrimary },
  errorFill: { backgroundColor: colors.errorStrong },
  message: { ...typography.bodySmall, color: colors.onPrimary, flex: 1 },
  action: {
    minHeight: layout.touchTargetCompact - spacing.sm,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    borderRadius: radius.md,
  },
  actionPressed: { backgroundColor: colors.scrim },
  actionLabel: { ...typography.bodySmallStrong, color: colors.onPrimary },
});

export default ToastProvider;
