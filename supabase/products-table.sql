-- Products table (current schema in Supabase)
-- This file documents the existing table. Do not run as a migration if the table already exists.

-- Table: public.products
-- Store-level availability and stock, linked to stores.id. Filled when store owner
-- sets quantity in Inventory or adds from Catalog.

CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  master_product_id uuid NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  in_stock boolean NULL DEFAULT true,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT unique_store_product UNIQUE (store_id, master_product_id),
  CONSTRAINT products_master_product_id_fkey FOREIGN KEY (master_product_id) REFERENCES master_products(id) ON DELETE RESTRICT,
  CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT products_quantity_check CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_products_master_product_id ON public.products USING btree (master_product_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_products_store_active ON public.products USING btree (store_id, is_active) WHERE (is_active = true);

-- Trigger: update updated_at on row update (requires update_updated_at_column() to exist)
-- CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
