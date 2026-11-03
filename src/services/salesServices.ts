import type { Coupon, CouponInput, CustomerDetail, CustomerSummary, ListQuery, ListResult, Order, OrderEvent, StockAdjustment } from '@/types';
import { couponState, normalizeCode, validateCoupon } from '@/utils/couponRules';
import { inRange } from '@/utils/dates';
import { newId } from '@/utils/misc';
import { formatWithCode, toUsd } from '@/utils/money';
import {
  canMarkPaid,
  checkCancel,
  checkRefund,
  checkTransition,
  FULFILMENT_LABEL,
  netPaid,
  paymentAfterRefund,
  refundableAmount,
  validateTracking,
  wasPaid,
  type TrackingInput,
} from '@/utils/orderRules';
import { variantLabel } from '@/utils/productRules';
import { ApiError, mockRequest, validationError } from './api';
import { API_MODE, couponsApi, customersApi, ordersApi } from '@/api';
import { ADMIN_ACTOR, db, nowIso } from './db';
import { runList } from './query';

// All payment and refund actions here are SIMULATIONS. No payment provider is called and no money moves.

// ---------------------------------------------------------------------------------------------
// Orders — future API: /api/admin/orders, /api/admin/orders/:id/{fulfilment,cancel,refunds,notes,tracking}
// ---------------------------------------------------------------------------------------------

function findOrder(id: string): Order {
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new ApiError('not_found', 'Order not found.');
  return o;
}

function log(o: Order, type: OrderEvent['type'], message: string) {
  const at = nowIso();
  o.events.push({ id: newId('ev'), at, type, message, actor: 'admin' });
  o.updatedAt = at;
}

const fmt = (o: Order, minor: number) => formatWithCode(minor, o.currency);

function orderListConfig() {
  return {
    search: (o: Order) => `${o.number} ${o.customer.name} ${o.customer.email}`,
    sorts: { date: (o: Order) => o.createdAt, total: (o: Order) => toUsd(o.total, o.rateSnapshot.rate), number: (o: Order) => o.number },
    filters: {
      payment: (o: Order, v: string) => o.payment.status === v,
      fulfilment: (o: Order, v: string) => o.fulfilment.status === v,
      currency: (o: Order, v: string) => o.currency === v,
      customer: (o: Order, v: string) => o.customer.kind === v,
      from: (o: Order, v: string) => inRange(o.createdAt, { from: v, to: '9999-12-31' }),
      to: (o: Order, v: string) => inRange(o.createdAt, { from: '0000-01-01', to: v }),
      pending: (o: Order, v: string) =>
        v !== '1' || ((o.payment.status === 'paid' || o.payment.status === 'partially_refunded') && (o.fulfilment.status === 'unfulfilled' || o.fulfilment.status === 'processing')),
      paidOnly: (o: Order, v: string) => v !== '1' || wasPaid(o.payment.status),
    },
    defaultSort: 'date',
    defaultDir: 'desc' as const,
  };
}

