/**
 * Warning notice listing the fields of a profile-change request that is
 * still awaiting admin review, with the submitted value for each. Pass
 * `fields` to show only a subset (e.g. the billing fields on Billing).
 */
import React from "react";
import { InlineNotice } from "../ui";
import { CHANGE_FIELD_LABELS as BILLING_FIELD_LABELS } from "../kyc";

export type PendingChangeRequest = {
  id: string;
  changes: Record<string, { old: string | null; new: string }>;
};

// store_profile_change_requests also carries bank/payout fields
// (saveBillingInfo in billing-info.tsx submits into the same table/queue
// Profile polls) — this used to be a 3-way name/address/phone ternary that
// would have silently mislabeled any bank field as "Phone".
// Bank field labels come from components/kyc so this notice and the Billing
// screen's pending banner always agree on wording.
export const PROFILE_CHANGE_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: "Store name",
  address: "Address",
  phone: "Phone",
  ...BILLING_FIELD_LABELS,
};

export type PendingChangesNoticeProps = {
  request: PendingChangeRequest;
  /** When set, only changes to these fields are listed. */
  fields?: ReadonlySet<string>;
  title?: string;
};

export function PendingChangesNotice({ request, fields, title }: PendingChangesNoticeProps) {
  const lines = Object.entries(request.changes)
    .filter(([field]) => !fields || fields.has(field))
    .map(
      ([field, diff]) =>
        `${PROFILE_CHANGE_FIELD_LABELS[field] || field}: ${field === "bank_passbook_storage_path" ? "New photo uploaded" : diff.new}`
    );
  if (lines.length === 0) return null;
  return <InlineNotice tone="warning" icon="time-outline" title={title ?? "Changes pending review"} lines={lines} />;
}

export default PendingChangesNotice;
