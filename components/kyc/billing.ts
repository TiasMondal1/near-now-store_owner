/**
 * Billing change-request field names shared by app/billing-info.tsx (pending
 * banner) and app/pending-verification.tsx (the "Billing" step counts as done
 * while a change request touching one of these fields is pending), plus the
 * bank-field validation the Billing form runs before it submits.
 *
 * Foundation request: this belongs in lib/billingInfo.ts next to
 * fetchBillingInfo/saveBillingInfo once that file is open for edits.
 */
export const CHANGE_FIELD_LABELS: Readonly<Record<string, string>> = {
  bank_account_number: "Bank account number",
  bank_ifsc_code: "IFSC code",
  bank_branch_name: "Bank branch",
  bank_passbook_storage_path: "Passbook / cheque photo",
};

export const BILLING_FIELDS: ReadonlySet<string> = new Set(Object.keys(CHANGE_FIELD_LABELS));

/** True when a profile change request carries at least one billing field. */
export function hasBillingChange(changes: Record<string, unknown> | null | undefined): boolean {
  return !!changes && Object.keys(changes).some((f) => BILLING_FIELDS.has(f));
}

/** A pending profile-change request as the Billing screen reads it (billing fields only matter here). */
export type PendingBillingChangeRequest = { changes: Record<string, { old: string | null; new: string }> } | null;

/**
 * Lines for the "Changes pending review" notice: one per billing field in the
 * request, with the submitted value (or "New photo uploaded" for the passbook).
 */
export function pendingBillingChangeLines(request: PendingBillingChangeRequest): string[] {
  if (!request) return [];
  return Object.entries(request.changes)
    .filter(([field]) => BILLING_FIELDS.has(field))
    .map(([field, diff]) => `${CHANGE_FIELD_LABELS[field] || field}: ${field === "bank_passbook_storage_path" ? "New photo uploaded" : diff.new}`);
}

const ACCOUNT_PATTERN = /^[0-9]{6,20}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Inline error for the bank account number field, or undefined when valid. */
export function accountNumberError(value: string): string | undefined {
  const acct = value.trim();
  if (!acct) return "Enter your bank account number.";
  if (!ACCOUNT_PATTERN.test(acct)) return "Bank account number must be 6-20 digits.";
  return undefined;
}

/** Inline error for the IFSC code field, or undefined when valid. */
export function ifscCodeError(value: string): string | undefined {
  const ifsc = value.trim().toUpperCase();
  if (!ifsc) return "Enter your IFSC code.";
  if (!IFSC_PATTERN.test(ifsc)) return "Expected format e.g. SBIN0001234.";
  return undefined;
}
