-- =============================================================================
-- Invoices (Near & Now)
--
-- Goal:
-- - Generate a downloadable PDF invoice for a previous order.
-- - Numbering is sequential per store.
-- - PDF generation is done in a Supabase Edge Function (server-side).
--
-- NOTE:
-- The current store owner app uses the Supabase anon key without Supabase Auth.
-- So access control here follows the same pattern as `orders-rpc-and-rls.sql`:
-- - Use SECURITY DEFINER RPC for atomic invoice-number reservation.
-- - Allow anon/authenticated to call the RPC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Core tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.store_invoice_sequences (
  store_id uuid PRIMARY KEY,
  next_number bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  store_order_id uuid NOT NULL,
  customer_order_id uuid NULL,
  invoice_number text NOT NULL,
  pdf_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One invoice per store_order_id (for now)
  CONSTRAINT invoices_unique_store_order UNIQUE (store_order_id),
  CONSTRAINT invoices_unique_number_per_store UNIQUE (store_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS invoices_store_id_idx ON public.invoices (store_id);
CREATE INDEX IF NOT EXISTS invoices_store_order_id_idx ON public.invoices (store_order_id);

-- -----------------------------------------------------------------------------
-- 2) RPC: reserve_invoice_number(p_store_id uuid)
-- -----------------------------------------------------------------------------
-- Atomically increments `store_invoice_sequences.next_number` and returns:
-- - the reserved integer sequence
-- - a formatted invoice_number string
--
-- Format: NN-<first8-storeId>-000001
-- (Change formatting here if you want a different invoice number style.)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_invoice_number(p_store_id uuid)
RETURNS TABLE(seq bigint, invoice_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved bigint;
  store_tag text;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'p_store_id is required';
  END IF;

  INSERT INTO public.store_invoice_sequences (store_id, next_number)
  VALUES (p_store_id, 1)
  ON CONFLICT (store_id) DO NOTHING;

  UPDATE public.store_invoice_sequences
  SET next_number = next_number + 1,
      updated_at = now()
  WHERE store_id = p_store_id
  RETURNING (next_number - 1) INTO reserved;

  store_tag := upper(left(replace(p_store_id::text, '-', ''), 8));
  seq := reserved;
  invoice_number := 'NN-' || store_tag || '-' || lpad(reserved::text, 6, '0');
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_invoice_number(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.reserve_invoice_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_invoice_number(uuid) TO service_role;

COMMENT ON FUNCTION public.reserve_invoice_number(uuid) IS 'Atomically reserves next invoice number for a store (per-store sequence).';

-- -----------------------------------------------------------------------------
-- 3) Optional RLS
-- -----------------------------------------------------------------------------
-- If you later turn on RLS for invoices, add policies here.
-- For now, we keep it simple and avoid forcing RLS changes.
-- -----------------------------------------------------------------------------
