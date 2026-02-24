-- RLS for products (and master_products read) so the store-owner app can read/write from Supabase client (anon key).
-- Run in Supabase SQL Editor if the app gets "permission denied" or empty results.

-- Ensure anon can use the tables (required for RLS to apply)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.master_products TO anon;
GRANT SELECT, INSERT, UPDATE ON public.products TO anon;

-- Allow anon to read master_products (catalog)
ALTER TABLE IF EXISTS public.master_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_master_products" ON public.master_products;
CREATE POLICY "anon_read_master_products"
  ON public.master_products FOR SELECT
  TO anon
  USING (true);

-- Allow anon to read and write products (store stock)
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_products" ON public.products;
DROP POLICY IF EXISTS "anon_select_products" ON public.products;
DROP POLICY IF EXISTS "anon_insert_products" ON public.products;
DROP POLICY IF EXISTS "anon_update_products" ON public.products;
CREATE POLICY "anon_select_products" ON public.products FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_products" ON public.products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_products" ON public.products FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- For production you should restrict by auth (e.g. only allow rows where store_id matches the authenticated store owner).
-- Example: USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));
