import { describe, expect, it } from 'vitest';
import type { Coupon, Order, ProductInput, ProductOption } from '@/types';
import { couponState, evaluateCoupon, validateCoupon } from './couponRules';
import { applyAdjustment, stockState } from './inventoryRules';
import { computeDashboard } from './metrics';
import { convertFromUsd, formatMoney, toUsd } from './money';
import { checkCancel, checkRefund, checkTransition, nextFulfilment, paymentAfterRefund, refundableAmount } from './orderRules';
import { optionCombos, syncVariants, validateProduct } from './productRules';

const L = (en: string, hi = '') => ({ en, hi });

const color: ProductOption = {
  id: 'color',
  name: L('Colour'),
  type: 'swatch',
  values: [
    { id: 'sand', label: L('Sand'), swatch: '#e6d3b8' },
    { id: 'sage', label: L('Sage'), swatch: '#a9b49a' },
  ],
};
const size: ProductOption = { id: 'size', name: L('Size'), type: 'button', values: [{ id: 's', label: L('Small'), swatch: null }, { id: 'l', label: L('Large'), swatch: null }] };

function baseProduct(over: Partial<ProductInput> = {}): ProductInput {
  return {
    slug: 'test-mug',
    name: L('Test Mug'),
    shortDescription: L('Short'),
    description: L('Long'),
    categoryId: 'ceramics',
    tags: ['mug'],
    basePrice: 2800,
    baseSalePrice: null,
    images: [{ mediaId: 'm1', alt: L('Mug') }],
    options: [],
    variants: [{ id: 'v1', sku: 'YS-TEST', options: {}, price: 2800, salePrice: null, stock: 3, imageIds: [] }],
    weight: { value: 300, unit: 'g' },
    dimensions: { length: 10, width: 8, height: 9, unit: 'cm' },
    specs: [],
    materials: L('Clay'),
    care: L('Wash'),
    returnsAllowed: true,
    exchangeAllowed: true,
    returnDays: 30,
    isFeatured: false,
    isBestseller: false,
    isNew: false,
    displayOrder: 10,
    seo: { title: L(''), description: L('') },
    ...over,
  };
}

const ctx = (others: Parameters<typeof validateProduct>[1]['others'] = [], intent: 'draft' | 'active' = 'active') => ({ intent, others, categories: [{ id: 'ceramics' }] });
const paths = (issues: { path: string }[]) => issues.map((i) => i.path);

