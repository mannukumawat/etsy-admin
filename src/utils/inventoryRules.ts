import type { AdjustmentMode, AdjustmentReason } from '@/types';

/** L-I5: one stock cap for the whole system — the admin form, the adjust endpoint,
 *  product saves and imports all use this value (backend: MAX_STOCK_PER_VARIANT). */
export const MAX_STOCK_PER_VARIANT = 100_000;

export type StockState = 'in' | 'low' | 'out';

export function stockState(stock: number, lowThreshold: number): StockState {
  if (stock <= 0) return 'out';
  if (stock <= lowThreshold) return 'low';
  return 'in';
}

export const ADJUSTMENT_REASONS: Array<{ value: AdjustmentReason; label: string; manual: boolean }> = [
  { value: 'restock', label: 'Restock / new batch', manual: true },
  { value: 'correction', label: 'Stock count correction', manual: true },
  { value: 'damaged', label: 'Damaged or lost', manual: true },
  { value: 'returned', label: 'Customer return', manual: true },
  { value: 'other', label: 'Other (explain in note)', manual: true },
  { value: 'order_cancelled', label: 'Order cancelled — items restocked', manual: false },
  { value: 'sale', label: 'Sale — order placed', manual: false },
  { value: 'return_received', label: 'Return received — items restocked', manual: false },
  { value: 'exchange_shipped', label: 'Exchange shipped', manual: false },
];

export const reasonLabel = (r: AdjustmentReason) => ADJUSTMENT_REASONS.find((x) => x.value === r)?.label ?? r;

/** Compute the new stock level. Rejects non-integers, no-op changes and anything that would go negative. */
export function applyAdjustment(before: number, mode: AdjustmentMode, quantity: number): { after: number; delta: number } | { error: string } {
  if (!Number.isInteger(quantity) || quantity < 0) return { error: 'Quantity must be a whole number, 0 or more.' };
  let after: number;
  if (mode === 'add') after = before + quantity;
  else if (mode === 'remove') after = before - quantity;
  else after = quantity;
  if (after < 0) return { error: `Stock cannot go below zero (only ${before} on hand).` };
  if (after === before) return { error: 'This adjustment does not change the stock level.' };
  if (after > MAX_STOCK_PER_VARIANT) return { error: `Stock above ${MAX_STOCK_PER_VARIANT.toLocaleString('en-US')} is not supported.` };
  return { after, delta: after - before };
}
