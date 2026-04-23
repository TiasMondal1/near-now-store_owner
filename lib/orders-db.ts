/**
 * Fetch orders for the store owner app from Supabase.
 * Schema: store_orders (subtotal_amount, delivery_fee, status), customer_orders (order_code, placed_at),
 * order_items (store_order_id, unit_price). Status mapping: pending_at_store -> pending_store, order_delivered -> delivered.
 */

import { supabase } from "./supabase";

export type StoreOrderRow = {
  id: string;
  store_id: string;
  customer_order_id: string;
  status?: string;
  subtotal_amount?: number;
  delivery_fee?: number;
  created_at?: string;
  [key: string]: any;
};

/** Map DB status (store_orders or customer_orders) to app status. Only pending_* = active; rest = Previous. */
function mapOrderStatus(dbStatus: string | undefined): string {
  if (dbStatus == null || dbStatus === "") return "pending_store";
  const s = String(dbStatus).toLowerCase().replace(/-/g, "_").trim();
  if (s === "pending_at_store") return "pending_store";
  if (s === "order_delivered" || s === "delivered" || s === "completed") return "delivered";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "accepted" || s === "accepted_by_store") return "accepted";
  if (s === "ready" || s === "ready_for_pickup" || s === "ready_for_delivery") return "ready";
  if (s === "rejected") return "rejected";
  return dbStatus;
}

/** Resolve display status: use customer_order or store_orders timestamps/status so Previous Orders gets completed orders. */
function resolveStatus(so: StoreOrderRow, co: CustomerOrderRow | null): string {
  if ((so as any).delivered_at) return "delivered";
  if ((so as any).cancelled_at) return "cancelled";
  const coRaw = co?.status != null ? String(co.status) : "";
  const coStatus = coRaw.toLowerCase().replace(/-/g, "_").trim();
  const soStatus = so.status != null ? String(so.status).toLowerCase().replace(/-/g, "_").trim() : "";
  const completed = ["order_delivered", "delivered", "completed", "cancelled", "canceled", "rejected"];
  if (completed.includes(coStatus)) return mapOrderStatus(co?.status);
  if ((co as any)?.delivered_at) return "delivered";
  if ((co as any)?.cancelled_at) return "cancelled";
  if (soStatus) return mapOrderStatus(so.status);
  return mapOrderStatus(co?.status ?? so.status);
}

export type CustomerOrderRow = {
  id: string;
  order_code?: string;
  status?: string;
  total_amount?: number;
  placed_at?: string;
  [key: string]: any;
};

export type OrderItemRow = {
  id: string;
  store_order_id: string;
  product_name: string;
  unit?: string | null;
  image_url?: string | null;
  unit_price: number;
  quantity: number;
  subtotal?: number;
  [key: string]: any;
};

export type OrderForStore = {
  id: string;
  order_code: string;
  status: string;
  total_amount: number;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit: string;
    image_url?: string;
    price?: number;
  }>;
  /** Store id from store_orders (linked table). */
  store_id?: string;
  /** Customer order id from customer_orders (linked table). */
  customer_order_id?: string;
  [key: string]: any;
};

/**
 * Fallback: fetch orders by querying customer_orders and linking store_orders where store_id matches.
 * Use when store_orders filtered by store_id returns 0 (e.g. different store id source).
 */
async function getOrdersFromDbViaCustomerOrders(storeId: string): Promise<OrderForStore[]> {
  if (!supabase || !storeId) return [];

  const { data: coRows, error } = await supabase
    .from("customer_orders")
    .select("*, store_orders!inner(*)")
    .eq("store_orders.store_id", storeId)
    .order("placed_at", { ascending: false });

  if (error) {
    console.warn("[orders-db] customer_orders fallback error:", error.message);
    return [];
  }

  const rows = (coRows ?? []) as (CustomerOrderRow & { store_orders?: StoreOrderRow | StoreOrderRow[] | null })[];
  const pairs: { so: StoreOrderRow; co: CustomerOrderRow }[] = [];

  for (const row of rows) {
    const rel = row.store_orders;
    const list = Array.isArray(rel) ? rel : rel ? [rel] : [];
    const so = list.find((s) => s.store_id === storeId);
    if (so) pairs.push({ so, co: row });
  }

  if (pairs.length === 0) return [];

  const storeOrderIds = pairs.map((p) => p.so.id);
  const { data: itemsData } = await supabase
    .from("order_items")
    .select("*")
    .in("store_order_id", storeOrderIds);
  const allItems = (itemsData ?? []) as OrderItemRow[];
  const itemsByStoreOrderId: Record<string, OrderItemRow[]> = {};
  allItems.forEach((item) => {
    const sid = item.store_order_id;
    if (!itemsByStoreOrderId[sid]) itemsByStoreOrderId[sid] = [];
    itemsByStoreOrderId[sid].push(item);
  });

  return pairs.map(({ so, co }) => {
    const rawItems = itemsByStoreOrderId[so.id] ?? [];
    const order_items = rawItems.map((it) => ({
      id: it.id,
      product_name: it.product_name || "Item",
      quantity: Number(it.quantity ?? 0),
      unit: it.unit ?? "pcs",
      image_url: it.image_url ?? undefined,
      price: it.unit_price != null ? Number(it.unit_price) : undefined,
    }));
    const storeTotal = Number(so.subtotal_amount ?? 0) + Number(so.delivery_fee ?? 0);
    const status = resolveStatus(so, co);
    return {
      ...so,
      id: so.id,
      order_code: co?.order_code ?? `ORD-${String(so.id).slice(0, 8)}`,
      status,
      total_amount: storeTotal > 0 ? storeTotal : Number(co?.total_amount ?? 0),
      created_at: so.created_at ?? co?.placed_at ?? new Date().toISOString(),
      order_items,
      store_id: so.store_id,
      customer_order_id: so.customer_order_id ?? co?.id,
    } as OrderForStore;
  });
}

