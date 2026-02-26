-- Reset stores and products (e.g. after 58k junk records). Run in Supabase SQL Editor.
-- WARNING: This removes ALL stores and ALL product rows. Back up if needed, then run.

-- Order matters: products references stores
TRUNCATE products;
TRUNCATE stores;

-- Alternative: single statement (also truncates any other tables that reference stores)
-- TRUNCATE stores CASCADE;
