/**
 * Store-owner app users must have role `shopkeeper` in app_users.
 * Domain roles: customer | delivery_partner | shopkeeper only.
 */

/** Use after login/signup succeeded for this app. */
export function normalizeToShopkeeperRole(_role: string | undefined | null): "shopkeeper" {
  return "shopkeeper";
}

/** True if this user may use the shopkeeper portal. */
export function isShopkeeperAppRole(role: string | undefined | null): boolean {
  return (role ?? "").trim().toLowerCase() === "shopkeeper";
}
