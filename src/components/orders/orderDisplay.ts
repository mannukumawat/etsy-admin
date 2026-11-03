import { invalidate } from '@/hooks/useQuery';
import type { Order, OrderEvent, PaymentMethod } from '@/types';

// Small display helpers shared by the order and customer pages.

/** Refetch everything an order mutation can affect (lists, detail, customer totals, dashboard, stock). */
export const refreshSales = () => invalidate('orders', 'order:', 'customers', 'customer:', 'dashboard', 'inventory', 'adjustments', 'products');

/** Customer id used by the customers service: account id, or `guest:<lowercased email>` for guest buyers. */
export function customerIdFor(c: Order['customer']): string {
  return c.kind === 'account' && c.customerId ? c.customerId : `guest:${c.email.toLowerCase()}`;
}

export const customerPath = (id: string) => `/customers/${encodeURIComponent(id)}`;

/** Mirrors money.ts defaults: INR and JPY are shown without decimals. */
export { fractionDigitsFor } from '@/utils/money';

let regionNames: Intl.DisplayNames | null | undefined;
/** English country name for an ISO region code; falls back to the code itself. */
export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { card: 'Card', upi: 'UPI', wallet: 'Wallet' };

export const EVENT_LABEL: Record<OrderEvent['type'], string> = {
  created: 'Order placed',
  payment: 'Payment',
  fulfilment: 'Fulfilment',
  tracking: 'Tracking',
  refund: 'Refund',
  cancelled: 'Cancelled',
  restock: 'Restock',
  note: 'Note',
};

export const ACTOR_LABEL: Record<OrderEvent['actor'], string> = { system: 'System', customer: 'Customer', admin: 'Admin' };

export const itemCount = (o: Pick<Order, 'lines'>) => o.lines.reduce((s, l) => s + l.quantity, 0);

export const formatRate = (rate: number) => rate.toLocaleString('en-US', { maximumFractionDigits: 6 });

/** Decodes a route param defensively (React Router may already have decoded it). */
export function safeDecode(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
