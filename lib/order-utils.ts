import { colors } from "./theme";

export function getStatusColor(status: string): string {
  const s = (status || "").toLowerCase().replace(/-/g, "_");
  if (s === "pending_store" || s === "pending_at_store") return "#F59E0B";
  if (s === "accepted") return colors.success;
  if (s === "rejected" || s === "cancelled") return colors.error;
  if (s === "ready") return "#3B82F6";
  if (s === "delivered" || s === "order_delivered") return colors.textTertiary;
  return colors.textTertiary;
}

export function formatStatus(status: string): string {
  const s = (status || "").toLowerCase().replace(/-/g, "_");
  if (s === "pending_store" || s === "pending_at_store") return "Pending";
  if (s === "accepted") return "Accepted";
  if (s === "rejected") return "Rejected";
  if (s === "ready") return "Ready";
  if (s === "delivered" || s === "order_delivered") return "Delivered";
  if (s === "cancelled") return "Cancelled";
  return status;
}

export function isDelivered(status: string): boolean {
  const s = (status || "").toLowerCase().replace(/-/g, "_");
  return s === "delivered" || s === "order_delivered";
}
