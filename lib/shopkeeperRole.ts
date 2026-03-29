/**
 * Single role for this app in the DB should be `shopkeeper`.
 * Some backends still return or stored `store_owner` — normalize everywhere in the client.
 */
const LEGACY_ALIASES = new Set(["store_owner", "store-owner", "shop_owner"]);

/** Use after login/signup succeeded for this app. Maps legacy DB values to `shopkeeper`. */
export function normalizeToShopkeeperRole(role: string | undefined | null): "shopkeeper" {
  const r = (role ?? "").trim().toLowerCase();
  if (LEGACY_ALIASES.has(r)) return "shopkeeper";
  return "shopkeeper";
}

/** True if this JWT/user row is allowed to use the shopkeeper app (login path). */
export function isShopkeeperAppRole(role: string | undefined | null): boolean {
  const r = (role ?? "").trim().toLowerCase();
  return r === "shopkeeper" || LEGACY_ALIASES.has(r);
}
