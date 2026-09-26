import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { errorHandler, wrapRootComponent } from "../lib/error-handler";
import { useReviewOutcomeGate } from "../lib/useReviewOutcomeGate";
import ReviewOutcomeModal from "../components/ReviewOutcomeModal";
import { ErrorState, ToastProvider } from "../components/ui";
import { colors, layout, spacing } from "../lib/theme";

// ─── Crash/error monitoring (Sentry) ──────────────────────────────────────────
// Safe no-op when EXPO_PUBLIC_SENTRY_DSN is not configured.
errorHandler.initializeErrorMonitoring();

// ─── Global unhandled rejection / error handler ───────────────────────────────
// Note: errorHandler (imported above) already installs a global handler that
// reports to Sentry via logError(); this one only adds a dev console log.
if (typeof ErrorUtils !== "undefined") {
  const prevHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    if (__DEV__) console.error("[GlobalError]", isFatal ? "FATAL" : "non-fatal", error);
    prevHandler?.(error, isFatal);
  });
}

// ─── Error Boundary ──────────────────────────────────────────────────────────
type BoundaryState = { hasError: boolean; message: string };

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message: message || "Unknown error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorRoot}>
          <ScrollView contentContainerStyle={styles.errorScroll} bounces={false}>
            <View style={styles.errorColumn}>
              <ErrorState
                title="Something went wrong"
                message={this.state.message}
                action={{ label: "Try again", onPress: this.reset }}
              />
            </View>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorRoot: { flex: 1, backgroundColor: colors.background },
  errorScroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: layout.gutter, paddingVertical: spacing.xxl },
  errorColumn: { width: "100%", maxWidth: layout.maxFormWidth, alignSelf: "center" },
});

function RootLayout() {
  // Mounted once above the whole Stack (not inside a single screen) so a
  // profile-change outcome is surfaced no matter which tab/screen the
  // shopkeeper happens to be on when the admin reviews it — a screen-local
  // banner would only ever be seen if they happened to be on that screen.
  const { outcome, dismiss } = useReviewOutcomeGate();

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ToastProvider>
          <Stack
            screenOptions={({ route }) => ({
              headerShown: false,
              animation: "default",
              // Logged-in main shell: do not swipe back into landing/login
              gestureEnabled: route.name !== "(tabs)",
            })}
          />
          <ReviewOutcomeModal outcome={outcome} onDismiss={dismiss} />
        </ToastProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// Wrapped with Sentry (no-op when no DSN configured).
export default wrapRootComponent(RootLayout);
