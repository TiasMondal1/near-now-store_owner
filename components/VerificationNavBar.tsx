import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "../lib/theme";

type TabKey = "details" | "status" | "documents";

const TABS: {
  key: TabKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  route: "/store-owner-signup" | "/pending-verification" | "/upload-documents";
}[] = [
  { key: "details", label: "Details", icon: "person-outline", route: "/store-owner-signup" },
  { key: "status", label: "Status", icon: "hourglass-outline", route: "/pending-verification" },
  { key: "documents", label: "Documents", icon: "document-text-outline", route: "/upload-documents" },
];

/**
 * Lets a shopkeeper who has completed signup (but isn't yet verified) freely
 * jump between their submitted details, verification status, and document
 * uploads — mirrors the rider app's own VerificationNavBar exactly. Only
 * rendered post-signup; the pre-signup form itself never shows it.
 */
export default function VerificationNavBar({ active }: { active: TabKey }) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => {
              if (!isActive) router.replace(tab.route);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name={tab.icon} size={16} color={isActive ? colors.primary : colors.textTertiary} />
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  tabActive: { backgroundColor: colors.primaryBg },
  tabText: { fontSize: 12, fontWeight: "600", color: colors.textTertiary },
  tabTextActive: { color: colors.primary },
});
