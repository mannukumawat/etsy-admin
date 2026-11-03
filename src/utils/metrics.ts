import type { DashboardMetrics, DateRange, Order, Product } from '@/types';
import { eachDay, inRange, toDateKey } from './dates';
import { stockState } from './inventoryRules';
import { toUsd } from './money';
import { wasPaid } from './orderRules';

/**
 * Dashboard metric definitions (shown in the UI as well):
 *  - Amounts are reported in USD. Each order converts with its OWN rate snapshot from checkout — currencies are never
 *    added together unconverted, and current settings rates are not used for historical orders.
 *  - Gross sales: totals of orders whose payment succeeded (paid, partially refunded or refunded).
 *  - Refunds: refunded amounts on those orders (simulated refunds included).
 *  - Paid revenue (net): gross sales − refunds. Unpaid and failed orders contribute nothing.
 *  - Cancelled orders: count only what was paid and not refunded; a cancelled + fully refunded order adds 0.
 *  - Orders: every order placed in the range, any status.
 *  - Average order value: gross sales ÷ orders with a successful payment.
 *  - Customers: distinct buyers with a successful payment (accounts by id, guests by email).
 *  - Pending fulfilment and stock alerts describe the current state and ignore the date range.
 *  - Top products: units and line revenue from successfully paid, not fully refunded orders, before order discounts.
 */
export const METRIC_NOTES = {
  revenue: 'Net of simulated refunds. Converted to USD with each order’s checkout rate.',
  orders: 'All orders placed in the range, including unpaid, failed and cancelled.',
  aov: 'Gross sales ÷ orders with a successful payment.',
  customers: 'Distinct buyers with a successful payment. Guests are counted by email.',
  totalRegisteredCustomers: 'Lifetime count of registered customer accounts (not scoped to the date range, excludes guest buyers).',
  pending: 'Paid orders not yet shipped (current, ignores date range).',
  stock: 'Variants at or below the low-stock threshold (current, ignores date range).',
};

export function buyerKey(o: Order): string {
  return o.customer.kind === 'account' && o.customer.customerId ? `acct:${o.customer.customerId}` : `guest:${o.customer.email.toLowerCase()}`;
}

export function computeDashboard(orders: Order[], products: Product[], range: DateRange, lowStockThreshold: number, totalRegisteredCustomers = 0): DashboardMetrics {
  const inRangeOrders = orders.filter((o) => inRange(o.createdAt, range));
  const paid = inRangeOrders.filter((o) => wasPaid(o.payment.status));

  const gross = paid.reduce((s, o) => s + toUsd(o.total, o.rateSnapshot.rate), 0);
  const refunds = paid.reduce((s, o) => s + toUsd(o.refundedTotal, o.rateSnapshot.rate), 0);

  const series = new Map(eachDay(range).map((d) => [d, { date: d, netUsd: 0, orders: 0 }]));
  for (const o of inRangeOrders) {
    const point = series.get(toDateKey(new Date(o.createdAt)));
    if (!point) continue;
    point.orders += 1;
    if (wasPaid(o.payment.status)) point.netUsd += toUsd(o.total - o.refundedTotal, o.rateSnapshot.rate);
  }

  const top = new Map<string, { productId: string; name: Order['lines'][number]['name']; units: number; revenueUsd: number }>();
  for (const o of paid) {
    if (o.payment.status === 'refunded') continue;
    for (const l of o.lines) {
      const row = top.get(l.productId) ?? { productId: l.productId, name: l.name, units: 0, revenueUsd: 0 };
      row.units += l.quantity;
      row.revenueUsd += toUsd(l.lineTotal, o.rateSnapshot.rate);
      top.set(l.productId, row);
    }
  }

  let low = 0;
  let out = 0;
  for (const p of products) {
    if (p.status === 'archived') continue;
    for (const v of p.variants) {
      const s = stockState(v.stock, lowStockThreshold);
      if (s === 'low') low++;
      if (s === 'out') out++;
    }
  }

  return {
    range,
    grossSalesUsd: gross,
    refundsUsd: refunds,
    netRevenueUsd: gross - refunds,
    totalOrders: inRangeOrders.length,
    paidOrders: paid.length,
    cancelledOrders: inRangeOrders.filter((o) => o.fulfilment.status === 'cancelled').length,
    failedOrders: inRangeOrders.filter((o) => o.payment.status === 'failed').length,
    aovUsd: paid.length ? Math.round(gross / paid.length) : 0,
    customers: new Set(paid.map(buyerKey)).size,
    totalRegisteredCustomers,
    pendingFulfilment: orders.filter(
      (o) => (o.payment.status === 'paid' || o.payment.status === 'partially_refunded') && (o.fulfilment.status === 'unfulfilled' || o.fulfilment.status === 'processing'),
    ).length,
    lowStockVariants: low,
    outOfStockVariants: out,
    salesSeries: [...series.values()],
    topProducts: [...top.values()].sort((a, b) => b.revenueUsd - a.revenueUsd || b.units - a.units).slice(0, 5),
    recentOrders: [...inRangeOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
  };
}
