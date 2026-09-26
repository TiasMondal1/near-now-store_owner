import React, { useRef } from "react";
import { NoticeSheet } from "./ui";
import { ReviewOutcome } from "../lib/useReviewOutcomeGate";

interface Props {
  outcome: ReviewOutcome | null;
  onDismiss: () => void;
}

function titleFor(outcome: ReviewOutcome): string {
  if (outcome.kind === "profile_change") {
    return outcome.approved ? "Profile change approved" : "Profile change rejected";
  }
  return outcome.approved ? "Product approved" : "Product rejected";
}

function bodyFor(outcome: ReviewOutcome): string {
  if (outcome.kind === "profile_change") {
    return outcome.approved
      ? "Your requested store profile changes have been approved and are now live."
      : `Your requested changes were rejected${outcome.rejectionReason ? `: ${outcome.rejectionReason}` : "."}`;
  }
  const name = outcome.productName ? `"${outcome.productName}"` : "Your product";
  return outcome.approved
    ? `${name} was approved and is now live in your store.`
    : `${name} was rejected${outcome.rejectionReason ? `: ${outcome.rejectionReason}` : "."}`;
}

/**
 * Acknowledgment for a reviewed profile-change or product-submission request.
 * A `NoticeSheet`: the button, backdrop tap and Android back all run
 * `onDismiss`, so every way out of the sheet acknowledges the outcome.
 */
export default function ReviewOutcomeModal({ outcome, onDismiss }: Props) {
  // Keep the last outcome so the sheet still has content while it animates
  // out after `onDismiss` sets `outcome` to null.
  const lastRef = useRef<ReviewOutcome | null>(null);
  if (outcome) lastRef.current = outcome;
  const shown = outcome ?? lastRef.current;
  if (!shown) return null;

  const approved = shown.approved;

  return (
    <NoticeSheet
      visible={!!outcome}
      tone={approved ? "success" : "error"}
      icon={approved ? "checkmark-circle-outline" : "close-circle-outline"}
      title={titleFor(shown)}
      message={bodyFor(shown)}
      actionLabel="Got it"
      onAction={onDismiss}
    />
  );
}
