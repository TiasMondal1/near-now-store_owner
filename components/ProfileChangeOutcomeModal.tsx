import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../lib/theme";
import { ProfileChangeOutcome } from "../lib/useProfileChangeOutcomeGate";

interface Props {
  outcome: ProfileChangeOutcome | null;
  onDismiss: () => void;
}

/**
 * Blocking acknowledgment for a reviewed profile-change request. No backdrop
 * dismiss and a no-op `onRequestClose` (Android back button) — the whole
 * point is the shopkeeper can't just swipe/back past it without tapping
 * "Got it," per explicit requirement that they see this before doing
 * anything else in the app.
 */
export default function ProfileChangeOutcomeModal({ outcome, onDismiss }: Props) {
  if (!outcome) return null;

  const approved = outcome.approved;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={st.overlay}>
        <View style={st.card}>
          <View style={[st.iconWrap, { backgroundColor: approved ? colors.success + "18" : colors.error + "18" }]}>
            <Ionicons
              name={approved ? "checkmark-circle" : "close-circle"}
              size={44}
              color={approved ? colors.success : colors.error}
            />
          </View>
          <Text style={st.title}>{approved ? "Profile Change Approved" : "Profile Change Rejected"}</Text>
          <Text style={st.body}>
            {approved
              ? "Your requested store profile changes have been approved and are now live."
              : `Your requested changes were rejected${outcome.rejectionReason ? `: ${outcome.rejectionReason}` : "."}`}
          </Text>
          <TouchableOpacity style={st.btn} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={st.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  btn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  btnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
