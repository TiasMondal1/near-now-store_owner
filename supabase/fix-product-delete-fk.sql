-- Soft delete for store products: add deleted_at column to products table.
--
-- This lets store owners "delete" a product from their stock without removing
-- the row from the DB. order_items.product_id keeps pointing to the real row,
-- so order history is fully preserved with the original product reference.
--
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index speeds up the IS NULL filter used in all active-product queries
CREATE INDEX IF NOT EXISTS idx_products_not_deleted
  ON products(store_id, deleted_at)
  WHERE deleted_at IS NULL;
