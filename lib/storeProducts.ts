/**
 * Store products: read/write the Supabase `products` table directly.
 * Ensures inventory and "Your stock" use the same DB source.
 */

import { supabase } from "./supabase";
import { config } from "./config";

export type StoreProductRow = {
  id: string;
  store_id: string;
  master_product_id: string;
  is_active?: boolean;
  name?: string;
  phone?: string;
};

export type StoreProductWithName = StoreProductRow & { name: string };

/**
 * Strict variant — throws on a query error instead of masking it as an empty
 * store. Callers that persist results (home's stale-while-revalidate product
 * cache) must be able to tell "you have no products" apart from "the network
 * died", or a transient outage overwrites a good cache with [].
 */
export async function getStoreProductsFromDbStrict(
  storeId: string
): Promise<StoreProductRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("products")
    .select("id, store_id, master_product_id, is_active, name, phone")
    .eq("store_id", storeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[storeProducts] products fetch failed: ${error.message}`);
  return (data ?? []) as StoreProductRow[];
}

/** Fetch all active (non-deleted) product rows for a store from the DB */
export async function getStoreProductsFromDb(
  storeId: string
): Promise<StoreProductRow[]> {
  try {
    return await getStoreProductsFromDbStrict(storeId);
  } catch {
    return [];
  }
}

/** Fetch master_products from DB (for names and units). Falls back to empty if not available. */
export async function getMasterProductsFromDb(): Promise<
  Array<{ id: string; name: string; unit?: string; is_loose?: boolean }>
> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("master_products").select("id, name, unit, is_loose");
  if (error) return [];
  return (data ?? []) as Array<{ id: string; name: string; unit?: string; is_loose?: boolean }>;
}

// Cached join select — avoids re-probing both variants on every call.
// Set on first successful join; cleared on logout/store change if needed.
let _workingJoinSelect: string | null = null;

function mapJoinRows(rows: any[], select: string): StoreProductWithName[] {
  const relationKey = select.includes("master_products(") ? "master_products" : "master_product";
  return rows.map((row) => {
    const rel = row[relationKey];
    const fromMaster = rel?.name ?? (rel && (rel as any).name);
    const resolvedName = (fromMaster && String(fromMaster).trim()) || row.name || "Product";
    const unitFromMaster = rel?.unit ? String(rel.unit) : "";
    const isLoose = rel?.is_loose === true;
    const { master_products, master_product, ...rest } = row;
    return { ...rest, name: resolvedName, unit: unitFromMaster, is_loose: isLoose } as StoreProductWithName;
  });
}

/**
 * Get store products with names. Tries joined query first (master_products.name),
 * then falls back to two-query merge. Uses products.name if present (e.g. custom products).
 */
export async function getStoreProductsWithNames(
  storeId: string
): Promise<StoreProductWithName[]> {
  if (!supabase) return [];

  const allSelects = [
    "id, store_id, master_product_id, is_active, name, phone, master_products(name, unit, is_loose)",
    "id, store_id, master_product_id, is_active, name, phone, master_product(name, unit, is_loose)",
  ];
  // Put the cached winner first so we skip the probe on warm calls
  const toTry = _workingJoinSelect
    ? [_workingJoinSelect, ...allSelects.filter((s) => s !== _workingJoinSelect)]
    : allSelects;

  for (const select of toTry) {
    const { data, error } = await supabase
      .from("products")
      .select(select)
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    // A successful-but-empty result is a real answer (the store simply has no
    // products), not a failed join variant — the join relation is a left join
    // on the same filtered rows, so it can never change the row count. Only
    // an actual error (unknown relation name) should try the next variant.
    // Treating empty as failure used to send every poll for a zero-product
    // store through both probes AND the full master-catalog fallback below.
    if (!error && Array.isArray(data)) {
      _workingJoinSelect = select;
      return mapJoinRows(data, select);
    }
  }

  // Fallback: two parallel queries when neither join works. The store-rows
  // read is strict — if it also fails here, every source has errored and the
  // caller must see a rejection, not a fake empty store (getStockListFromDb's
  // consumers persist results to the product cache).
  const [storeRows, masterList] = await Promise.all([
    getStoreProductsFromDbStrict(storeId),
    getMasterProductsFromDb(),
  ]);
  const nameByMasterId: Record<string, string> = {};
  const unitByMasterId: Record<string, string> = {};
  const isLooseByMasterId: Record<string, boolean> = {};
  masterList.forEach((m) => {
    const n = (m as any).name ?? (m as any).product_name;
    const nameStr = n && String(n).trim() ? String(n).trim() : "";
    if (nameStr) nameByMasterId[String(m.id)] = nameStr;
    if (m.unit && String(m.unit).trim()) unitByMasterId[String(m.id)] = String(m.unit).trim();
    isLooseByMasterId[String(m.id)] = m.is_loose === true;
  });
  return storeRows.map((row) => {
    const key = String(row.master_product_id);
    const fromMaster = nameByMasterId[key];
    const fromRow = (row as any).name ?? (row as any).product_name;
    const name = [fromMaster, fromRow].find((n) => n && String(n).trim() && n !== "Product") || fromMaster || fromRow || "Product";
    return {
      ...row,
      name: name && String(name).trim() ? String(name).trim() : "Product",
      unit: unitByMasterId[key] || "",
      is_loose: isLooseByMasterId[key] === true,
    } as StoreProductWithName;
  });
}

/** Your stock list: id, name, unit, is_active, is_loose for main page */
export async function getStockListFromDb(
  storeId: string
): Promise<Array<{ id: string; name: string; unit: string; storeProductId: string; is_active: boolean; is_loose: boolean }>> {
  const rows = await getStoreProductsWithNames(storeId);
  return rows.map((r) => {
    const rawName = r.name ?? (r as any).product_name;
    const name = (rawName && String(rawName).trim()) ? String(rawName).trim() : "Product";
    return {
      id: r.master_product_id,
      storeProductId: r.id,
      name,
      unit: (r as any).unit || "",
      is_active: r.is_active !== false,
      is_loose: (r as any).is_loose === true,
    };
  });
}

export type UpsertResult = { id: string } | { error: string };

/** Insert or update one product row. Re-adds soft-deleted products by clearing deleted_at. */
export async function upsertStoreProduct(
  storeId: string,
  masterProductId: string,
  storeName?: string,
  ownerPhone?: string
): Promise<UpsertResult | null> {
  if (!supabase) return { error: "Supabase not configured" };
  if (!storeId || !masterProductId) return { error: "Missing store_id or master_product_id" };

  // The catalog-availability check and the existing-row lookup are
  // independent reads — run them together so the Add button's spinner covers
  // two round trips instead of three.
  const [masterRes, existingRes] = await Promise.all([
    supabase
      .from("master_products")
      .select("is_active")
      .eq("id", masterProductId)
      .maybeSingle(),
    // Include soft-deleted rows so we can restore them instead of inserting a duplicate
    supabase
      .from("products")
      .select("id, deleted_at")
      .eq("store_id", storeId)
      .eq("master_product_id", masterProductId)
      .maybeSingle(),
  ]);

  const { data: masterProduct, error: masterErr } = masterRes;
  if (masterErr) return { error: masterErr.message };
  if (!masterProduct || masterProduct.is_active === false) {
    return { error: "This product is no longer available in the Near&Now catalog" };
  }

  const { data: existing, error: selectErr } = existingRes;
  if (selectErr) return { error: selectErr.message };

  if (existing?.id) {
    const updatePayload: any = {
      updated_at: new Date().toISOString(),
      deleted_at: null,   // un-delete if previously soft-deleted
      is_active: true,
    };
    if (storeName) updatePayload.name = storeName;
    if (ownerPhone) updatePayload.phone = ownerPhone;
    const { error: updateErr } = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", existing.id);
    if (updateErr) return { error: updateErr.message };
    return { id: existing.id };
  }

  const insertPayload: any = {
    store_id: storeId,
    master_product_id: masterProductId,
    is_active: true,
  };
  if (storeName) insertPayload.name = storeName;
  if (ownerPhone) insertPayload.phone = ownerPhone;

  const { data: insertData, error: insertErr } = await supabase
    .from("products")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertErr) return { error: insertErr.message };
  if (insertData?.id) return { id: insertData.id };
  return { error: "No id returned after insert" };
}

export type AddCustomMasterProductInput = {
  name: string;
  brand?: string;
  category: string;
  description?: string | null;
  /** Resolved image: data URL or https URL. */
  image_url: string;
  /** master_products.unit. For loose items pass "" to use DEFAULT_LOOSE_MASTER_PRODUCT_UNIT. */
  unit: string;
  base_price: number;
  discounted_price: number;
  is_loose: boolean;
  min_quantity?: number;
  max_quantity?: number;
};

/** Fallback if is_loose but unit is missing (use unitForLoosePricingBasis from the form when possible). */
export const DEFAULT_LOOSE_MASTER_PRODUCT_UNIT = "1kg";

export type LoosePricingBasis = "kg" | "l";

/** Stored in master_products.unit: prices are per 1 kg or per 1 litre. */
export function unitForLoosePricingBasis(basis: LoosePricingBasis): string {
  return basis === "kg" ? "1kg" : "1l";
}

/** Builds master_products.unit from amount + suffix (e.g. 200 + "g" → "200g", 300 + "ml" → "300ml"). */
export function formatMasterProductUnit(amount: number, unitSuffix: string): string {
  const suffix = unitSuffix.trim();
  if (!suffix) return "";
  if (!Number.isFinite(amount) || amount <= 0) return suffix;
  const n =
    Math.abs(amount - Math.round(amount)) < 1e-9
      ? String(Math.round(amount))
      : String(amount);
  return `${n}${suffix}`;
}

export type AddCustomMasterProductResult =
  | { success: true; submissionId: string }
  | { success: false; error: string };

/**
 * Submits a custom product for admin review (public.product_submissions) via
 * the backend — it is NOT written to master_products directly. An admin must
 * approve it (supplying the HSN/GST fields this form never collects) before
 * it becomes a real master_products row and is linked into this store's
 * products. See backend/src/controllers/productSubmissions.controller.ts.
 */
export async function addCustomMasterProduct(
  input: AddCustomMasterProductInput,
  token: string
): Promise<AddCustomMasterProductResult> {
  if (!token) return { success: false, error: "Not signed in" };

  const productName = input.name.trim();
  let unit = input.unit.trim();
  if (input.is_loose && !unit) {
    unit = DEFAULT_LOOSE_MASTER_PRODUCT_UNIT;
  }
  if (!productName) {
    return { success: false, error: "Product name is required" };
  }
  if (!unit) {
    return { success: false, error: "Pack amount and unit are required for non-loose products" };
  }

  const img = input.image_url.trim();
  if (!img) {
    return { success: false, error: "Add a product photo or an image URL" };
  }

  const base = Number(input.base_price);
  const disc = Number(input.discounted_price);
  if (!Number.isFinite(base) || base <= 0) {
    return { success: false, error: "Enter a valid base (MRP) price" };
  }
  if (!Number.isFinite(disc) || disc <= 0) {
    return { success: false, error: "Enter a valid discounted / selling price" };
  }
  if (disc > base) {
    return {
      success: false,
      error: "Selling price cannot be higher than base price (discounted ≤ base).",
    };
  }

  const minQ = input.min_quantity ?? 1;
  const maxQ = input.max_quantity ?? 100;
  if (!Number.isFinite(minQ) || minQ <= 0) {
    return { success: false, error: "Min quantity must be a positive number" };
  }
  if (!Number.isFinite(maxQ) || maxQ < minQ) {
    return { success: false, error: "Max quantity must be ≥ min quantity" };
  }

  const category = input.category.trim();
  if (!category) {
    return { success: false, error: "Category is required" };
  }

  const brandTrim = input.brand?.trim() ?? "";
  const descTrim = input.description?.trim() ?? "";
  const submissionPayload = {
    name: productName,
    category,
    brand: brandTrim || null,
    description: descTrim || null,
    image_url: img,
    base_price: base,
    discounted_price: disc,
    unit,
    is_loose: Boolean(input.is_loose),
    min_quantity: minQ,
    max_quantity: maxQ,
  };

  try {
    const res = await fetch(`${config.API_BASE}/shopkeeper/product-submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submissionPayload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { success: false, error: data?.error || "Failed to submit product for review" };
    }
    return { success: true, submissionId: String(data.submission.id) };
  } catch (e: any) {
    return { success: false, error: e?.message || "Network error while submitting product" };
  }
}

