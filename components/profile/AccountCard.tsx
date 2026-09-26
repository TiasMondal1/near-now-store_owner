/**
 * "Account" card: owner, phone, email, member-since and verification-status
 * rows. The status is plain `KeyValueRow` text here; the coloured `Badge`
 * lives once, in `ProfileHero`.
 */
import React from "react";
import { Card, KeyValueRow } from "../ui";

export type AccountCardProps = {
  ownerName: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  /** Pre-formatted date string, or null when unknown. */
  memberSince?: string | null;
  /** Derived from the live store row (`isStoreApproved`), falling back to the session flag. */
  approved: boolean | null;
};

export function AccountCard({ ownerName, ownerPhone, ownerEmail, memberSince, approved }: AccountCardProps) {
  // Same wording as the ProfileHero badge — one label per state, app-wide.
  const verification = approved ? "Verified" : "Verification pending";
  return (
    <Card title="Account">
      <KeyValueRow label="Owner" value={ownerName || "—"} showSeparator />
      <KeyValueRow label="Phone" value={ownerPhone || "—"} showSeparator />
      {ownerEmail ? <KeyValueRow label="Email" value={ownerEmail} showSeparator /> : null}
      {memberSince ? <KeyValueRow label="Member since" value={memberSince} showSeparator /> : null}
      <KeyValueRow label="Verification" value={verification} />
    </Card>
  );
}

export default AccountCard;
