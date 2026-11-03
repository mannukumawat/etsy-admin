import type { CouponState, FulfilmentStatus, PaymentStatus, ProductStatus } from '@/types';
import type { StockState } from '@/utils/inventoryRules';
import { FULFILMENT_LABEL, PAYMENT_LABEL } from '@/utils/orderRules';
import { Badge, type BadgeTone } from './Feedback';

// Status is always text + colour (never colour alone).

const productTone: Record<ProductStatus, BadgeTone> = { active: 'success', draft: 'neutral', archived: 'muted' };
export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = { active: 'Active', draft: 'Draft', archived: 'Archived' };
export const ProductStatusBadge = ({ status }: { status: ProductStatus }) => (
  <Badge tone={productTone[status]} dot>
    {PRODUCT_STATUS_LABEL[status]}
  </Badge>
);

const paymentTone: Record<PaymentStatus, BadgeTone> = { unpaid: 'warning', paid: 'success', failed: 'danger', partially_refunded: 'info', refunded: 'muted' };
export const PaymentBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={paymentTone[status]}>{PAYMENT_LABEL[status]}</Badge>;

const fulfilmentTone: Record<FulfilmentStatus, BadgeTone> = { unfulfilled: 'warning', processing: 'info', shipped: 'brand', delivered: 'success', cancelled: 'muted' };
export const FulfilmentBadge = ({ status }: { status: FulfilmentStatus }) => (
  <Badge tone={fulfilmentTone[status]} dot>
    {FULFILMENT_LABEL[status]}
  </Badge>
);

const couponTone: Record<CouponState, BadgeTone> = { active: 'success', scheduled: 'info', expired: 'muted', inactive: 'neutral', exhausted: 'warning' };
const couponLabel: Record<CouponState, string> = { active: 'Active', scheduled: 'Scheduled', expired: 'Expired', inactive: 'Inactive', exhausted: 'Limit reached' };
export const CouponStateBadge = ({ state }: { state: CouponState }) => <Badge tone={couponTone[state]}>{couponLabel[state]}</Badge>;

const stockTone: Record<StockState, BadgeTone> = { in: 'success', low: 'warning', out: 'danger' };
const stockLabel: Record<StockState, string> = { in: 'In stock', low: 'Low stock', out: 'Out of stock' };
export const StockBadge = ({ state }: { state: StockState }) => <Badge tone={stockTone[state]}>{stockLabel[state]}</Badge>;

export const PublishBadge = ({ published, changed }: { published: boolean; changed: boolean }) =>
  !published ? <Badge tone="neutral">Draft only</Badge> : changed ? <Badge tone="warning">Unpublished changes</Badge> : <Badge tone="success">Published</Badge>;