export const orderService = {
  list(query: ListQuery): Promise<ListResult<Order>> {
    if (API_MODE) return ordersApi.fetchOrders().then((items) => runList(items, query, orderListConfig()));
    return mockRequest(() => runList(db.orders, query, orderListConfig()));
  },

  get(id: string): Promise<Order> {
    if (API_MODE) return ordersApi.fetchOrder(id);
    return mockRequest(() => findOrder(id));
  },

  advance(id: string, to: 'processing' | 'shipped' | 'delivered', tracking?: TrackingInput): Promise<Order> {
    if (API_MODE) return ordersApi.advanceOrder(id, to, tracking);
    return mockRequest(() => {
      const o = findOrder(id);
      const error = checkTransition(o, to, tracking);
      if (error) {
        if (tracking && to === 'shipped') {
          const errs = validateTracking(tracking);
          if (Object.keys(errs).length) throw validationError(Object.entries(errs).map(([path, message]) => ({ path, message: message! })));
        }
        throw new ApiError('conflict', error);
      }
      if (to === 'shipped' && tracking) {
        o.fulfilment.carrier = tracking.carrier.trim();
        o.fulfilment.trackingNumber = tracking.trackingNumber.trim();
        o.fulfilment.trackingUrl = tracking.trackingUrl.trim() || null;
        log(o, 'tracking', `Tracking added: ${o.fulfilment.carrier} ${o.fulfilment.trackingNumber}.`);
      }
      o.fulfilment.status = to;
      log(o, 'fulfilment', `Marked as ${FULFILMENT_LABEL[to].toLowerCase()}.`);
      return o;
    });
  },

  updateTracking(id: string, tracking: TrackingInput): Promise<Order> {
    if (API_MODE) return ordersApi.updateOrderTracking(id, tracking);
    return mockRequest(() => {
      const o = findOrder(id);
      if (o.fulfilment.status !== 'shipped' && o.fulfilment.status !== 'delivered') throw new ApiError('conflict', 'Tracking can be edited after the order has shipped.');
      const errs = validateTracking(tracking);
      if (Object.keys(errs).length) throw validationError(Object.entries(errs).map(([path, message]) => ({ path, message: message! })));
      o.fulfilment.carrier = tracking.carrier.trim();
      o.fulfilment.trackingNumber = tracking.trackingNumber.trim();
      o.fulfilment.trackingUrl = tracking.trackingUrl.trim() || null;
      log(o, 'tracking', `Tracking updated: ${o.fulfilment.carrier} ${o.fulfilment.trackingNumber}.`);
      return o;
    });
  },

  /** Cancel before shipping. Optionally restock items and (simulated) refund the remaining paid amount. */
  cancel(id: string, opts: { restock: boolean; refund: boolean; reason: string }): Promise<Order> {
    if (API_MODE) return ordersApi.cancelOrder(id, opts);
    return mockRequest(() => {
      const o = findOrder(id);
      const error = checkCancel(o);
      if (error) throw new ApiError('conflict', error);
      if (!opts.reason.trim()) throw validationError([{ path: 'reason', message: 'Give a reason for the cancellation.' }]);
      o.fulfilment.status = 'cancelled';
      log(o, 'cancelled', `Order cancelled: ${opts.reason.trim()}`);
      if (opts.restock && !o.fulfilment.restocked) {
        for (const line of o.lines) {
          const product = db.products.find((p) => p.id === line.productId);
          const variant = product?.variants.find((v) => v.id === line.variantId);
          if (!product || !variant) continue; // product deleted since — nothing to restock
          const adj: StockAdjustment = {
            id: newId('adj'),
            productId: product.id,
            variantId: variant.id,
            sku: variant.sku,
            productName: product.name.en,
            variantLabel: variantLabel(product.options, variant),
            before: variant.stock,
            after: variant.stock + line.quantity,
            delta: line.quantity,
            reason: 'order_cancelled',
            note: `Order ${o.number} cancelled.`,
            createdAt: nowIso(),
            actor: ADMIN_ACTOR,
          };
          variant.stock = adj.after;
          db.adjustments.unshift(adj);
        }
        o.fulfilment.restocked = true;
        log(o, 'restock', 'Items returned to stock.');
      }
      const refundable = refundableAmount(o);
      if (opts.refund && refundable > 0) {
        o.refundedTotal += refundable;
        o.payment.status = 'refunded';
        log(o, 'refund', `Refunded ${fmt(o, refundable)} (simulated — no money moved).`);
      }
      return o;
    });
  },

  refund(id: string, opts: { amount: number; reason: string }): Promise<Order> {
    if (API_MODE) return ordersApi.refundOrder(id, opts);
    return mockRequest(() => {
      const o = findOrder(id);
      const error = checkRefund(o, opts.amount);
      if (error) throw validationError([{ path: 'amount', message: error }]);
      if (!opts.reason.trim()) throw validationError([{ path: 'reason', message: 'Give a reason for the refund.' }]);
      o.payment.status = paymentAfterRefund(o, opts.amount);
      o.refundedTotal += opts.amount;
      log(o, 'refund', `Refunded ${fmt(o, opts.amount)} — ${opts.reason.trim()} (simulated — no money moved).`);
      return o;
    });
  },

  markPaid(id: string): Promise<Order> {
    if (API_MODE) return ordersApi.markOrderPaid(id);
    return mockRequest(() => {
      const o = findOrder(id);
      if (!canMarkPaid(o)) throw new ApiError('conflict', 'Only unpaid, active orders can be marked as paid.');
      o.payment.status = 'paid';
      log(o, 'payment', 'Payment recorded as received (simulated).');
      return o;
    });
  },

  recordCodCollection(
    id: string,
    data: { amount: number; collectedAt: string; collector: string; reference?: string; note?: string },
  ): Promise<Order> {
    if (API_MODE) return ordersApi.recordCodCollection(id, data);
    return mockRequest(() => {
      const o = findOrder(id);
      if (o.payment.method !== 'cod') throw new ApiError('conflict', 'Only COD orders use this action.');
      if (o.payment.status !== 'unpaid') throw new ApiError('conflict', 'COD collection already recorded.');
      if (o.fulfilment.status !== 'delivered') throw new ApiError('conflict', 'Record collection after delivery.');
      o.payment.status = 'paid';
      log(o, 'payment', `COD collected: ${fmt(o, data.amount)} by ${data.collector}${data.reference ? ` (ref: ${data.reference})` : ''}${data.note ? `. ${data.note}` : ''}.`);
      return o;
    });
  },

  addNote(id: string, body: string): Promise<Order> {
    if (API_MODE) return ordersApi.addOrderNote(id, body);
    return mockRequest(() => {
      const o = findOrder(id);
      const text = body.trim();
      if (!text) throw validationError([{ path: 'body', message: 'Write a note first.' }]);
      if (text.length > 1000) throw validationError([{ path: 'body', message: 'Keep notes under 1,000 characters.' }]);
      o.notes.push({ id: newId('note'), at: nowIso(), author: ADMIN_ACTOR, body: text });
      o.updatedAt = nowIso();
      return o;
    });
  },
};

