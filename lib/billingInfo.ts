import { config } from "./config";

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

export async function fetchBillingInfo(token: string, storeId: string): Promise<BillingInfo> {
  const res = await fetch(`${API_BASE}/store-owner/stores/${storeId}/billing-info`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch billing info");
  const json = await res.json();
  return json.billingInfo;
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
): Promise<{ ok: true } | { ok: false; error: string }> {
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
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