describe('product rules: variants and SKUs', () => {
  it('builds the cartesian product of option values', () => {
    expect(optionCombos([color, size])).toEqual([
      { color: 'sand', size: 's' },
      { color: 'sand', size: 'l' },
      { color: 'sage', size: 's' },
      { color: 'sage', size: 'l' },
    ]);
    expect(optionCombos([])).toEqual([{}]);
  });

  it('keeps existing variant data when options change and adds defaults for new combinations', () => {
    const existing = [{ id: 'x--sand', sku: 'YS-X-SAND', options: { color: 'sand' }, price: 3000, salePrice: null, stock: 7, imageIds: [] }];
    const out = syncVariants([color, size], existing, { price: 2800, salePrice: null, skuPrefix: 'YS-X', idPrefix: 'x' });
    expect(out).toHaveLength(4);
    // The colour-only variant adopts the new option's first value and keeps its data; the rest are new.
    expect(out.find((v) => v.options.color === 'sand' && v.options.size === 's')).toMatchObject({ id: 'x--sand', sku: 'YS-X-SAND', stock: 7, price: 3000 });
    expect(out.filter((v) => v.id !== 'x--sand').every((v) => v.stock === 0 && v.price === 2800)).toBe(true);
    const again = syncVariants([color, size], out.map((v) => ({ ...v, stock: 5 })), { price: 1, salePrice: null, skuPrefix: 'YS-X', idPrefix: 'x' });
    expect(again.every((v) => v.stock === 5)).toBe(true);
    expect(new Set(again.map((v) => v.sku)).size).toBe(4);
  });

  it('accepts a valid product', () => {
    expect(validateProduct(baseProduct(), ctx())).toEqual([]);
  });

  it('rejects duplicate SKUs within a product and across the catalogue', () => {
    const p = baseProduct({
      options: [color],
      variants: [
        { id: 'a', sku: 'YS-DUP', options: { color: 'sand' }, price: 100, salePrice: null, stock: 0, imageIds: [] },
        { id: 'b', sku: 'ys-dup', options: { color: 'sage' }, price: 100, salePrice: null, stock: 0, imageIds: [] },
      ],
    });
    expect(paths(validateProduct(p, ctx()))).toContain('variants.1.sku');
    const other = { id: 'o', slug: 'other', name: L('Other'), variants: [{ sku: 'YS-TEST' }] } as never;
    expect(validateProduct(baseProduct(), ctx([other]))).toEqual([expect.objectContaining({ path: 'variants.0.sku', message: expect.stringContaining('Other') })]);
  });

  it('rejects duplicate variant combinations and missing combinations', () => {
    const p = baseProduct({
      options: [color],
      variants: [
        { id: 'a', sku: 'YS-A', options: { color: 'sand' }, price: 100, salePrice: null, stock: 0, imageIds: [] },
        { id: 'b', sku: 'YS-B', options: { color: 'sand' }, price: 100, salePrice: null, stock: 0, imageIds: [] },
      ],
    });
    const issues = validateProduct(p, ctx());
    expect(issues.map((i) => i.message)).toEqual(expect.arrayContaining(['Duplicate variant combination.', expect.stringContaining('Regenerate')]));
  });

  it('rejects duplicate slugs, negative values and invalid sale prices', () => {
    const issues = validateProduct(
      baseProduct({
        basePrice: -1,
        baseSalePrice: 5000,
        variants: [{ id: 'v1', sku: 'YS-TEST', options: {}, price: 2800, salePrice: 2800, stock: -2, imageIds: [] }],
        weight: { value: -3, unit: 'g' },
      }),
      ctx([{ id: 'o', slug: 'test-mug', name: L('Taken'), variants: [] } as never]),
    );
    expect(paths(issues)).toEqual(expect.arrayContaining(['slug', 'basePrice', 'variants.0.salePrice', 'variants.0.stock', 'weight.value']));
  });

  it('requires images and descriptions only when activating', () => {
    const draft = baseProduct({ images: [], description: L('') });
    expect(validateProduct(draft, ctx([], 'draft'))).toEqual([]);
    expect(paths(validateProduct(draft, ctx([], 'active')))).toEqual(expect.arrayContaining(['images', 'description.en']));
  });

  it('flags duplicate option values', () => {
    const dupe: ProductOption = { ...size, values: [size.values[0], { id: 'x', label: L('small'), swatch: null }] };
    const p = baseProduct({ options: [dupe], variants: syncVariants([dupe], [], { price: 100, salePrice: null, skuPrefix: 'YS-T', idPrefix: 't' }) });
    expect(paths(validateProduct(p, ctx()))).toContain('options.0.values.1.label.en');
  });
});

describe('inventory rules', () => {
  it('adds, removes and sets stock and rejects negatives and no-ops', () => {
    expect(applyAdjustment(5, 'add', 3)).toEqual({ after: 8, delta: 3 });
    expect(applyAdjustment(5, 'remove', 5)).toEqual({ after: 0, delta: -5 });
    expect(applyAdjustment(5, 'set', 12)).toEqual({ after: 12, delta: 7 });
    expect(applyAdjustment(5, 'remove', 6)).toHaveProperty('error');
    expect(applyAdjustment(5, 'set', 5)).toHaveProperty('error');
    expect(applyAdjustment(5, 'add', 1.5)).toHaveProperty('error');
  });

  it('classifies stock against the threshold', () => {
    expect([stockState(0, 5), stockState(5, 5), stockState(6, 5)]).toEqual(['out', 'low', 'in']);
  });
});

function coupon(over: Partial<Coupon> = {}): Coupon {
  return {
    id: 'c', code: 'TEST10', description: '', type: 'percentage', value: 10, maxDiscount: null, minOrder: null, startsAt: null, endsAt: null,
    isActive: true, usageLimit: null, perCustomerLimit: null, timesUsed: 0, scope: 'all', productIds: [], categoryIds: [], createdAt: '', updatedAt: '', ...over,
  };
}