/**
 * Fetch orders via RPC (links store_orders + customer_orders + order_items in DB; bypasses RLS).
 * Falls back to direct table queries then API if RPC is missing or fails.
 */
export async function getOrdersFromDb(storeId: string): Promise<OrderForStore[]> {
  if (!supabase || !storeId) return [];

  const fromRpc = await getOrdersFromDbViaRpc(storeId);
  if (fromRpc.length > 0) return fromRpc;

  return getOrdersFromDbViaTables(storeId);
}

/**
 * RPC get_orders_for_store(p_store_id) — run supabase/orders-rpc-and-rls.sql in Supabase SQL Editor.
 * Links all tables server-side (SECURITY DEFINER), so no RLS blocking.
 */
async function getOrdersFromDbViaRpc(storeId: string): Promise<OrderForStore[]> {
  if (!supabase || !storeId) return [];

  const { data, error } = await supabase.rpc("get_orders_for_store", { p_store_id: storeId });

  if (error) {
    if (error.code !== "42883") console.warn("[orders-db] RPC get_orders_for_store error:", error.message);
    return [];
  }

  if (data == null) return [];
  // RPC returns single jsonb array; Supabase may give us the array or one row containing it
  let raw: any[] = [];
  if (Array.isArray(data)) {
    raw = data.length > 0 && typeof data[0] === "object" && data[0] != null && "order_items" in data[0] ? data : Array.isArray(data[0]) ? data[0] : [];
  } else if (data && typeof data === "object" && "order_items" in (data as any)) {
    raw = [data];
  }

  return raw.map((row) => ({
    id: row.id,
    order_code: row.order_code ?? `ORD-${String(row.id).slice(0, 8)}`,
    status: row.status ?? "pending_store",
    total_amount: Number(row.total_amount ?? 0),
    created_at: row.created_at ?? new Date().toISOString(),
    order_items: Array.isArray(row.order_items) ? row.order_items.map((it: any) => ({
      id: it.id,
      product_name: it.product_name ?? "Item",
      quantity: Number(it.quantity ?? 0),
      unit: it.unit ?? "pcs",
      image_url: it.image_url,
      price: it.unit_price != null ? Number(it.unit_price) : undefined,
    })) : [],
    store_id: row.store_id,
    customer_order_id: row.customer_order_id,
  })) as OrderForStore[];
}

/**
 * Direct table reads (can be blocked by RLS). Links: store_orders -> customer_orders, store_orders -> order_items.
 */
