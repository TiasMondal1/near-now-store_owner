import {
  isShopkeeperAppRole,
  normalizeToShopkeeperRole,
} from "../lib/shopkeeperRole";

describe("isShopkeeperAppRole", () => {
  it("accepts the shopkeeper role (case/whitespace insensitive)", () => {
    expect(isShopkeeperAppRole("shopkeeper")).toBe(true);
    expect(isShopkeeperAppRole("SHOPKEEPER")).toBe(true);
    expect(isShopkeeperAppRole("  Shopkeeper  ")).toBe(true);
  });

  it("rejects other roles and empty values", () => {
    expect(isShopkeeperAppRole("customer")).toBe(false);
    expect(isShopkeeperAppRole("delivery_partner")).toBe(false);
    expect(isShopkeeperAppRole("")).toBe(false);
    expect(isShopkeeperAppRole(null)).toBe(false);
    expect(isShopkeeperAppRole(undefined)).toBe(false);
  });
});

describe("normalizeToShopkeeperRole", () => {
  it("always returns 'shopkeeper' regardless of input", () => {
    expect(normalizeToShopkeeperRole("customer")).toBe("shopkeeper");
    expect(normalizeToShopkeeperRole(null)).toBe("shopkeeper");
    expect(normalizeToShopkeeperRole(undefined)).toBe("shopkeeper");
  });
});
