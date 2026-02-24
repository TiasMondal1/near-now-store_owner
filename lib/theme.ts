/**
 * UI theme matching near_and_now_app (Blinkit-style light theme).
 * Use these across the store owner app for a consistent, non-dark look.
 */

export const colors = {
  primary: "#0C831F",
  secondary: "#0A6B1A",
  accent: "#10b981",
  primaryLight: "#34d399",
  primaryDark: "#065f46",

  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",

  background: "#F9FAFB",
  surface: "#FFFFFF",
  surfaceVariant: "#F3F4F6",

  textPrimary: "#111827",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  textDisabled: "#D1D5DB",

  border: "#E5E7EB",
  borderLight: "#F3F4F6",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;
