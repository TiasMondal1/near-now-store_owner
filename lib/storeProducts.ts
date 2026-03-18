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

/** Fetch all product rows for a store from the DB */
export async function getStoreProductsFromDb(
  storeId: string
): Promise<StoreProductRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("products")
    .select("id, store_id, master_product_id, is_active, name, phone")
    .eq("store_id", storeId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as StoreProductRow[];
}

/** Fetch master_products from DB (for names). Falls back to empty if not available. */
export async function getMasterProductsFromDb(): Promise<
  Array<{ id: string; name: string }>
> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("master_products").select("id, name");
  if (error) return [];
  return (data ?? []) as Array<{ id: string; name: string }>;
}

/**
 * Get store products with names. Tries joined query first (master_products.name),
 * then falls back to two-query merge. Uses products.name if present (e.g. custom products).
 */
export async function getStoreProductsWithNames(
  storeId: string
): Promise<StoreProductWithName[]> {
  if (!supabase) return [];

  const joinSelects = [
    "id, store_id, master_product_id, is_active, name, phone, master_products(name)",
    "id, store_id, master_product_id, is_active, name, phone, master_product(name)",
  ];
  for (const select of joinSelects) {
    const { data: joinedData, error: joinError } = await supabase
      .from("products")
      .select(select)
      .eq("store_id", storeId)
      .order("created_at", { ascending: true });
    if (!joinError && Array.isArray(joinedData) && joinedData.length > 0) {
      const relationKey = select.includes("master_products(name)") ? "master_products" : "master_product";
      return (joinedData as any[]).map((row) => {
        const rel = row[relationKey];
        const fromMaster = rel?.name ?? (rel && (rel as any).name);
        const resolvedName = (fromMaster && String(fromMaster).trim()) || row.name || "Product";
        const { master_products, master_product, ...rest } = row;
        return { ...rest, name: resolvedName };
      });
    }
  }

  const [storeRows, masterList] = await Promise.all([
    getStoreProductsFromDb(storeId),
    getMasterProductsFromDb(),
  ]);
  const nameByMasterId: Record<string, string> = {};
  masterList.forEach((m) => {
    const n = (m as any).name ?? (m as any).product_name;
    const nameStr = n && String(n).trim() ? String(n).trim() : "";
    if (nameStr) {
      nameByMasterId[String(m.id)] = nameStr;
    }
  });
  return storeRows.map((row) => {
    const key = String(row.master_product_id);
    const fromMaster = nameByMasterId[key];
    const fromRow = (row as any).name ?? (row as any).product_name;
    const name = [fromMaster, fromRow].find((n) => n && String(n).trim() && n !== "Product") || fromMaster || fromRow || "Product";
    return {
      ...row,
      name: name && String(name).trim() ? String(name).trim() : "Product",
    };
  });
}

/** Your stock list: id, name, is_active for main page */
export async function getStockListFromDb(
  storeId: string
): Promise<Array<{ id: string; name: string; storeProductId: string; is_active: boolean }>> {
  const rows = await getStoreProductsWithNames(storeId);
  return rows.map((r) => {
    const rawName = r.name ?? (r as any).product_name;
    const name = (rawName && String(rawName).trim()) ? String(rawName).trim() : "Product";
    return {
      id: r.master_product_id,
      storeProductId: r.id,
      name,
      is_active: r.is_active !== false,
    };
  });
}

export type UpsertResult = { id: string } | { error: string };

/** Insert or update one product row. */
export async function upsertStoreProduct(
  storeId: string,
  masterProductId: string,
  storeName?: string,
  ownerPhone?: string
): Promise<UpsertResult | null> {
  if (!supabase) return { error: "Supabase not configured" };
  if (!storeId || !masterProductId) return { error: "Missing store_id or master_product_id" };

  const { data: existing, error: selectErr } = await supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("master_product_id", masterProductId)
    .maybeSingle();

  if (selectErr) return { error: selectErr.message };

  if (existing?.id) {
    const updatePayload: any = { updated_at: new Date().toISOString() };
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

/** Fetch master_products full list from DB (id, name, image_url, base_price, etc.) */
export async function getMasterProductsFullFromDb(): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("master_products").select("*");
  if (error) return [];
  return (data ?? []) as any[];
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