/**
 * Toggle a product's active state.
 * Active   → is_active=true
 * Inactive → is_active=false
 * Uses Supabase first; if that fails and token is provided, falls back to backend API.
 */
export async function updateProductActiveState(
  storeProductId: string,
  isActive: boolean,
  authToken?: string | null
): Promise<boolean> {
  if (supabase) {
    const { error } = await supabase
      .from("products")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", storeProductId);
    if (!error) return true;
    console.warn("[updateProductActiveState] Supabase error:", error.message);
  }

  if (authToken) {
    try {
      const res = await fetch(`${config.API_BASE}/store-owner/products/${storeProductId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: isActive }),
      });
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      if (res.ok && (data.success !== false)) return true;
    } catch (e) {
      console.warn("[updateProductActiveState] API fallback error:", e);
    }
  }

  return false;
}

/**
 * When store goes offline: no-op now that quantity/in_stock are removed.
 * Individual product is_active flags are preserved as-is.
 */
export async function setAllProductsOffline(_storeId: string): Promise<boolean> {
  return true;
}

/**
 * When store comes online: no-op now that quantity/in_stock are removed.
 * Individual product is_active flags are already persisted in the DB.
 */
export async function restoreActiveProductsOnline(_storeId: string): Promise<boolean> {
  return true;
}

/**
 * Fetch ALL master_products from DB, paginating through Supabase's 1000-row limit.
 * Runs batched .range() queries until all rows are fetched.
 */
export async function getMasterProductsFullFromDb(): Promise<any[]> {
  if (!supabase) return [];
  const PAGE_SIZE = 1000;
  const allData: any[] = [];
  let from = 0;
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabase
      .from("master_products")
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
}

// Category names change on an admin timescale, but the Inventory section
// refetched them on every mount (every Inventory<->Add Custom toggle, every
// tab remount). Cache per session with a modest TTL + in-flight dedup.
const CATEGORIES_TTL_MS = 10 * 60 * 1000;
let _categoriesCache: { list: string[]; ts: number } | null = null;
let _categoriesInflight: Promise<string[]> | null = null;

/** Fetch all unique category names. Queries the categories table first (no row-limit issue),
 *  then falls back to a paginated scan of master_products.category as a safety net. */
export async function getMasterProductCategories(): Promise<string[]> {
  if (_categoriesCache && Date.now() - _categoriesCache.ts < CATEGORIES_TTL_MS) {
    return _categoriesCache.list;
  }
  if (_categoriesInflight) return _categoriesInflight;
  _categoriesInflight = fetchMasterProductCategories()
    .then((list) => {
      if (list.length > 0) _categoriesCache = { list, ts: Date.now() };
      return list;
    })
    .finally(() => {
      _categoriesInflight = null;
    });
  return _categoriesInflight;
}

async function fetchMasterProductCategories(): Promise<string[]> {
  if (!supabase) return [];

  // Primary: categories table is small and has no 1000-row issue
  const { data: catRows, error: catErr } = await supabase
    .from("categories")
    .select("name")
    .order("name");

  if (!catErr && catRows && catRows.length > 0) {
    return (catRows as any[])
      .map((r) => String(r.name ?? "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  // Fallback: paginate master_products.category in case categories table is empty
  const PAGE_SIZE = 1000;
  const cats = new Set<string>();
  let from = 0;
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabase
      .from("master_products")
      .select("category")
      .not("category", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    (data as any[]).forEach((row) => {
      const c = row.category;
      if (c && String(c).trim()) cats.add(String(c).trim());
    });
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return Array.from(cats).sort((a, b) => a.localeCompare(b));
}

export const CATALOG_PAGE_SIZE = 50;

/**
 * Fetch a page of master_products, optionally filtered by category and/or search.
 * Use `from` + `CATALOG_PAGE_SIZE` for pagination.
 */
export async function getMasterProductsPage({
  category,
  search,
  from,
  pageSize = CATALOG_PAGE_SIZE,
}: {
  category?: string | null;
  search?: string;
  from: number;
  pageSize?: number;
}): Promise<{ data: any[]; hasMore: boolean }> {
  if (!supabase) return { data: [], hasMore: false };

  let query = supabase
    .from("master_products")
    .select(
      "id, name, description, brand, category, image_url, base_price, discounted_price, unit, is_active, is_loose"
    )
    .eq("is_active", true)
    .range(from, from + pageSize - 1)
    .order("name");

  if (category && category !== "All") {
    query = query.eq("category", category);
  }

  const trimmed = search?.trim() ?? "";
  if (trimmed.length > 0) {
    query = query.or(`name.ilike.%${trimmed}%,brand.ilike.%${trimmed}%`);
  }

  const { data, error } = await query;
  if (error || !data) return { data: [], hasMore: false };

  return {
    data: (data as any[]).map((mp) => ({
      ...mp,
      price: mp.base_price ?? mp.discounted_price ?? 0,
    })),
    hasMore: data.length === pageSize,
  };
}

/**
 * Get merged inventory list from DB: all master_products with storeProductId from products table.
 * Use this for Inventory screen so it reads from DB.
 */
export async function getMergedInventoryFromDb(storeId: string): Promise<any[]> {
  const [masterList, storeRows] = await Promise.all([
    getMasterProductsFullFromDb(),
    getStoreProductsFromDb(storeId),
  ]);
  if (!Array.isArray(masterList)) return [];
  const byMasterId: Record<string, { id: string; is_active: boolean }> = {};
  storeRows.forEach((r) => {
    byMasterId[r.master_product_id] = { id: r.id, is_active: r.is_active !== false };
  });
  return masterList.map((mp: any) => {
    const row = byMasterId[mp.id];
    return {
      ...mp,
      name: mp.name ?? mp.product_name ?? "Product",
      price: mp.base_price ?? mp.price,
      storeProductId: row?.id ?? null,
      is_active: row?.is_active ?? false,
    };
  });
}
