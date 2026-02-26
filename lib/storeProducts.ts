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

/** Insert or update one product row. Used when adding from inventory. */
export async function upsertStoreProduct(
  storeId: string,
  masterProductId: string,
  quantity: number
): Promise<UpsertResult | null> {
  if (!supabase) return { error: "Supabase not configured" };
  if (!storeId || !masterProductId) return { error: "Missing store_id or master_product_id" };
  const qty = Math.max(0, quantity);

  const existing = await supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("master_product_id", masterProductId)
    .maybeSingle();

  if (existing.data?.id) {
    const { error: updateErr } = await supabase
      .from("products")
      .update({ quantity: qty, in_stock: qty > 0 })
      .eq("id", existing.data.id);
    if (updateErr) {
      console.warn("[storeProducts] update error:", updateErr.message);
      return { error: updateErr.message };
    }
    return { id: existing.data.id };
  }

  const insertPayload = {
    store_id: storeId,
    master_product_id: masterProductId,
    quantity: qty,
    is_active: true,
    in_stock: qty > 0,
  };
  if (typeof (global as any).__DEV__ !== "undefined" && (global as any).__DEV__) {
    console.log("[storeProducts] insert payload", { store_id: storeId, master_product_id: masterProductId, quantity: qty });
  }
  const { data: insertData, error: insertErr } = await supabase
    .from("products")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();
  if (insertErr) {
    console.warn("[storeProducts] insert error:", insertErr.message, insertErr.code, insertErr.details);
    return { error: insertErr.message };
  }
  if (insertData?.id) return { id: insertData.id };
  return { error: "No id returned after insert" };
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
