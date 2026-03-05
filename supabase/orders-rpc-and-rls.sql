-- =============================================================================
-- Orders: RPC (links all tables, bypasses RLS) + optional RLS for direct access
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC: get_orders_for_store(p_store_id uuid)
-- Links: store_orders -> customer_orders (customer_order_id), store_orders -> order_items (store_order_id)
-- Runs as SECURITY DEFINER so it can read all three tables regardless of RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_orders_for_store(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Cast status to text so we never pass '' to enum order_status (avoids "invalid input value for enum order_status: """
  WITH base AS (
    SELECT
      so.id,
      so.store_id,
      so.customer_order_id,
      so.subtotal_amount,
      so.delivery_fee,
      so.created_at,
      so.status::text AS so_status,
      co.order_code,
      co.status::text AS co_status,
      co.placed_at,
      co.total_amount AS co_total_amount,
      co.delivered_at AS co_delivered_at,
      co.cancelled_at AS co_cancelled_at,
      (coalesce(so.subtotal_amount, 0) + coalesce(so.delivery_fee, 0)) AS store_total,
      (SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'product_name', coalesce(oi.product_name, 'Item'),
          'quantity', coalesce(oi.quantity, 0),
          'unit', coalesce(oi.unit, 'pcs'),
          'image_url', oi.image_url,
          'price', oi.unit_price
        )
      ), '[]'::jsonb) FROM order_items oi WHERE oi.store_order_id = so.id) AS order_items
    FROM store_orders so
    LEFT JOIN customer_orders co ON co.id = so.customer_order_id
    WHERE so.store_id = p_store_id
  ),
  with_status AS (
    SELECT
      b.*,
      CASE
        WHEN b.co_delivered_at IS NOT NULL THEN 'delivered'
        WHEN b.co_cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN lower(replace(coalesce(b.co_status, ''), '-', '_')) IN ('order_delivered', 'delivered', 'completed', 'cancelled', 'canceled', 'rejected') THEN
          CASE lower(replace(b.co_status, '-', '_'))
            WHEN 'order_delivered' THEN 'delivered' WHEN 'delivered' THEN 'delivered' WHEN 'completed' THEN 'delivered'
            WHEN 'cancelled' THEN 'cancelled' WHEN 'canceled' THEN 'cancelled' WHEN 'rejected' THEN 'rejected'
            ELSE coalesce(b.so_status, 'pending_store')
          END
        WHEN b.so_status IS NOT NULL AND lower(replace(b.so_status, '-', '_')) = 'pending_at_store' THEN 'pending_store'
        ELSE coalesce(b.so_status, 'pending_store')
      END AS resolved_status
    FROM base b
  )
  SELECT COALESCE(jsonb_agg(obj), '[]'::jsonb)
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'store_id', store_id,
      'customer_order_id', customer_order_id,
      'order_code', coalesce(order_code, 'ORD-' || left(id::text, 8)),
      'status', resolved_status,
      'total_amount', CASE WHEN store_total > 0 THEN store_total ELSE coalesce(co_total_amount, 0) END,
      'created_at', coalesce(created_at::text, placed_at::text, (now() AT TIME ZONE 'utc')::text),
      'order_items', order_items
    ) AS obj
    FROM with_status
    ORDER BY created_at DESC NULLS LAST
  ) AS ordered;

  RETURN result;
END;
$$;

-- Allow anon and authenticated to call the RPC (they must pass store_id; RLS is not applied inside the function)
GRANT EXECUTE ON FUNCTION public.get_orders_for_store(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_orders_for_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_for_store(uuid) TO service_role;

COMMENT ON FUNCTION public.get_orders_for_store(uuid) IS 'Returns orders for a store (store_orders + customer_orders + order_items). Use this from the store owner app to avoid RLS blocking reads.';

-- =============================================================================
-- 2. Optional RLS: allow reading store_orders, customer_orders, order_items
-- Uncomment below if you want direct table reads (e.g. realtime) in addition to RPC.
-- With anon key these policies allow SELECT for all rows. Restrict by store ownership in production.
-- =============================================================================

-- Enable RLS on tables (uncomment if your project has RLS enabled and these tables are blocked)
/*
ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read store_orders" ON store_orders;
CREATE POLICY "Allow anon read store_orders" ON store_orders FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read customer_orders" ON customer_orders;
CREATE POLICY "Allow anon read customer_orders" ON customer_orders FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read order_items" ON order_items;
CREATE POLICY "Allow anon read order_items" ON order_items FOR SELECT TO anon USING (true);
*/

-- If your schema links stores to users (e.g. stores.owner_id), restrict instead of USING (true):
-- CREATE POLICY "Store owners read own store_orders" ON store_orders FOR SELECT TO authenticated
--   USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));
