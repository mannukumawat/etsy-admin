import type { Coupon, CouponInput, CouponState, Minor } from '@/types';
import type { Issue } from './productRules';

// Coupons are defined in the USD base currency. The storefront converts eligible totals to USD (using its rate)
// before applying a coupon, then converts the discount back to the shopper's currency.

export const COUPON_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,19}$/;

export const normalizeCode = (code: string) => code.trim().toUpperCase();

export function couponState(c: Pick<Coupon, 'isActive' | 'usageLimit' | 'timesUsed' | 'startsAt' | 'endsAt'>, now: Date = new Date()): CouponState {
  if (!c.isActive) return 'inactive';
  if (c.usageLimit !== null && c.timesUsed >= c.usageLimit) return 'exhausted';
  if (c.startsAt && new Date(c.startsAt) > now) return 'scheduled';
  if (c.endsAt && new Date(c.endsAt) < now) return 'expired';
  return 'active';
}

export function validateCoupon(input: CouponInput, others: Pick<Coupon, 'id' | 'code'>[]): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const code = normalizeCode(input.code);

  if (!COUPON_CODE_RE.test(code)) add('code', 'Code: 3–20 characters, letters, numbers, "-" or "_".');
  else if (others.some((o) => normalizeCode(o.code) === code)) add('code', 'Another coupon already uses this code.');

  if (input.type === 'percentage') {
    if (!Number.isFinite(input.value) || input.value <= 0 || input.value > 100) add('value', 'Percentage must be more than 0 and at most 100.');
    if (input.maxDiscount !== null && input.maxDiscount <= 0) add('maxDiscount', 'Maximum discount must be above zero, or empty.');
  } else {
    if (!Number.isInteger(input.value) || input.value <= 0) add('value', 'Fixed discount must be above zero.');
    if (input.maxDiscount !== null) add('maxDiscount', 'Maximum discount only applies to percentage coupons.');
  }
  if (input.minOrder !== null && input.minOrder < 0) add('minOrder', 'Minimum order cannot be negative.');
  if (input.type === 'fixed' && input.minOrder !== null && input.minOrder > 0 && input.value > input.minOrder) {
    add('value', 'A fixed discount larger than the minimum order could make orders free.');
  }

  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) add('endsAt', 'End date must be after the start date.');

  const posInt = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1);
  if (!posInt(input.usageLimit)) add('usageLimit', 'Usage limit must be a whole number of at least 1, or empty.');
  if (!posInt(input.perCustomerLimit)) add('perCustomerLimit', 'Per-customer limit must be at least 1, or empty.');
  if (input.usageLimit !== null && input.perCustomerLimit !== null && input.perCustomerLimit > input.usageLimit) {
    add('perCustomerLimit', 'Per-customer limit cannot exceed the total usage limit.');
  }

  if (input.scope === 'products' && input.productIds.length === 0) add('productIds', 'Choose at least one product.');
  if (input.scope === 'categories' && input.categoryIds.length === 0) add('categoryIds', 'Choose at least one category.');
  return issues;
}

export interface CouponCart {
  lines: Array<{ productId: string; categoryId: string; lineTotalUsd: Minor }>;
  /** How many times this customer already used the coupon. */
  customerUses: number;
}

export type CouponResult = { ok: true; discountUsd: Minor; eligibleSubtotalUsd: Minor } | { ok: false; reason: string };

export function evaluateCoupon(c: Coupon, cart: CouponCart, now: Date = new Date()): CouponResult {
  const state = couponState(c, now);
  if (state !== 'active') return { ok: false, reason: `Coupon is ${state}.` };
  if (c.perCustomerLimit !== null && cart.customerUses >= c.perCustomerLimit) return { ok: false, reason: 'Customer has reached the per-customer limit.' };

  const subtotal = cart.lines.reduce((s, l) => s + l.lineTotalUsd, 0);
  if (c.minOrder !== null && subtotal < c.minOrder) return { ok: false, reason: 'Order is below the minimum order amount.' };

  const eligible = cart.lines.filter((l) =>
    c.scope === 'all' ? true : c.scope === 'products' ? c.productIds.includes(l.productId) : c.categoryIds.includes(l.categoryId),
  );
  const eligibleSubtotalUsd = eligible.reduce((s, l) => s + l.lineTotalUsd, 0);
  if (eligibleSubtotalUsd <= 0) return { ok: false, reason: 'No items in the cart are eligible.' };

  let discountUsd = c.type === 'percentage' ? Math.round((eligibleSubtotalUsd * c.value) / 100) : c.value;
  if (c.type === 'percentage' && c.maxDiscount !== null) discountUsd = Math.min(discountUsd, c.maxDiscount);
  discountUsd = Math.min(discountUsd, eligibleSubtotalUsd);
  return { ok: true, discountUsd, eligibleSubtotalUsd };
}

export function describeCoupon(c: Pick<Coupon, 'type' | 'value' | 'maxDiscount'>, fmtUsd: (m: Minor) => string): string {
  if (c.type === 'fixed') return `${fmtUsd(c.value)} off`;
  return `${c.value}% off${c.maxDiscount !== null ? ` (max ${fmtUsd(c.maxDiscount)})` : ''}`;
}
