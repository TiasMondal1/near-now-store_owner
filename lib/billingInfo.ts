import { config } from "./config";
import { apiClient } from "./api-client";

const API_BASE = config.API_BASE;

export type BillingInfo = {
  ownerName: string | null;
  ownerImageUrl: string | null;
  bankAccountNumber: string | null;
  bankIfscCode: string | null;
  bankBranchName: string | null;
  passbookUrl: string | null;
};

export type PickedBillingFile = { uri: string; name: string; type: string };

// Routed through apiClient (not a raw fetch) so a 401 here goes through the
// app's one global session-expiry handler (clears the session, redirects to
// /landing) instead of being silently swallowed by a caller's own non-fatal
// catch block — this was the gap that let pending-verification.tsx's new
// billing-status check show stale/wrong progress on an expired session with
// no indication why.
export async function fetchBillingInfo(token: string, storeId: string): Promise<BillingInfo> {
  const res = await apiClient.get<{ billingInfo: BillingInfo }>(
    `/store-owner/stores/${storeId}/billing-info`,
    { Authorization: `Bearer ${token}` }
  );
  if (!res.success || !res.data) throw new Error(res.error || "Failed to fetch billing info");
  return res.data.billingInfo;
}

export async function saveBillingInfo(
  token: string,
  storeId: string,
  fields: {
    bankAccountNumber?: string;
    bankIfscCode?: string;
    bankBranchName?: string;
    file?: PickedBillingFile;
  }
): Promise<{ ok: true; cancelled: boolean } | { ok: false; error: string }> {
  const form = new FormData();
  if (fields.bankAccountNumber !== undefined) form.append("bank_account_number", fields.bankAccountNumber);
  if (fields.bankIfscCode !== undefined) form.append("bank_ifsc_code", fields.bankIfscCode);
  if (fields.bankBranchName !== undefined) form.append("bank_branch_name", fields.bankBranchName);
  if (fields.file) {
    form.append("file", {
      uri: fields.file.uri,
      name: fields.file.name,
      type: fields.file.type,
    } as unknown as Blob);
  }

  try {
    const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/billing-info`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { ok: false, error: json?.error || "Failed to save billing info" };
    }
    return { ok: true, cancelled: !!json?.cancelled };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
