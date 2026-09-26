/**
 * Pure validation for the custom-product form. Every rule is evaluated
 * together so all problems can be shown inline at once and the submit button
 * can be disabled until the form is valid.
 */
import {
  formatMasterProductUnit,
  unitForLoosePricingBasis,
  type AddCustomMasterProductInput,
  type LoosePricingBasis,
} from "../../lib/storeProducts";

export const PACK_UNITS = ["kg", "g", "l", "ml", "pcs", "units", "bunch", "pack"] as const;
export type PackUnit = (typeof PACK_UNITS)[number];

export const LOOSE_BASES: readonly { key: LoosePricingBasis; label: string; per: string }[] = [
  { key: "kg", label: "1 kg", per: "per 1 kg" },
  { key: "l", label: "1 litre", per: "per 1 litre" },
];

export type CustomProductValues = {
  name: string;
  brand: string;
  category: string;
  description: string;
  isLoose: boolean;
  looseBasis: LoosePricingBasis | null;
  packAmount: string;
  packSuffix: string;
  imageUri: string | null;
  imageBase64: string | null;
  imageUrlLink: string;
  basePrice: string;
  discountedPrice: string;
  minQty: string;
  maxQty: string;
};

export const EMPTY_CUSTOM_PRODUCT: CustomProductValues = {
  name: "",
  brand: "",
  category: "",
  description: "",
  isLoose: false,
  looseBasis: null,
  packAmount: "",
  packSuffix: "",
  imageUri: null,
  imageBase64: null,
  imageUrlLink: "",
  basePrice: "",
  discountedPrice: "",
  minQty: "",
  maxQty: "",
};

export type CustomProductField =
  | "name"
  | "category"
  | "image"
  | "looseBasis"
  | "packAmount"
  | "packSuffix"
  | "basePrice"
  | "discountedPrice"
  | "minQty"
  | "maxQty";

/** Visual order of the fields — the first invalid one gets focus. */
export const CUSTOM_PRODUCT_FIELD_ORDER: readonly CustomProductField[] = [
  "name",
  "category",
  "image",
  "looseBasis",
  "packAmount",
  "packSuffix",
  "basePrice",
  "discountedPrice",
  "minQty",
  "maxQty",
];

export type CustomProductErrors = Partial<Record<CustomProductField, string>>;

/** `Number("1,200 ")` → 1200 — commas stripped, whitespace trimmed (as before). */
export function parseAmount(raw: string): number {
  return Number(String(raw).replace(/,/g, "").trim());
}

/** Resolved image: the data URL of a picked photo, else the pasted link. */
export function resolveImageUrl(v: Pick<CustomProductValues, "imageBase64" | "imageUrlLink">): string {
  return v.imageBase64 != null ? `data:image/jpeg;base64,${v.imageBase64}` : v.imageUrlLink.trim();
}

/** master_products.unit for the current packaging inputs, or "" while invalid. */
export function resolveUnit(v: Pick<CustomProductValues, "isLoose" | "looseBasis" | "packAmount" | "packSuffix">): string {
  if (v.isLoose) return v.looseBasis ? unitForLoosePricingBasis(v.looseBasis) : "";
  const amount = parseAmount(v.packAmount);
  if (!v.packSuffix || !Number.isFinite(amount) || amount <= 0) return "";
  return formatMasterProductUnit(amount, v.packSuffix);
}

export function validateCustomProduct(v: CustomProductValues): CustomProductErrors {
  const errors: CustomProductErrors = {};

  if (!v.name.trim()) errors.name = "Enter a product name";
  if (!v.category.trim()) errors.category = "Enter a category";
  if (!resolveImageUrl(v)) errors.image = "Add a photo or paste an image URL";

  if (v.isLoose) {
    if (!v.looseBasis) errors.looseBasis = "Choose per 1 kg or per 1 litre";
  } else {
    const amount = parseAmount(v.packAmount);
    if (v.packAmount.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
      errors.packAmount = "Enter a pack amount above 0";
    }
    if (!v.packSuffix) errors.packSuffix = "Choose a pack unit";
  }

  // `Number("")` is 0, so a blank price is a valid ₹0 (base_price 0 /
  // discounted_price 0 are submitted).
  const base = parseAmount(v.basePrice);
  const disc = parseAmount(v.discountedPrice);
  const baseOk = Number.isFinite(base) && base >= 0;
  const discOk = Number.isFinite(disc) && disc >= 0;
  if (!baseOk) errors.basePrice = "Enter a valid price";
  if (!discOk) errors.discountedPrice = "Enter a valid price";
  if (baseOk && discOk && disc > base) errors.discountedPrice = "Can't be higher than the MRP";

  const minParsed = v.minQty.trim() === "" ? 1 : parseAmount(v.minQty);
  const maxParsed = v.maxQty.trim() === "" ? 100 : parseAmount(v.maxQty);
  if (!Number.isFinite(minParsed) || minParsed <= 0) errors.minQty = "Must be more than 0";
  if (!Number.isFinite(maxParsed) || (Number.isFinite(minParsed) && maxParsed < minParsed)) {
    errors.maxQty = "Must be at least the min quantity";
  }

  return errors;
}

export function firstInvalidField(errors: CustomProductErrors): CustomProductField | null {
  return CUSTOM_PRODUCT_FIELD_ORDER.find((f) => Boolean(errors[f])) ?? null;
}

const FIELD_NOUN: Record<CustomProductField, string> = {
  name: "a product name",
  category: "a category",
  image: "a photo",
  looseBasis: "a pricing basis",
  packAmount: "a pack amount",
  packSuffix: "a pack unit",
  basePrice: "a valid MRP",
  discountedPrice: "a valid selling price",
  minQty: "a valid min quantity",
  maxQty: "a valid max quantity",
};

/** One line under the disabled submit button: "To submit, add a product name, a category and a photo". */
export function customProductHint(errors: CustomProductErrors): string | null {
  const missing = CUSTOM_PRODUCT_FIELD_ORDER.filter((f) => Boolean(errors[f])).map((f) => FIELD_NOUN[f]);
  if (missing.length === 0) return null;
  const shown = missing.slice(0, 3);
  const rest = missing.length - shown.length;
  const list =
    shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return `To submit, add ${list}${rest > 0 ? ` (+${rest} more)` : ""}`;
}

/** The addCustomMasterProduct payload. Call only when valid. */
export function buildSubmission(v: CustomProductValues): AddCustomMasterProductInput {
  const minParsed = v.minQty.trim() === "" ? 1 : parseAmount(v.minQty);
  const maxParsed = v.maxQty.trim() === "" ? 100 : parseAmount(v.maxQty);
  return {
    name: v.name.trim(),
    brand: v.brand,
    category: v.category,
    description: v.description.trim() || null,
    image_url: resolveImageUrl(v),
    unit: resolveUnit(v),
    base_price: parseAmount(v.basePrice),
    discounted_price: parseAmount(v.discountedPrice),
    is_loose: v.isLoose,
    min_quantity: minParsed,
    max_quantity: maxParsed,
  };
}