// ---------------------------------------------------------------------------------------------
// Customers (read-only) — future API: /api/admin/customers
// ---------------------------------------------------------------------------------------------

const guestId = (email: string) => `guest:${email.toLowerCase()}`;

function summaries(): CustomerSummary[] {
  const accounts: CustomerSummary[] = db.customers.map((c) => {
    const orders = db.orders.filter((o) => o.customer.kind === 'account' && o.customer.customerId === c.id);
    return summarize(c.id, 'account', c.name, c.email, c.phone, c.createdAt, orders);
  });
  // Guests are grouped by email among GUEST orders only — never merged into an account with the same email.
  const guests = new Map<string, typeof db.orders>();
  db.orders.filter((o) => o.customer.kind === 'guest').forEach((o) => {
    const key = o.customer.email.toLowerCase();
    guests.set(key, [...(guests.get(key) ?? []), o]);
  });
  const guestRows = [...guests.entries()].map(([email, orders]) => {
    const latest = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return summarize(guestId(email), 'guest', latest.customer.name, latest.customer.email, latest.customer.phone, null, orders);
  });
  return [...accounts, ...guestRows];
}

function summarize(id: string, kind: 'account' | 'guest', name: string, email: string, phone: string | null, createdAt: string | null, orders: Order[]): CustomerSummary {
  return {
    id,
    kind,
    name,
    email,
    phone,
    createdAt,
    orderCount: orders.length,
    paidOrderCount: orders.filter((o) => wasPaid(o.payment.status)).length,
    spentUsd: orders.reduce((s, o) => s + toUsd(netPaid(o), o.rateSnapshot.rate), 0),
    lastOrderAt: orders.reduce<string | null>((max, o) => (!max || o.createdAt > max ? o.createdAt : max), null),
  };
}

function customerListConfig() {
  return {
    search: (c: CustomerSummary) => `${c.name} ${c.email} ${c.phone ?? ''}`,
    sorts: { name: (c: CustomerSummary) => c.name, spent: (c: CustomerSummary) => c.spentUsd, orders: (c: CustomerSummary) => c.orderCount, last: (c: CustomerSummary) => c.lastOrderAt ?? '', joined: (c: CustomerSummary) => c.createdAt ?? '' },
    filters: { kind: (c: CustomerSummary, v: string) => c.kind === v },
    defaultSort: 'last',
    defaultDir: 'desc' as const,
  };
}

