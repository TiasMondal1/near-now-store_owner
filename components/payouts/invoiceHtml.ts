/**
 * Invoice PDF model and HTML template.
 *
 * Pure functions only — no React. The template reads every colour and font
 * size from `lib/theme` so the exported PDF matches the app. It always emits
 * the full priced document (items, unit prices, amounts, Order value and the
 * footer note) from both entry points — Payouts and the Orders tab — as
 * the pre-redesign export did; only the on-screen table hides prices in
 * orders context.
 */
import { colors, toneColors, typography } from "../../lib/theme";
import { formatINR, formatStatus, getStatusTone, parseDbDate } from "../../lib/order-utils";
import type { OrderForStore } from "../../lib/orders-db";

export type LineItem = {
  id: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number | null;
  amount: number | null;
  image_url?: string;
};

/** Escape text before interpolating into the PDF HTML — product names are
 *  shopkeeper/custom-entered and could otherwise inject markup. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Payout figure for the invoice. Sum of priced line items when available;
 * otherwise the store's stored subtotal, then the order total — so an order
 * whose items carry no unit price doesn't print "₹0".
 */
export function computePayout(order: OrderForStore, lineItems: LineItem[]): number {
  const fromItems = lineItems.reduce((s, it) => s + (it.amount ?? 0), 0);
  if (fromItems > 0) return fromItems;
  const stored = Number((order as any).subtotal_amount ?? 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const total = Number(order.total_amount ?? 0);
  return Number.isFinite(total) ? total : 0;
}

/** Map `order.order_items` to display rows. Keys fall back to name+index so rows keep identity across renders. */
export function toLineItems(order: OrderForStore | null): LineItem[] {
  const items = Array.isArray(order?.order_items) ? order!.order_items : [];
  return items.map((it: any, index: number) => {
    const qty = Number(it.quantity ?? 0);
    const unitPrice = it.price != null ? Number(it.price) : null;
    const amount = unitPrice != null && Number.isFinite(unitPrice) ? unitPrice * qty : null;
    const name = String(it.product_name ?? "Item");
    return {
      id: it.id != null ? String(it.id) : `${name}-${index}`,
      name,
      unit: String(it.unit ?? "pcs"),
      qty,
      unitPrice,
      amount,
      image_url: it.image_url,
    };
  });
}

export function buildInvoiceHtml(order: OrderForStore, lineItems: LineItem[], payout: number): string {
  const createdAt = parseDbDate(order.placed_at ?? order.created_at);
  const dateStr = createdAt ? createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const timeStr = createdAt ? createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

  const status = String(order.status ?? "delivered");
  const tone = toneColors(getStatusTone(status));

  // 12px is the readable floor (typography.caption / overline); the PDF never goes below it.
  const captionPx = `${typography.caption.fontSize}px`;
  const overlinePx = `${typography.overline.fontSize}px`;
  const bodyPx = `${typography.body.fontSize}px`;
  const labelPx = `${typography.label.fontSize}px`;
  const subheadingPx = `${typography.subheading.fontSize}px`;
  const headingPx = `${typography.heading.fontSize}px`;
  const displayPx = `${typography.display.fontSize}px`;

  const cell = `padding:10px 8px;border-bottom:1px solid ${colors.borderLight}`;
  const th = `padding:10px 8px;font-size:${overlinePx};color:${colors.textMuted};font-weight:600;letter-spacing:0.5px;text-transform:uppercase`;
  const meta = `font-size:${overlinePx};color:${colors.textMuted};font-weight:600;letter-spacing:0.5px`;

  const rows = lineItems
    .map(
      (it) => `
    <tr>
      <td style="${cell}">${esc(it.name)}<br/><span style="font-size:${captionPx};color:${colors.textMuted}">${esc(it.unit)}</span></td>
      <td style="${cell};text-align:center">${it.qty}</td>
      <td style="${cell};text-align:right">${it.unitPrice != null ? formatINR(it.unitPrice) : "—"}</td>
      <td style="${cell};text-align:right;font-weight:600">${it.amount != null ? formatINR(it.amount) : "—"}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${colors.background};margin:0;padding:24px;color:${colors.textPrimary};font-size:${bodyPx}">
  <div style="max-width:560px;margin:0 auto;background:${colors.surface};border-radius:16px;overflow:hidden;border:1px solid ${colors.border}">
    <div style="background:${colors.primary};padding:24px 28px;color:${colors.onPrimary}">
      <div style="font-size:${headingPx};font-weight:700">Near &amp; Now</div>
      <div style="font-size:${captionPx};opacity:0.85;margin-top:2px">Delivered order summary</div>
    </div>

    <div style="padding:20px 28px;background:${colors.surfaceVariant};border-bottom:1px solid ${colors.border};display:flex;justify-content:space-between;gap:12px">
      <div>
        <div style="${meta}">ORDER</div>
        <div style="font-size:${bodyPx};font-weight:700;margin-top:4px">#${esc(order.order_code ?? "—")}</div>
      </div>
      <div>
        <div style="${meta}">DATE</div>
        <div style="font-size:${labelPx};font-weight:600;margin-top:4px">${dateStr}</div>
      </div>
      <div>
        <div style="${meta}">TIME</div>
        <div style="font-size:${labelPx};font-weight:600;margin-top:4px">${timeStr}</div>
      </div>
      <div>
        <div style="${meta}">STATUS</div>
        <div style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:9999px;font-size:${captionPx};font-weight:600;color:${tone.text};background:${tone.bg};border:1px solid ${tone.border}">${esc(formatStatus(status))}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:${colors.surface}">
          <th style="${th};text-align:left">Item</th>
          <th style="${th};text-align:center">Qty</th>
          <th style="${th};text-align:right">Unit price</th>
          <th style="${th};text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="padding:16px 28px 28px;border-top:2px solid ${colors.border}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:${subheadingPx};font-weight:600;color:${colors.textPrimary}">Order value</span>
        <span style="font-size:${displayPx};font-weight:700;color:${colors.textPrimary};font-variant-numeric:tabular-nums">${formatINR(payout)}</span>
      </div>
      <div style="font-size:${captionPx};color:${colors.textMuted};margin-top:8px">Prices include applicable GST. Order value covers product items only (excludes delivery &amp; handling charges).</div>
    </div>

    <div style="padding:16px 28px;background:${colors.surfaceVariant};font-size:${captionPx};color:${colors.textMuted};border-top:1px solid ${colors.border}">
      This invoice is generated by Near &amp; Now and shows the value of the products in this delivered order, which is paid out to the shopkeeper in full.
    </div>
  </div>
</body>
</html>`;
}
