-- =============================================================================
-- Fix: column "quantity" of relation "products" does not exist
--
-- The store owner app only INSERTs custom items into master_products (not products).
-- If this trigger still runs on master_products INSERT, it must not reference removed
-- columns on products, or drop the trigger (see Option A).
--
-- After INSERT on master_products, trigger trg_populate_products_on_master_product_insert
-- runs function populate_products_on_master_product_insert(). If that function still
-- INSERTs a "quantity" column but you dropped it from public.products, Postgres errors
-- and the whole master_products insert is rolled back.
--
-- Run in Supabase → SQL Editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Option A — Quick: remove the trigger. The store owner app then links your store
-- to the new master row via upsertStoreProduct (store_id, master_product_id, is_active only).
-- New master rows are NOT auto-linked to every store.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_populate_products_on_master_product_insert ON public.master_products;


-- -----------------------------------------------------------------------------
-- Option B — Keep auto-linking: replace the function so it never references quantity.
-- Adjust column lists to match YOUR public.products table (only NOT NULL columns required).
-- This example links every store to the new master product (no quantity).
-- Uncomment and edit if you use Option B; comment out Option A above if you keep the trigger.
-- -----------------------------------------------------------------------------

/*
DROP TRIGGER IF EXISTS trg_populate_products_on_master_product_insert ON public.master_products;

CREATE OR REPLACE FUNCTION public.populate_products_on_master_product_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.products (store_id, master_product_id, is_active)
  SELECT s.id, NEW.id, true
  FROM public.stores AS s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.store_id = s.id
      AND p.master_product_id = NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_populate_products_on_master_product_insert
  AFTER INSERT ON public.master_products
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_products_on_master_product_insert();
*/

-- If your DB uses EXECUTE PROCEDURE instead of EXECUTE FUNCTION (older Postgres), use:
-- EXECUTE PROCEDURE public.populate_products_on_master_product_insert();
