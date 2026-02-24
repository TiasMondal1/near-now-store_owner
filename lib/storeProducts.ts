/**
 * Store products: read/write the Supabase `products` table directly.
 * Ensures inventory and "Your stock" use the same DB source.
 */

import { supabase } from "./supabase";

export type StoreProductRow = {
  id: string;
  store_id: string;
  master_product_id: string;
  quantity: number;
  is_active?: boolean;
  in_stock?: boolean;
};

export type StoreProductWithName = StoreProductRow & { name: string };

/** Fetch all product rows for a store from the DB */
export async function getStoreProductsFromDb(
  storeId: string
): Promise<StoreProductRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("products")
    .select("id, store_id, master_product_id, quantity, is_active, in_stock")
    .eq("store_id", storeId)
    .order("quantity", { ascending: false });
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

/** Merge store products with master names for display */
export async function getStoreProductsWithNames(
  storeId: string
): Promise<StoreProductWithName[]> {
  const [storeRows, masterList] = await Promise.all([
    getStoreProductsFromDb(storeId),
    getMasterProductsFromDb(),
  ]);
  const nameByMasterId: Record<string, string> = {};
  masterList.forEach((m) => {
    nameByMasterId[m.id] = m.name ?? "Product";
  });
  return storeRows.map((row) => ({
    ...row,
    name: nameByMasterId[row.master_product_id] ?? "Product",
  }));
}

/** Your stock list: id, name, quantity for main page */
export async function getStockListFromDb(
  storeId: string
): Promise<Array<{ id: string; name: string; quantity: number }>> {
  const rows = await getStoreProductsWithNames(storeId);
  return rows.map((r) => ({
    id: r.master_product_id,
    name: r.name,
    quantity: Number(r.quantity ?? 0),
  }));
}

export type UpsertResult = { id: string } | { error: string };

/** Upsert one product row (store_id, master_product_id, quantity). Used when adding from inventory. */
export async function upsertStoreProduct(
  storeId: string,
  masterProductId: string,
  quantity: number
): Promise<UpsertResult | null> {
  if (!supabase) return { error: "Supabase not configured" };
  if (!storeId || !masterProductId) return { error: "Missing store_id or master_product_id" };
  const payload = {
    store_id: storeId,
    master_product_id: masterProductId,
    quantity: Math.max(0, quantity),
    is_active: true,
    in_stock: quantity > 0,
  };
  const { data, error } = await supabase
    .from("products")
    .upsert(payload, { onConflict: "store_id,master_product_id" })
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[storeProducts] upsert error:", error.message, error.code, error.details);
    return { error: error.message };
  }
  if (data?.id) return { id: data.id };
  const byId = await supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("master_product_id", masterProductId)
    .maybeSingle();
  if (byId.data?.id) return { id: byId.data.id };
  if (byId.error) return { error: byId.error.message };
  return { error: "No row returned after upsert" };
}

/** Update quantity (and in_stock) for an existing product row */
export async function updateStoreProductQuantity(
  productId: string,
  quantity: number
): Promise<boolean> {
  if (!supabase) return false;
  const qty = Math.max(0, quantity);
  const { error } = await supabase
    .from("products")
    .update({ quantity: qty, in_stock: qty > 0 })
    .eq("id", productId);
  return !error;
}

/** Fetch master_products full list from DB (id, name, image_url, base_price, etc.) */
export async function getMasterProductsFullFromDb(): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("master_products").select("*");
  if (error) return [];
  return (data ?? []) as any[];
}

/**
 * Get merged inventory list from DB: all master_products with quantity and storeProductId from products table.
 * Use this for Inventory screen so it reads from DB.
 */
export async function getMergedInventoryFromDb(storeId: string): Promise<any[]> {
  const [masterList, storeRows] = await Promise.all([
    getMasterProductsFullFromDb(),
    getStoreProductsFromDb(storeId),
  ]);
  if (!Array.isArray(masterList)) return [];
  const byMasterId: Record<string, { id: string; quantity: number }> = {};
  storeRows.forEach((r) => {
    byMasterId[r.master_product_id] = { id: r.id, quantity: Number(r.quantity ?? 0) };
  });
  return masterList.map((mp: any) => {
    const row = byMasterId[mp.id];
    return {
      ...mp,
      price: mp.base_price ?? mp.price,
      quantity: row ? row.quantity : 0,
      storeProductId: row?.id ?? null,
    };
  });
}
