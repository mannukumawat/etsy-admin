import type { AdjustmentMode, AdjustmentReason } from '@/types';

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
  if (after > 100000) return { error: 'Stock above 100,000 is not supported.' };
  return { after, delta: after - before };
}
