/**
 * Fix 4 (2026-10-02): the shopkeeper's GST certificate number is checked for
 * the GSTIN check character before upload, not just its shape. lib/gstin.ts
 * is a word-for-word copy of the backend's validator.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { validateDocNumber, docNumberErrorMessage, DOC_NUMBER_FORMATS } from "../lib/verificationDocuments";
import { isValidGstin } from "../lib/gstin";

describe("GST certificate number (shopkeeper app)", () => {
  it("accepts a real GSTIN", () => {
    expect(validateDocNumber("gst", "29AAHCR4320E1ZJ")).toBe(true);
  });

  it("rejects a mistyped GSTIN that has the right shape", () => {
    expect(validateDocNumber("gst", "22AAAAA0000A1Z5")).toBe(false);
  });

  it("shows a valid example", () => {
    expect(isValidGstin(DOC_NUMBER_FORMATS.gst!.example)).toBe(true);
    expect(docNumberErrorMessage("gst")).toContain(DOC_NUMBER_FORMATS.gst!.example);
  });

  it("uses the same validator as the backend (byte-identical copy)", () => {
    const backendCopy = resolve(__dirname, "../../near-and-now/backend/src/utils/gstin.ts");
    let backend: string;
    try {
      backend = readFileSync(backendCopy, "utf8");
    } catch {
      return; // backend repo not checked out next to this one (e.g. CI) — skip
    }
    expect(readFileSync(resolve(__dirname, "../lib/gstin.ts"), "utf8")).toBe(backend);
  });
});