describe('coupon rules', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const cart = { lines: [{ productId: 'p-mug', categoryId: 'ceramics', lineTotalUsd: 5600 }, { productId: 'p-lamp', categoryId: 'home-decor', lineTotalUsd: 12000 }], customerUses: 0 };

  it('validates codes, percentages, amounts and date ranges', () => {
    const input = { ...coupon({ code: 'bad code!', value: 120, startsAt: '2026-11-10T00:00:00Z', endsAt: '2026-11-01T00:00:00Z', minOrder: -1 }) };
    const issues = validateCoupon(input, [{ id: 'x', code: 'TAKEN' }]).map((i) => i.path);
    expect(issues).toEqual(expect.arrayContaining(['code', 'value', 'endsAt', 'minOrder']));
    expect(validateCoupon(coupon({ code: 'taken' }), [{ id: 'x', code: 'TAKEN' }]).map((i) => i.path)).toContain('code');
    expect(validateCoupon(coupon({ type: 'fixed', value: -500, maxDiscount: 100 }), []).map((i) => i.path)).toEqual(expect.arrayContaining(['value', 'maxDiscount']));
  });

  it('derives lifecycle state', () => {
    expect(couponState(coupon(), now)).toBe('active');
    expect(couponState(coupon({ isActive: false }), now)).toBe('inactive');
    expect(couponState(coupon({ startsAt: '2026-12-01T00:00:00Z' }), now)).toBe('scheduled');
    expect(couponState(coupon({ endsAt: '2026-10-01T00:00:00Z' }), now)).toBe('expired');
    expect(couponState(coupon({ usageLimit: 3, timesUsed: 3 }), now)).toBe('exhausted');
  });

  it('applies percentage caps, eligibility, minimums and per-customer limits in USD', () => {
    expect(evaluateCoupon(coupon({ maxDiscount: 1000 }), cart, now)).toEqual({ ok: true, discountUsd: 1000, eligibleSubtotalUsd: 17600 });
    expect(evaluateCoupon(coupon({ scope: 'categories', categoryIds: ['ceramics'] }), cart, now)).toMatchObject({ ok: true, discountUsd: 560 });
    expect(evaluateCoupon(coupon({ type: 'fixed', value: 500, scope: 'products', productIds: ['p-vase'] }), cart, now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(coupon({ minOrder: 20000 }), cart, now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(coupon({ perCustomerLimit: 1 }), { ...cart, customerUses: 1 }, now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(coupon({ type: 'fixed', value: 999999 }), cart, now)).toMatchObject({ ok: true, discountUsd: 17600 });
  });
});

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'o1', number: 'YS-1', createdAt: '2026-10-20T10:00:00Z', updatedAt: '', currency: 'INR',
    customer: { kind: 'account', customerId: 'c1', name: 'A', email: 'a@example.com', phone: '' },
    shippingAddress: { fullName: 'A', phone: '', country: 'IN', line1: 'x' },
    rateSnapshot: { base: 'USD', currency: 'INR', rate: 80, capturedAt: '' },
    lines: [{ productId: 'p-mug', variantId: 'p-mug--sand', sku: 'S', name: L('Mug'), variantLabel: null, imageUrl: null, unitPrice: 240000, quantity: 1, lineTotal: 240000 }],
    subtotal: 240000, discount: 0, couponCode: null, shipping: 0, tax: 0, taxRate: 0, taxInclusive: false, total: 240000, refundedTotal: 0,
    shippingMethod: { id: 'standard', label: '', minDays: 1, maxDays: 2 },
    payment: { status: 'paid', method: 'card', reference: '' },
    fulfilment: { status: 'unfulfilled', carrier: null, trackingNumber: null, trackingUrl: null, restocked: false },
    events: [], notes: [], ...over,
  };
}

