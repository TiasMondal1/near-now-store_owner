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
    .order("created_at", { ascending: true }); // Order by when they were added
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
): Promise<Array<{ id: string; name: string; quantity: number; storeProductId: string }>> {
  const rows = await getStoreProductsWithNames(storeId);
  return rows.map((r) => ({
    id: r.master_product_id,
    storeProductId: r.id, // This is the products table id
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
  if (!supabase) {
    console.error("[storeProducts] Supabase client not initialized");
    return { error: "Supabase not configured" };
  }
  if (!storeId || !masterProductId) {
    console.error("[storeProducts] Missing required fields", { storeId, masterProductId });
    return { error: "Missing store_id or master_product_id" };
  }
  const qty = Math.max(0, quantity);

  console.log("[storeProducts] upsertStoreProduct called", {
    storeId,
    masterProductId,
    quantity: qty,
  });

  // Check if product already exists
  const { data: existing, error: selectErr } = await supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("master_product_id", masterProductId)
    .maybeSingle();

  if (selectErr) {
    console.error("[storeProducts] select error:", selectErr);
    return { error: selectErr.message };
  }

  if (existing?.id) {
    console.log("[storeProducts] Updating existing product", existing.id);
    const { error: updateErr } = await supabase
      .from("products")
      .update({ quantity: qty, in_stock: qty > 0, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updateErr) {
      console.error("[storeProducts] update error:", updateErr.message, updateErr);
      return { error: updateErr.message };
    }
    console.log("[storeProducts] Successfully updated product", existing.id);
    return { id: existing.id };
  }

  // Insert new product
  const insertPayload = {
    store_id: storeId,
    master_product_id: masterProductId,
    quantity: qty,
    is_active: true,
    in_stock: qty > 0,
  };
  console.log("[storeProducts] Inserting new product", insertPayload);
  
  const { data: insertData, error: insertErr } = await supabase
    .from("products")
    .insert(insertPayload)
    .select("id")
    .single();
    
  if (insertErr) {
    console.error("[storeProducts] insert error:", {
      message: insertErr.message,
      code: insertErr.code,
      details: insertErr.details,
      hint: insertErr.hint,
    });
    return { error: insertErr.message };
  }
  
  if (insertData?.id) {
    console.log("[storeProducts] Successfully inserted product", insertData.id);
    return { id: insertData.id };
  }
  
  console.error("[storeProducts] No id returned after insert");
  return { error: "No id returned after insert" };
}

/** Update quantity (and in_stock) for an existing product row via backend API */
export async function updateStoreProductQuantity(
  productId: string,
  quantity: number
): Promise<boolean> {
  console.log("[updateStoreProductQuantity] START", { productId, quantity });
  
  const API_BASE = "http://192.168.0.111:3000"; // Match your config
  
  try {
    const qty = Math.max(0, quantity);
    console.log("[updateStoreProductQuantity] Calling backend API...");
    
    const response = await fetch(`${API_BASE}/store-owner/products/${productId}/quantity`, {
      method: "PATCH",
      headers: {
        "Authorization": "Bearer dummy-token", // You should pass real token
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ quantity: qty })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      console.error("[updateStoreProductQuantity] Backend error:", data);
      return false;
    }
    
    console.log("[updateStoreProductQuantity] SUCCESS via backend:", data.product);
    return true;
  } catch (error) {
    console.error("[updateStoreProductQuantity] Exception:", error);
    return false;
  }
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
