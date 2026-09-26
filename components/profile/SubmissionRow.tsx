/**
 * One custom-product submission, built on `ListRow` (52dp thumbnail, name,
 * meta + price as the description, review status `Badge` trailing) with the
 * rejection reason and Submitted/Reviewed caption in a block under the row.
 * The parent owns separators (`Divider` between rows), like OrderItemRow.
 */
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Badge, ListRow } from "../ui";
import { colors, layout, radius, spacing, typography, type Tone } from "../../lib/theme";
import { formatINR, getStatusTone } from "../../lib/order-utils";
import { useLayout } from "../../lib/useLayout";

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type Submission = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  image_url: string;
  base_price: number;
  discounted_price: number;
  unit: string;
  status: SubmissionStatus;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

/** `getStatusTone` has no "approved" case (orders say "accepted"), so map it to success here. */
export function submissionTone(status: SubmissionStatus): Tone {
  return status === "approved" ? "success" : getStatusTone(status);
}

export type SubmissionRowProps = {
  submission: Submission;
};

export function SubmissionRow({ submission: s }: SubmissionRowProps) {
  const { gutter } = useLayout();
  const submitted = new Date(s.created_at).toLocaleDateString("en-IN");
  const reviewed = s.reviewed_at ? new Date(s.reviewed_at).toLocaleDateString("en-IN") : null;
  const meta = `${s.brand ? `${s.brand} · ` : ""}${s.category} · ${s.unit}`;
  const showReason = s.status === "rejected" && Boolean(s.rejection_reason);
  // One utterance per row, like KeyValueRow/ListRow group their static rows.
  const spoken = [
    s.name,
    STATUS_LABEL[s.status],
    `${formatINR(s.discounted_price)}, was ${formatINR(s.base_price)}`,
    `submitted ${submitted}`,
    reviewed ? `reviewed ${reviewed}` : null,
    showReason ? `reason: ${s.rejection_reason}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View accessible accessibilityLabel={spoken}>
      <ListRow
        leadingSize={52}
        leading={
          <Image
            source={{ uri: s.image_url }}
            style={styles.thumb}
            accessibilityIgnoresInvertColors
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        }
        title={s.name}
        description={`${meta}\n${formatINR(s.discounted_price)} · was ${formatINR(s.base_price)}`}
        trailing={<Badge label={STATUS_LABEL[s.status]} tone={submissionTone(s.status)} size="sm" />}
      />
      <View style={[styles.footer, { paddingLeft: gutter + TITLE_INDENT, paddingRight: gutter }]}>
        {showReason ? <Text style={styles.reason}>Reason: {s.rejection_reason}</Text> : null}
        <Text style={styles.date}>
          Submitted {submitted}
          {reviewed ? ` · Reviewed ${reviewed}` : ""}
        </Text>
      </View>
    </View>
  );
}

// The footer block sits under the ListRow, indented to the title column
// (52dp leading slot + the row's 12 gap) so it reads as part of the same row.
const TITLE_INDENT = layout.listRowLeadingSlotLg + spacing.md;

// Layout only.
const styles = StyleSheet.create({
  thumb: { width: "100%", height: "100%", borderRadius: radius.md, backgroundColor: colors.surfaceVariant },
  footer: { paddingBottom: spacing.md, gap: spacing.xs },
  reason: { ...typography.caption, color: colors.errorText },
  date: { ...typography.caption, color: colors.textMuted },
});

export default SubmissionRow;
