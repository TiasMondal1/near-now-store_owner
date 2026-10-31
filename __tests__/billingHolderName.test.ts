import { CHANGE_FIELD_LABELS, hasBillingChange, holderNameError, normalizeHolderName, pendingBillingChangeLines } from "../components/kyc/billing";

describe("account holder name (2026-10-28, needed for bank payouts)", () => {
  it("collapses whitespace the way the backend stores it", () => {
    expect(normalizeHolderName("  Ramesh   Kumar\tDas ")).toBe("Ramesh Kumar Das");
  });

  it.each([
    ["Ramesh Kumar Das", undefined],
    ["M/s Maa Tara Stores", "Use letters and spaces only, as printed on your passbook."],
    ["D'Souza & Sons", undefined],
    ["R. K. Das", undefined],
    ["", "Enter the name on the bank account."],
    ["   ", "Enter the name on the bank account."],
    ["Al", "Use letters and spaces only, as printed on your passbook."],
    ["Ramesh 123", "Use letters and spaces only, as printed on your passbook."],
  ])("%j → %s", (value, expected) => {
    expect(holderNameError(value)).toBe(expected);
  });

  it("is a billing field for the pending-review banner", () => {
    expect(CHANGE_FIELD_LABELS.bank_account_holder_name).toBe("Account holder name");
    const request = { changes: { bank_account_holder_name: { old: null, new: "Ramesh Das" } } };
    expect(hasBillingChange(request.changes)).toBe(true);
    expect(pendingBillingChangeLines(request)).toEqual(["Account holder name: Ramesh Das"]);
  });
});
