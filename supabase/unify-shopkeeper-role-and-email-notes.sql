-- Run in Supabase SQL editor (or migrate) once to align data with the store-owner app.
-- App and API should use role = 'shopkeeper' only going forward.

-- 1) Unify legacy role name (adjust table/column names if yours differ)
-- If `role` is an enum that includes both values, keep enum as-is but store only 'shopkeeper'.
UPDATE public.app_users
SET role = 'shopkeeper'
WHERE lower(trim(role::text)) IN ('store_owner', 'store-owner', 'shop_owner');

-- 2) Optional: clear placeholder emails so users can re-save a real address from the app
-- Uncomment if your shopkeeper profile / user table literally stored the string "invalid"
/*
UPDATE public.shopkeeper_profiles
SET email = NULL
WHERE lower(trim(coalesce(email::text, ''))) = 'invalid';

UPDATE public.app_users
SET email = NULL
WHERE lower(trim(coalesce(email::text, ''))) = 'invalid';
*/

-- Replace table names above with your actual schema if different (e.g. profiles, users).
