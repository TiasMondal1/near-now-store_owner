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
  quantity: number;
  is_active?: boolean;
  in_stock?: boolean;
  name?: string;
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

/**
 * Get store products with names. Tries joined query first (master_products.name),
 * then falls back to two-query merge. Uses products.name if present (e.g. custom products).
 */
export async function getStoreProductsWithNames(
  storeId: string
): Promise<StoreProductWithName[]> {
  if (!supabase) return [];

  const joinSelects = [
    "id, store_id, master_product_id, quantity, is_active, in_stock, master_products(name)",
    "id, store_id, master_product_id, quantity, is_active, in_stock, master_product(name)",
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
        const name = (fromMaster && String(fromMaster).trim()) || "Product";
        const { master_products, master_product, ...rest } = row;
        return { ...rest, name };
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

/** Your stock list: id, name, quantity, is_active for main page */
export async function getStockListFromDb(
  storeId: string
): Promise<Array<{ id: string; name: string; quantity: number; storeProductId: string; is_active: boolean }>> {
  const rows = await getStoreProductsWithNames(storeId);
  return rows.map((r) => {
    const rawName = r.name ?? (r as any).product_name;
    const name = (rawName && String(rawName).trim()) ? String(rawName).trim() : "Product";
    return {
      id: r.master_product_id,
      storeProductId: r.id,
      name,
      quantity: Number(r.quantity ?? 0),
      is_active: r.is_active !== false,
    };
  });
}

export type UpsertResult = { id: string } | { error: string };

/** Insert or update one product row. Quantity always defaults to 100 for new products. */
export async function upsertStoreProduct(
  storeId: string,
  masterProductId: string,
  quantity: number = 100
): Promise<UpsertResult | null> {
  if (!supabase) {
    console.error("[storeProducts] Supabase client not initialized");
    return { error: "Supabase not configured" };
  }
  if (!storeId || !masterProductId) {
    console.error("[storeProducts] Missing required fields", { storeId, masterProductId });
    return { error: "Missing store_id or master_product_id" };
  }
  // New products always start with qty 100 (active)
  const qty = Math.max(0, quantity === 0 ? 100 : quantity);

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
  
  const API_BASE = config.API_BASE;
  
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

/**
 * Toggle a product's active state.
 * Active   → is_active=true,  quantity=100, in_stock=true
 * Inactive → is_active=false, quantity=0,   in_stock=false
 * Uses Supabase first; if that fails and token is provided, falls back to backend API.
 */
export async function updateProductActiveState(
  storeProductId: string,
  isActive: boolean,
  authToken?: string | null
): Promise<boolean> {
  const quantity = isActive ? 100 : 0;

  if (supabase) {
    const { error } = await supabase
      .from("products")
      .update({
        is_active: isActive,
        quantity,
        in_stock: isActive,
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
        body: JSON.stringify({ is_active: isActive, quantity }),
      });
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      if (res.ok && (data.success !== false)) return true;
      const res2 = await fetch(`${config.API_BASE}/store-owner/products/${storeProductId}/quantity`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quantity }),
      });
      const data2 = res2.ok ? await res2.json().catch(() => ({})) : {};
      if (res2.ok && (data2.success !== false)) return true;
    } catch (e) {
      console.warn("[updateProductActiveState] API fallback error:", e);
    }
  }

  return false;
}

/**
 * When store goes offline: set quantity=0 and in_stock=false for all store products.
 * Preserves is_active flags so they can be restored when coming back online.
 */
export async function setAllProductsOffline(storeId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("products")
    .update({ quantity: 0, in_stock: false, updated_at: new Date().toISOString() })
    .eq("store_id", storeId);
  if (error) {
    console.error("[setAllProductsOffline] error:", error.message);
    return false;
  }
  return true;
}

/**
 * When store comes online: restore quantity=100 / in_stock=true for all is_active products.
 */
export async function restoreActiveProductsOnline(storeId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("products")
    .update({ quantity: 100, in_stock: true, updated_at: new Date().toISOString() })
    .eq("store_id", storeId)
    .eq("is_active", true);
  if (error) {
    console.error("[restoreActiveProductsOnline] error:", error.message);
    return false;
  }
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
      name: mp.name ?? mp.product_name ?? "Product",
      price: mp.base_price ?? mp.price,
      quantity: row ? row.quantity : 0,
      storeProductId: row?.id ?? null,
    };
  });
}