export const customerService = {
  list(query: ListQuery): Promise<ListResult<CustomerSummary>> {
    if (API_MODE) return customersApi.fetchCustomers(query);
    return mockRequest(() => runList(summaries(), query, customerListConfig()));
  },

  get(id: string): Promise<CustomerDetail> {
    if (API_MODE) return customersApi.fetchCustomer(id);
    return mockRequest(() => {
      const summary = summaries().find((s) => s.id === id);
      if (!summary) throw new ApiError('not_found', 'Customer not found.');
      const account = summary.kind === 'account' ? (db.customers.find((c) => c.id === id) ?? null) : null;
      const orders = db.orders
        .filter((o) => (summary.kind === 'account' ? o.customer.kind === 'account' && o.customer.customerId === id : o.customer.kind === 'guest' && guestId(o.customer.email) === id))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { summary, account, orders };
    });
  },
};

// ---------------------------------------------------------------------------------------------
// Coupons — future API: /api/admin/coupons (storefront validates codes via POST /api/cart/coupon)
// ---------------------------------------------------------------------------------------------

function checkCouponInput(input: CouponInput, selfId?: string) {
  const issues = validateCoupon(input, db.coupons.filter((c) => c.id !== selfId));
  const productIds = new Set(db.products.map((p) => p.id));
  const categoryIds = new Set(db.categories.map((c) => c.id));
  if (input.productIds.some((id) => !productIds.has(id))) issues.push({ path: 'productIds', message: 'A selected product no longer exists.' });
  if (input.categoryIds.some((id) => !categoryIds.has(id))) issues.push({ path: 'categoryIds', message: 'A selected category no longer exists.' });
  if (issues.length) throw validationError(issues);
}

export const couponService = {
  list(): Promise<Array<Coupon & { state: ReturnType<typeof couponState> }>> {
    if (API_MODE) return couponsApi.fetchCoupons();
    return mockRequest(() => db.coupons.map((c) => ({ ...c, state: couponState(c) })).sort((a, b) => a.code.localeCompare(b.code)), [120, 300]);
  },

  create(input: CouponInput): Promise<Coupon> {
    if (API_MODE) return couponsApi.createCoupon(input);
    return mockRequest(() => {
      const data = { ...input, code: normalizeCode(input.code) };
      checkCouponInput(data);
      const now = nowIso();
      const coupon: Coupon = { ...data, id: newId('cpn'), timesUsed: 0, createdAt: now, updatedAt: now };
      db.coupons.push(coupon);
      return coupon;
    });
  },

  update(id: string, input: CouponInput): Promise<Coupon> {
    if (API_MODE) return couponsApi.updateCoupon(id, input);
    return mockRequest(() => {
      const cur = db.coupons.find((c) => c.id === id);
      if (!cur) throw new ApiError('not_found', 'Coupon not found.');
      const data = { ...input, code: normalizeCode(input.code) };
      checkCouponInput(data, id);
      Object.assign(cur, data, { updatedAt: nowIso() });
      return cur;
    });
  },

  remove(id: string): Promise<void> {
    if (API_MODE) return couponsApi.deleteCoupon(id);
    return mockRequest(() => {
      const cur = db.coupons.find((c) => c.id === id);
      if (!cur) throw new ApiError('not_found', 'Coupon not found.');
      if (cur.timesUsed > 0) throw new ApiError('in_use', 'This coupon was used on orders. Deactivate it instead of deleting, so order history stays meaningful.');
      db.coupons = db.coupons.filter((c) => c.id !== id);
    });
  },

  /** How many times a customer used a code (for the preview calculator). */
  usesBy(code: string, email: string): Promise<number> {
    if (API_MODE) return couponsApi.fetchCouponUses(code, email);
    return mockRequest(() => db.orders.filter((o) => o.couponCode === normalizeCode(code) && o.customer.email.toLowerCase() === email.toLowerCase() && o.payment.status !== 'failed').length, [50, 120]);
  },
};

