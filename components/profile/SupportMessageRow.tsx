/**
 * One support message the owner sent: body, date, an Open/Resolved badge and,
 * once it arrives, the support team's reply as a quoted block (left rule).
 * The parent owns separators (`Divider` between rows).
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge } from "../ui";
import { colors, spacing, typography } from "../../lib/theme";
import { useLayout } from "../../lib/useLayout";

export type SupportMessage = {
  id: string;
  message: string;
  status: "open" | "resolved";
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
};

export type SupportMessageRowProps = {
  item: SupportMessage;
};

export function SupportMessageRow({ item }: SupportMessageRowProps) {
  const { gutter } = useLayout();
  const sent = new Date(item.created_at).toLocaleDateString("en-IN");
  return (
    <View style={[styles.row, { paddingHorizontal: gutter }]}>
      <Text style={styles.message}>{item.message}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.date}>Sent {sent}</Text>
        <Badge
          label={item.status === "resolved" ? "Resolved" : "Open"}
          tone={item.status === "resolved" ? "success" : "neutral"}
          size="sm"
        />
      </View>
      {item.admin_reply ? (
        <View style={styles.reply}>
          <Text style={styles.replyLabel}>Support team</Text>
          <Text style={styles.replyText}>{item.admin_reply}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.md, gap: spacing.sm },
  message: { ...typography.body, color: colors.textPrimary },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  date: { ...typography.caption, color: colors.textMuted },
  reply: { gap: spacing.xxs, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.primaryBorder },
  replyLabel: { ...typography.labelStrong, color: colors.primary },
  replyText: { ...typography.bodySmall, color: colors.textSecondary },
});

export default SupportMessageRow;