async function getOrdersFromDbViaTables(storeId: string): Promise<OrderForStore[]> {
  if (!supabase || !storeId) return [];

  const { data: storeOrdersData, error: soError } = await supabase
    .from("store_orders")
    .select("id, store_id, customer_order_id, status, subtotal_amount, delivery_fee, created_at, delivered_at, cancelled_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (soError) {
    console.warn("[orders-db] store_orders error:", soError.message);
    return [];
  }

  let storeOrders = (storeOrdersData ?? []) as StoreOrderRow[];

  // Fallback: if no store_orders for this store_id, try other ways to get orders
  if (storeOrders.length === 0) {
    const linked = await getOrdersFromDbViaCustomerOrders(storeId);
    if (linked.length > 0) {
      return linked;
    }
    // Fallback 2: store_id format/case mismatch — fetch recent rows and match in JS.
    // Scoped to last 90 days and capped at 100 rows to limit payload.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allRows, error: allErr } = await supabase
      .from("store_orders")
      .select("id, store_id, customer_order_id, status, subtotal_amount, delivery_fee, created_at, delivered_at, cancelled_at")
      .gte("created_at", ninetyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!allErr && Array.isArray(allRows) && allRows.length > 0) {
      const storeIdStr = String(storeId).toLowerCase().trim();
      const matched = (allRows as StoreOrderRow[]).filter(
        (so) => so.store_id && (String(so.store_id).toLowerCase().trim() === storeIdStr || so.store_id === storeId)
      );
      if (matched.length > 0) {
        storeOrders = matched;
        // continue below to fetch customer_orders and items
      } else {
        if (__DEV__) console.warn("[orders-db] store_orders exist but none for store_id=" + storeId);
        return [];
      }
    } else {
      if (__DEV__ && allRows?.length) {
        console.warn("[orders-db] store_orders exist but none for store_id=" + storeId);
      }
      return [];
    }
  }

  const customerOrderIds = [...new Set(storeOrders.map((so) => so.customer_order_id).filter(Boolean))];
  const customerOrdersMap: Record<string, CustomerOrderRow> = {};
  if (customerOrderIds.length > 0) {
    const { data: coData, error: coError } = await supabase
      .from("customer_orders")
      .select("id, order_code, status, total_amount, placed_at, delivered_at, cancelled_at")
      .in("id", customerOrderIds);
    if (!coError && Array.isArray(coData)) {
      (coData as CustomerOrderRow[]).forEach((co) => {
        customerOrdersMap[co.id] = co;
      });
    }
  }

  const storeOrderIds = storeOrders.map((so) => so.id);
  const { data: itemsData, error: itemsError } = await supabase
    .from("order_items")
    .select("id, store_order_id, product_name, unit, image_url, unit_price, quantity")
    .in("store_order_id", storeOrderIds);

  if (itemsError) {
    console.warn("[orders-db] order_items error:", itemsError.message);
  }

  const allItems = (itemsData ?? []) as OrderItemRow[];
  const itemsByStoreOrderId: Record<string, OrderItemRow[]> = {};
  allItems.forEach((item) => {
    const sid = item.store_order_id;
    if (!itemsByStoreOrderId[sid]) itemsByStoreOrderId[sid] = [];
    itemsByStoreOrderId[sid].push(item);
  });

  return storeOrders.map((so) => {
    const co = so.customer_order_id ? customerOrdersMap[so.customer_order_id] : null;
    const rawItems = itemsByStoreOrderId[so.id] ?? [];
    const order_items = rawItems.map((it) => ({
      id: it.id,
      product_name: it.product_name || "Item",
      quantity: Number(it.quantity ?? 0),
      unit: it.unit ?? "pcs",
      image_url: it.image_url ?? undefined,
      price: it.unit_price != null ? Number(it.unit_price) : undefined,
    }));
    const storeTotal = Number(so.subtotal_amount ?? 0) + Number(so.delivery_fee ?? 0);
    const status = resolveStatus(so, co ?? null);
    return {
      ...so,
      id: so.id,
      order_code: co?.order_code ?? `ORD-${String(so.id).slice(0, 8)}`,
      status,
      total_amount: storeTotal > 0 ? storeTotal : Number(co?.total_amount ?? 0),
      created_at: so.created_at ?? co?.placed_at ?? new Date().toISOString(),
      order_items,
      store_id: so.store_id,
      customer_order_id: so.customer_order_id ?? undefined,
    } as OrderForStore;
  });
}

/** Fetch a single store_order with items (for order details modal). */
export async function getOrderByIdFromDb(orderId: string): Promise<OrderForStore | null> {
  if (!supabase || !orderId) return null;

  const { data: storeOrderData, error: soError } = await supabase
    .from("store_orders")
    .select("id, store_id, customer_order_id, status, subtotal_amount, delivery_fee, created_at, delivered_at, cancelled_at")
    .eq("id", orderId)
    .maybeSingle();

  if (soError || !storeOrderData) {
    if (soError) console.warn("[orders-db] getOrderByIdFromDb error:", soError.message);
    return null;
  }

  const so = storeOrderData as StoreOrderRow;

  let co: CustomerOrderRow | null = null;
  if (so.customer_order_id) {
    const { data: coData } = await supabase
      .from("customer_orders")
      .select("id, order_code, status, total_amount, placed_at, delivered_at, cancelled_at")
      .eq("id", so.customer_order_id)
      .maybeSingle();
    co = coData as CustomerOrderRow | null;
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from("order_items")
    .select("id, store_order_id, product_name, unit, image_url, unit_price, quantity")
    .eq("store_order_id", orderId);

  if (itemsError) {
    console.warn("[orders-db] getOrderByIdFromDb order_items error:", itemsError.message);
  }

  const rawItems = (itemsData ?? []) as OrderItemRow[];
  const order_items = rawItems.map((it) => ({
    id: it.id,
    product_name: it.product_name || "Item",
    quantity: Number(it.quantity ?? 0),
    unit: it.unit ?? "pcs",
    image_url: it.image_url ?? undefined,
    price: it.unit_price != null ? Number(it.unit_price) : undefined,
  }));

  const storeTotal = Number(so.subtotal_amount ?? 0) + Number(so.delivery_fee ?? 0);
  const status = resolveStatus(so, co ?? null);
  return {
    ...so,
    id: so.id,
    order_code: co?.order_code ?? `ORD-${String(so.id).slice(0, 8)}`,
    status,
    total_amount: storeTotal > 0 ? storeTotal : Number(co?.total_amount ?? 0),
    created_at: so.created_at ?? co?.placed_at ?? new Date().toISOString(),
    order_items,
  } as OrderForStore;
}
