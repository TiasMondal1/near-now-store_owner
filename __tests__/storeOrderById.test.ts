/**
 * Invoice screen data (lib/orders-db getStoreOrderById).
 *
 * 2026-10-12: the invoice read store_orders / order_items straight from
 * Supabase; once those tables became service-role only every invoice said
 * "Order not found". It now comes from GET /shopkeeper/store-orders/:id.
 */
const mockGet = jest.fn();
jest.mock("../lib/api-client", () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock("../lib/supabase", () => ({ supabase: null }));

import { getStoreOrderById } from "../lib/orders-db";

const SO = {
  id: "so-1",
  store_id: "s1",
  customer_order_id: "co-1",
  status: "order_delivered",
  subtotal_amount: 90,
  delivery_fee: 0,
  created_at: "2026-10-12T10:01:00Z",
  delivered_at: "2026-10-12T10:40:00Z",
  cancelled_at: null,
};
const CO = { id: "co-1", order_code: "NN20261012-0001", status: "order_delivered", total_amount: 150, placed_at: "2026-10-12T10:00:00Z" };
const ITEMS = [
  { id: "i1", store_order_id: "so-1", product_name: "Rice", unit: "1kg", image_url: null, unit_price: 60, quantity: 1 },
  { id: "i2", store_order_id: "so-1", product_name: "Dal", unit: "500g", image_url: null, unit_price: 15, quantity: 2 },
];

beforeEach(() => mockGet.mockReset());

it("maps the endpoint's rows exactly as the old direct read did", async () => {
  mockGet.mockResolvedValue({ success: true, data: { success: true, store_order: SO, customer_order: CO, items: ITEMS } });
  const order = await getStoreOrderById("so-1", "tok", ["s1"]);

  expect(mockGet).toHaveBeenCalledWith("/shopkeeper/store-orders/so-1", { Authorization: "Bearer tok" });
  expect(order).toMatchObject({
    id: "so-1",
    store_id: "s1",
    order_code: "NN20261012-0001",
    status: "delivered",
    total_amount: 90, // the store's subtotal, not the whole customer order
    placed_at: "2026-10-12T10:00:00Z",
    order_items: [
      { id: "i1", product_name: "Rice", quantity: 1, unit: "1kg", price: 60 },
      { id: "i2", product_name: "Dal", quantity: 2, unit: "500g", price: 15 },
    ],
  });
});

it("no such order for this shopkeeper (404 / 403, or an older backend): null", async () => {
  mockGet.mockResolvedValueOnce({ success: false, status: 404, error: "Order not found" });
  expect(await getStoreOrderById("so-1", "tok", ["s1"])).toBeNull();
  mockGet.mockResolvedValueOnce({ success: false, status: 403, error: "No store found" });
  expect(await getStoreOrderById("so-1", "tok", ["s1"])).toBeNull();
});

it("a server or network failure throws, so the screen offers a retry", async () => {
  mockGet.mockResolvedValueOnce({ success: false, status: 500, error: "Could not load the order" });
  await expect(getStoreOrderById("so-1", "tok", ["s1"])).rejects.toThrow("Could not load the order");
  mockGet.mockResolvedValueOnce({ success: false, error: "Request timeout" });
  await expect(getStoreOrderById("so-1", "tok", ["s1"])).rejects.toThrow("Request timeout");
});

it("an order for a store that isn't the shopkeeper's is not shown", async () => {
  mockGet.mockResolvedValue({ success: true, data: { success: true, store_order: { ...SO, store_id: "other" }, customer_order: CO, items: ITEMS } });
  expect(await getStoreOrderById("so-1", "tok", ["s1"])).toBeNull();
});

it("no stores, no token or no id: null without a request", async () => {
  expect(await getStoreOrderById("so-1", "tok", [])).toBeNull();
  expect(await getStoreOrderById("so-1", "", ["s1"])).toBeNull();
  expect(await getStoreOrderById("", "tok", ["s1"])).toBeNull();
  expect(mockGet).not.toHaveBeenCalled();
});

it("escapes the id in the path", async () => {
  mockGet.mockResolvedValue({ success: false, status: 404 });
  await getStoreOrderById("a/b?c", "tok", ["s1"]);
  expect(mockGet.mock.calls[0][0]).toBe("/shopkeeper/store-orders/a%2Fb%3Fc");
});
