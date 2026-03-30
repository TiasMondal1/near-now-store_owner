import React from "react";
import { Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

// ─── Global unhandled rejection / error handler ───────────────────────────────
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
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: any): BoundaryState {
    return {
      hasError: true,
      message: error?.message ?? String(error) ?? "Unknown error",
    };
  }

  componentDidCatch(error: any, info: any) {
    if (__DEV__) console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{this.state.message}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => this.setState({ hasError: false, message: "" })}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ef4444",
    marginBottom: 12,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <Stack
          screenOptions={({ route }) => ({
            headerShown: false,
            animation: "default",
            // Logged-in main shell: do not swipe back into landing/login
            gestureEnabled: route.name !== "(tabs)",
          })}
        />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
