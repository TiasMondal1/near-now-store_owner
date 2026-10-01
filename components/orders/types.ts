/** Shapes returned by GET /shopkeeper/orders (allocations for this store). */
export type AllocationItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  price?: number;
};

export type Allocation = {
  allocation_id: string;
  order_id: string;
  /** The store this allocation is for (an owner may have several). */
  store_id?: string;
  store_name?: string | null;
  order_code: string;
  alloc_status: "pending_acceptance" | "accepted";
  pickup_code: string | null;
  placed_at: string;
  items: AllocationItem[];
  customer_area: string | null;
  customer_distance: string | null;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  receiver_address?: string | null;
};
