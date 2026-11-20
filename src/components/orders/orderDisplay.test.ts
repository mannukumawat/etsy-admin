import { describe, expect, it } from 'vitest';
import { paymentMethodLabel } from './orderDisplay';

describe('paymentMethodLabel', () => {
  it('labels the current prepaid methods', () => {
    expect(paymentMethodLabel('card')).toBe('Card');
    expect(paymentMethodLabel('upi')).toBe('UPI');
    expect(paymentMethodLabel('wallet')).toBe('Wallet');
  });

  it('shows legacy Cash on Delivery orders as Prepaid, never blank', () => {
    // Cash on Delivery was removed; rows placed before the removal may still
    // carry 'cod' in the database. They must display as "Prepaid".
    expect(paymentMethodLabel('cod')).toBe('Prepaid');
    expect(paymentMethodLabel('COD')).toBe('Prepaid');
    expect(paymentMethodLabel('')).toBe('Prepaid');
    expect(paymentMethodLabel('unknown-method')).toBe('Prepaid');
  });
});
