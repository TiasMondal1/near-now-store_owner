/**
 * Store product names (lib/storeProducts.ts getStoreProductsWithNames).
 *
 * 2026-10-27: products.name is filled by a DB trigger with the *store's* name.
 * When a product's catalogue join came back empty, the list showed the store's
 * name as the product's. The fallback is now a plain "Product", and the
 * owner's phone (previously copied onto every products row) is no longer read.
 */
const mockSelect = jest.fn();
jest.mock("../lib/supabase", () => {
  const chain: any = {};
  chain.select = (cols: string) => { mockSelect(cols); return chain; };
  chain.eq = () => chain;
  chain.is = () => chain;
  chain.order = () =>
    Promise.resolve({
      data: [
        { id: "p1", store_id: "s1", master_product_id: "m1", is_active: true, name: "Alam Stors", master_products: { name: "Tata Salt", unit: "1kg", is_loose: false, image_url: null } },
        { id: "p2", store_id: "s1", master_product_id: "m2", is_active: true, name: "Alam Stors", master_products: null },
      ],
      error: null,
    });
  return { supabase: { from: () => chain } };
});
jest.mock("../lib/config", () => ({ config: { API_BASE: "https://api.test" } }));
jest.mock("../lib/selectedStore", () => ({ loadSelectedStoreId: jest.fn(async () => null) }));

import { getStoreProductsWithNames } from "../lib/storeProducts";

describe("getStoreProductsWithNames", () => {
  it("names products from the catalogue, never from the store name on the row", async () => {
    const rows = await getStoreProductsWithNames("s1");
    expect(rows.map((r) => r.name)).toEqual(["Tata Salt", "Product"]);
  });

  it("does not read the phone column", async () => {
    await getStoreProductsWithNames("s1");
    for (const [cols] of mockSelect.mock.calls) expect(cols).not.toMatch(/\bphone\b/);
  });
});
