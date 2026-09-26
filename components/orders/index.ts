/**
 * Orders tab building blocks. Screens import from here:
 *   import { IncomingOrderCard, OrderListCard } from "../../components/orders";
 *
 * Not exported on purpose: `InfoBlock` (internal to ActiveOrderCard /
 * PickupCodeBlock) and the `useOrdersFeed` data hook, which only
 * app/(tabs)/previous-orders.tsx imports directly from "./useOrdersFeed".
 */
export type { Allocation, AllocationItem } from "./types";
export { ORANGE, DEEP_ORANGE, ON_ACCENT } from "./accents";
export { dateFromOrderCode, resolveOrderDate, resolveOrderDateStr, formatTimeDate, pluralItems } from "./format";
export { StatusPill, type StatusPillProps } from "./StatusPill";
export { OrderCardHeader, type OrderCardHeaderProps } from "./OrderCardHeader";
export { OrderItemRow, type OrderItemRowProps } from "./OrderItemRow";
export { PickupCodeBlock, type PickupCodeBlockProps } from "./PickupCodeBlock";
export { CollapsibleSectionHeader, type CollapsibleSectionHeaderProps } from "./CollapsibleSectionHeader";
export { OrderListCard, type OrderListCardProps } from "./OrderListCard";
export { PreviousOrderCard, type PreviousOrderCardProps } from "./PreviousOrderCard";
export { IncomingOrderCard, type IncomingOrderCardProps } from "./IncomingOrderCard";
export { ActiveOrderCard, type ActiveOrderCardProps } from "./ActiveOrderCard";
