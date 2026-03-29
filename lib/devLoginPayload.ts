/**
 * Body for POST dev-login. Backends often normalize phone differently than DB (+91… vs 10 digits).
 */
export function buildDevLoginBody(tenDigitIndia: string): Record<string, string> {
  const d = tenDigitIndia.replace(/\D/g, "").slice(-10);
  const e164 = `+91${d}`;
  return {
    phone: e164,
    phoneE164: e164,
    mobile: e164,
    phoneNational10: d,
    phoneDigits10: d,
    phoneWithCountryDigits: `91${d}`,
    role: "shopkeeper",
  };
}
