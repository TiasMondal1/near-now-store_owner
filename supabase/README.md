# Supabase migrations / SQL

## Orders (Previous Orders showing 0)

**Run this first so the store owner app can load orders:**

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/bfgqnsyriiuejvlqaylu/sql) (or your project’s SQL tab).
2. Open `orders-rpc-and-rls.sql` in this folder.
3. Copy its contents and run it in the SQL Editor.

This will:

- Create **`get_orders_for_store(p_store_id uuid)`**  
  - Joins **store_orders** → **customer_orders** (on `customer_order_id`) and **store_orders** → **order_items** (on `store_order_id`).  
  - Returns one JSON array of orders for the given store.  
  - Runs with **SECURITY DEFINER**, so it can read all three tables even if RLS would block direct SELECTs.

- Grant **anon** (and authenticated/service_role) **EXECUTE** on that function so the app can call it with the anon key.

After this, the app calls the RPC first; no RLS on `store_orders` / `customer_orders` / `order_items` is required for orders to load.

If you still see 0 orders, check:

- The store id you’re logged in with matches `store_orders.store_id` for at least one row.  
- There is at least one row in `store_orders` with that `store_id` and a matching `customer_orders` row.

### Optional: allow direct table reads (e.g. for realtime)

If you want the app to read `store_orders`, `customer_orders`, and `order_items` directly (e.g. for realtime subscriptions), uncomment the “Optional RLS” block at the bottom of `orders-rpc-and-rls.sql` and run it. That adds SELECT policies for **anon** on those tables. For production you may want to restrict by store ownership instead of `USING (true)`.
