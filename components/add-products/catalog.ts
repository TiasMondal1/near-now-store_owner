/**
 * Catalog helpers shared by the Add-products panels.
 */
import { formatINR } from "../../lib/order-utils";

/** One master_products row as returned by getMasterProductsPage. */
export type CatalogProduct = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  image_url?: string | null;
  unit?: string | null;
  base_price?: number | null;
  discounted_price?: number | null;
  /** base_price ?? discounted_price ?? 0 (set by getMasterProductsPage). */
  price?: number | null;
  is_loose?: boolean | null;
};

/** "dairy-products" → "Dairy Products". "All" passes through. */
export function formatCategoryLabel(raw: string): string {
  if (!raw || raw === "All") return raw;
  const withSpaces = String(raw).replace(/-/g, " ").trim();
  return withSpaces
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function catalogProductName(p: CatalogProduct): string {
  return (p.name || p.product_name || "Product").trim() || "Product";
}

/**
 * Row description: "Brand · Category · 500g · ₹250" on the first line, the
 * catalog description (if any) on the second. `ListRow` clamps to two lines.
 */
export function describeCatalogProduct(p: CatalogProduct): string | undefined {
  const selling = p.discounted_price ?? p.base_price ?? p.price;
  const meta = [
    p.brand?.trim() || null,
    p.category ? formatCategoryLabel(p.category) : null,
    p.unit?.trim() || null,
    selling != null && Number.isFinite(Number(selling)) ? formatINR(selling) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const desc = p.description?.trim() || "";
  const out = [meta, desc].filter(Boolean).join("\n");
  return out || undefined;
}