describe('order transitions', () => {
  const tracking = { carrier: 'Demo Post', trackingNumber: 'DP12345', trackingUrl: '' };

  it('only allows the next fulfilment step, and only when paid', () => {
    expect(nextFulfilment(order())).toEqual(['processing']);
    expect(checkTransition(order(), 'shipped', tracking)).toMatch(/Cannot move/);
    expect(checkTransition(order({ fulfilment: { ...order().fulfilment, status: 'processing' } }), 'shipped')).toMatch(/tracking/);
    expect(checkTransition(order({ fulfilment: { ...order().fulfilment, status: 'processing' } }), 'shipped', tracking)).toBeNull();
    expect(nextFulfilment(order({ payment: { ...order().payment, status: 'unpaid' } }))).toEqual([]);
    expect(checkTransition(order({ payment: { ...order().payment, status: 'failed' } }), 'processing')).toMatch(/payment/);
  });

  it('blocks cancelling shipped orders', () => {
    expect(checkCancel(order())).toBeNull();
    expect(checkCancel(order({ fulfilment: { ...order().fulfilment, status: 'shipped' } }))).toMatch(/refund/);
  });

  it('limits refunds to the remaining paid amount and updates payment state', () => {
    const o = order({ refundedTotal: 40000, payment: { ...order().payment, status: 'partially_refunded' } });
    expect(refundableAmount(o)).toBe(200000);
    expect(checkRefund(o, 200001)).toMatch(/exceed/);
    expect(checkRefund(o, 0)).toMatch(/above zero/);
    expect(paymentAfterRefund(o, 100000)).toBe('partially_refunded');
    expect(paymentAfterRefund(o, 200000)).toBe('refunded');
    expect(refundableAmount(order({ payment: { ...order().payment, status: 'unpaid' } }))).toBe(0);
  });
});

describe('dashboard metrics', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' };
  const orders = [
    order({ id: 'a', total: 240000, rateSnapshot: { base: 'USD', currency: 'INR', rate: 80, capturedAt: '' } }), // $30
    order({ id: 'b', currency: 'EUR', total: 4600, rateSnapshot: { base: 'USD', currency: 'EUR', rate: 0.92, capturedAt: '' }, customer: { kind: 'guest', customerId: null, name: 'G', email: 'g@example.com', phone: '' } }), // $50
    order({ id: 'c', total: 10000, currency: 'USD', rateSnapshot: { base: 'USD', currency: 'USD', rate: 1, capturedAt: '' }, refundedTotal: 10000, payment: { status: 'refunded', method: 'card', reference: '' }, fulfilment: { ...order().fulfilment, status: 'cancelled' } }),
    order({ id: 'd', total: 99999, currency: 'USD', rateSnapshot: { base: 'USD', currency: 'USD', rate: 1, capturedAt: '' }, payment: { status: 'failed', method: 'card', reference: '' } }),
    order({ id: 'e', createdAt: '2026-09-01T10:00:00Z', total: 50000, currency: 'USD', rateSnapshot: { base: 'USD', currency: 'USD', rate: 1, capturedAt: '' } }),
  ];

  it('converts each order with its own snapshot and excludes failed/out-of-range orders', () => {
    const m = computeDashboard(orders, [], range, 5);
    expect(m.grossSalesUsd).toBe(3000 + 5000 + 10000);
    expect(m.refundsUsd).toBe(10000);
    expect(m.netRevenueUsd).toBe(8000);
    expect(m.totalOrders).toBe(4);
    expect(m.paidOrders).toBe(3);
    expect(m.failedOrders).toBe(1);
    expect(m.cancelledOrders).toBe(1);
    expect(m.aovUsd).toBe(6000);
    expect(m.customers).toBe(2); // account c1 + one guest
    expect(m.salesSeries.reduce((s, p) => s + p.netUsd, 0)).toBe(m.netRevenueUsd);
    expect(m.topProducts[0]).toMatchObject({ productId: 'p-mug', units: 2 });
  });
});

describe('money', () => {
  it('converts and formats consistently', () => {
    expect(convertFromUsd(2800, { rate: 84, roundingIncrement: 100 })).toBe(235200);
    expect(toUsd(235200, 84)).toBe(2800);
    expect(formatMoney(235200, 'INR')).toBe('₹2,352');
    expect(formatMoney(2576, 'EUR')).toBe('€25.76');
  });
});
