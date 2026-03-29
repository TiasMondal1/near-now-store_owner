-- =============================================================================
-- Custom products: allow anon (mobile app key) to INSERT categories + master_products
-- The store owner app uses the Supabase anon key without Supabase Auth; inserts go
-- directly from the client after ensureCategoryExists + master_products insert.
--
-- Run in Supabase SQL Editor if you see: "new row violates row-level security policy"
-- or "permission denied for table categories / master_products".
--
-- If these tables already had RLS enabled, add only the missing policies. If RLS was
-- OFF and you run ENABLE ROW LEVEL SECURITY, you must have SELECT/INSERT policies or
-- reads/writes will fail — this script adds typical anon read + insert policies.
-- =============================================================================

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select_anon" ON public.categories;
CREATE POLICY "categories_select_anon" ON public.categories
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "categories_insert_anon" ON public.categories;
CREATE POLICY "categories_insert_anon" ON public.categories
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "master_products_select_anon" ON public.master_products;
CREATE POLICY "master_products_select_anon" ON public.master_products
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "master_products_insert_anon" ON public.master_products;
CREATE POLICY "master_products_insert_anon" ON public.master_products
  FOR INSERT TO anon WITH CHECK (true);
