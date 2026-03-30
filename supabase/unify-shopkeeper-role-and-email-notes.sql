-- Run once if any legacy rows used the old label before backend used shopkeeper only.
-- Allowed roles: customer, delivery_partner, shopkeeper.
-- See also: near-and-now/supabase/migrate-app-users-store-owner-to-shopkeeper.sql

UPDATE public.app_users
SET role = 'shopkeeper'::user_role
WHERE role::text = 'store_owner';
