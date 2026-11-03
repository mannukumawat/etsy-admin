import type { FulfilmentStatus, Order, PaymentStatus } from '@/types';
import { isHttpUrl } from './misc';

// Order lifecycle rules. Payment and fulfilment are tracked separately:
//
//   Fulfilment: unfulfilled → processing → shipped → delivered
//               unfulfilled | processing → cancelled   (cannot cancel once shipped; returns are future work)
//               COD: fulfilment advances freely; payment is collected at delivery.
//               Prepaid: fulfilment can only advance while payment is "paid" or "partially_refunded".
//   Payment:    unpaid → paid
//               paid → partially_refunded → refunded
//               failed is terminal (customer must place a new order)

export const FULFILMENT_LABEL: Record<FulfilmentStatus, string> = {
  unfulfilled: 'Unfulfilled',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  failed: 'Failed',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
};

const FLOW: Record<FulfilmentStatus, FulfilmentStatus[]> = {
  unfulfilled: ['processing'],
  processing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** Payment states in which money was successfully captured at some point. */
export const wasPaid = (s: PaymentStatus) => s === 'paid' || s === 'partially_refunded' || s === 'refunded';

/** COD: fulfilment proceeds while payment is pending. Prepaid: must be paid/partially_refunded. */
export const canFulfil = (o: Pick<Order, 'payment' | 'fulfilment'>) => {
  if (o.payment.method === 'cod') return o.fulfilment.status !== 'cancelled';
  return o.payment.status === 'paid' || o.payment.status === 'partially_refunded';
};

export function nextFulfilment(o: Pick<Order, 'payment' | 'fulfilment'>): FulfilmentStatus[] {
  return canFulfil(o) ? FLOW[o.fulfilment.status] : [];
}

/** COD collection can be recorded once order is delivered and payment still pending. */
export const canRecordCodCollection = (o: Pick<Order, 'payment' | 'fulfilment'>) =>
  o.payment.method === 'cod' && o.payment.status === 'unpaid' && o.fulfilment.status === 'delivered';

export interface TrackingInput {
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
}

export function validateTracking(t: TrackingInput): Partial<Record<keyof TrackingInput, string>> {
  const errors: Partial<Record<keyof TrackingInput, string>> = {};
  if (!t.carrier.trim()) errors.carrier = 'Carrier is required.';
  if (!/^[A-Za-z0-9-]{4,40}$/.test(t.trackingNumber.trim())) errors.trackingNumber = 'Tracking number: 4–40 letters, numbers or hyphens.';
  if (t.trackingUrl.trim() && !isHttpUrl(t.trackingUrl.trim())) errors.trackingUrl = 'Enter a full http(s) URL, or leave empty.';
  return errors;
}

/** Returns an error message, or null when the transition is allowed. */
export function checkTransition(o: Pick<Order, 'payment' | 'fulfilment'>, to: FulfilmentStatus, tracking?: TrackingInput): string | null {
  if (to === 'cancelled') return checkCancel(o);
  if (!canFulfil(o)) return `Cannot fulfil an order whose payment is ${PAYMENT_LABEL[o.payment.status].toLowerCase()}.`;
  if (!FLOW[o.fulfilment.status].includes(to)) return `Cannot move from ${FULFILMENT_LABEL[o.fulfilment.status]} to ${FULFILMENT_LABEL[to]}.`;
  if (to === 'shipped') {
    if (!tracking) return 'Add a carrier and tracking number before marking as shipped.';
    const errors = validateTracking(tracking);
    const first = Object.values(errors)[0];
    if (first) return first;
  }
  return null;
}

export function checkCancel(o: Pick<Order, 'fulfilment'>): string | null {
  if (o.fulfilment.status === 'cancelled') return 'Order is already cancelled.';
  if (o.fulfilment.status === 'shipped' || o.fulfilment.status === 'delivered') return 'Shipped orders cannot be cancelled. Use a refund instead.';
  return null;
}

export function refundableAmount(o: Pick<Order, 'payment' | 'total' | 'refundedTotal'>): number {
  return o.payment.status === 'paid' || o.payment.status === 'partially_refunded' ? Math.max(0, o.total - o.refundedTotal) : 0;
}

export function checkRefund(o: Pick<Order, 'payment' | 'total' | 'refundedTotal'>, amount: number): string | null {
  const max = refundableAmount(o);
  if (max <= 0) return 'Nothing left to refund on this order.';
  if (!Number.isInteger(amount) || amount <= 0) return 'Refund amount must be above zero.';
  if (amount > max) return 'Refund cannot exceed the remaining paid amount.';
  return null;
}

export function paymentAfterRefund(o: Pick<Order, 'total' | 'refundedTotal'>, amount: number): PaymentStatus {
  return o.refundedTotal + amount >= o.total ? 'refunded' : 'partially_refunded';
}

export const canMarkPaid = (o: Pick<Order, 'payment' | 'fulfilment'>) => {
  if (o.payment.status !== 'unpaid' || o.fulfilment.status === 'cancelled') return false;
  if (o.payment.method === 'cod') return false; // COD uses recordCodCollection instead
  return true;
};

/** Net amount actually kept from this order, in order currency. */
export const netPaid = (o: Pick<Order, 'payment' | 'total' | 'refundedTotal'>) => (wasPaid(o.payment.status) ? o.total - o.refundedTotal : 0);
