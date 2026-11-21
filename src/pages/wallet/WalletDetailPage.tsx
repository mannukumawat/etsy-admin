import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Wallet, ArrowUpRight, ArrowDownLeft, Plus } from 'lucide-react';
import { adjustCustomerWallet, fetchCustomerWallet, fetchCustomerTopups } from '@/api/wallet';
import type { AdminWalletTransaction, AdminWalletTopup } from '@/api/wallet';
import { EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { Card, PageHeader } from '@/components/ui/Page';
import { Modal } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { toast } from '@/store';
import { formatDate } from '@/utils/dates';
import { formatWithCode, toMinor } from '@/utils/money';

/**
 * M-O7: wallet amounts are INR paise (Razorpay top-ups are INR-only) — they are
 * formatted with the SAME shared helper as the rest of admin (formatWithCode, with
 * the currency code shown) instead of a bespoke en-IN/₹ formatter, and the page says
 * so explicitly. Converting them to USD for display would misstate real balances,
 * so the currency is labelled INR rather than converted.
 */
const formatInr = (paise: number) => formatWithCode(paise, 'INR');

const TX_TYPE_COLORS: Record<string, string> = {
  topup: 'text-emerald-700',
  spend: 'text-red-600',
  refund: 'text-sky-700',
  reversal: 'text-amber-700',
};

/** Transactions tab — mounted only when active, so its query only fires then (M-O7). */
function TransactionsPanel({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery(`wallet:customer:${customerId}:p${page}`, () => fetchCustomerWallet(customerId, page));
  const transactions = data?.transactions.items ?? [];
  const pageCount = data?.transactions.pageCount ?? 1;

  if (isLoading && !data) return <Skeleton className="h-64 w-full" />;
  if (error && !data) return <ErrorState onRetry={() => refetch()} />;
  return (
    <div className="space-y-3">
      {transactions.length === 0 && !isLoading && (
        <EmptyState icon={<Wallet className="h-7 w-7" />} title="No transactions yet" />
      )}
      {transactions.map((tx: AdminWalletTransaction) => (
        <Card key={tx.id}>
          <div className="flex items-center gap-3 p-4">
            {tx.amountPaise >= 0
              ? <ArrowDownLeft className="h-4 w-4 text-emerald-600 shrink-0" />
              : <ArrowUpRight className="h-4 w-4 text-red-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold uppercase ${TX_TYPE_COLORS[tx.type] ?? ''}`}>
                  {tx.type}
                </span>
                <span className="text-xs text-ink-muted font-mono truncate">{tx.reference}</span>
              </div>
              {tx.orderId && (
                <Link to={`/orders/${tx.orderId}`} className="text-xs text-brand-600 hover:underline">
                  Order: {tx.orderId}
                </Link>
              )}
              {tx.note && <p className="text-xs text-ink-muted mt-0.5">{tx.note}</p>}
              <p className="text-xs text-ink-muted mt-0.5">{formatDate(tx.createdAt)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`font-semibold text-sm ${tx.amountPaise >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {tx.amountPaise >= 0 ? '+' : ''}{formatInr(tx.amountPaise)}
              </p>
              <p className="text-xs text-ink-muted">Bal: {formatInr(tx.balanceAfter)}</p>
            </div>
          </div>
        </Card>
      ))}

      {pageCount > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="self-center text-sm text-ink-muted">{page} / {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/** Top-ups tab — mounted only when active, so its query only fires then (M-O7). */
function TopupsPanel({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery(`wallet:topups:${customerId}:p${page}`, () => fetchCustomerTopups(customerId, page));
  const topups = data?.items ?? [];
  const pageCount = data?.pageCount ?? 1;

  if (isLoading && !data) return <Skeleton className="h-24 w-full" />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  return (
    <div className="space-y-3">
      {!isLoading && topups.length === 0 && (
        <EmptyState icon={<Wallet className="h-7 w-7" />} title="No top-ups yet" />
      )}
      {topups.map((topup: AdminWalletTopup) => (
        <Card key={topup.id}>
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-mono text-xs text-ink-muted truncate">{topup.id}</p>
              <p className="text-xs text-ink-muted mt-0.5">{formatDate(topup.createdAt)}</p>
              {topup.razorpayPaymentId && (
                <p className="text-xs text-ink-muted font-mono">{topup.razorpayPaymentId}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="font-semibold text-sm text-emerald-700">+{formatInr(topup.amountPaise)}</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                topup.status === 'paid'
                  ? 'bg-emerald-50 text-emerald-800'
                  : topup.status === 'failed'
                  ? 'bg-red-50 text-red-800'
                  : 'bg-amber-50 text-amber-800'
              }`}>
                {topup.status}
              </span>
            </div>
          </div>
        </Card>
      ))}

      {pageCount > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="self-center text-sm text-ink-muted">{page} / {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/** M-O7: owner wallet adjustment — credit or debit with a reason, recorded as an
 *  `admin-adjust:` ledger row + audit-log entry. This is not a Razorpay top-up:
 *  no money moves through a gateway. */
function AdjustWalletDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const paise = toMinor(Number(amount));
    if (!Number.isFinite(paise) || paise <= 0) {
      setError('Enter an amount above ₹0.');
      return;
    }
    if (note.trim().length < 3) {
      setError('Add a short reason (at least 3 characters).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await adjustCustomerWallet(customerId, { direction, amountPaise: paise, note: note.trim() });
      invalidate('wallet');
      toast(`Wallet ${direction === 'credit' ? 'credited' : 'debited'} ${formatInr(paise)}. New balance: ${formatInr(result.balancePaise)}.`, 'success');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Adjust wallet balance"
      description="Credit or debit this customer's wallet directly. The adjustment is recorded in the transaction history with your reason — it is not a Razorpay payment."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={saving}>
            {direction === 'credit' ? 'Credit wallet' : 'Debit wallet'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-sand-300 bg-white p-0.5" role="radiogroup" aria-label="Adjustment direction">
          {(['credit', 'debit'] as const).map((d) => (
            <label key={d} className={`cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium ${direction === d ? 'bg-ink text-white' : 'text-ink-soft'}`}>
              <input type="radio" value={d} className="sr-only" checked={direction === d} onChange={() => setDirection(d)} />
              {d === 'credit' ? 'Credit (add)' : 'Debit (remove)'}
            </label>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="adjust-amount">Amount (INR)</label>
          <input id="adjust-amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="input w-full" placeholder="e.g. 500" />
        </div>
        <div>
          <label className="label" htmlFor="adjust-note">Reason</label>
          <textarea id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} className="input w-full" placeholder="e.g. Goodwill credit for a delayed delivery" />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}

export default function WalletDetailPage() {
  const { customerId = '' } = useParams<{ customerId: string }>();
  usePageMeta('Customer Wallet', [{ label: 'Sales' }, { label: 'Customers', to: '/customers' }, { label: 'Wallet' }]);
  const [activeTab, setActiveTab] = useState<'transactions' | 'topups'>('transactions');
  const [adjusting, setAdjusting] = useState(false);

  // Balance only — the tab panels fetch their own lists when mounted (M-O7).
  // The key matches the transactions panel's first page, so opening that tab reuses
  // this fetch instead of firing the same request twice.
  const { data: walletData, isLoading: walletLoading, error: walletError, refetch: refetchWallet } = useQuery(
    `wallet:customer:${customerId}:p1`,
    () => fetchCustomerWallet(customerId, 1),
  );

  if (walletLoading && !walletData) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (walletError && !walletData) {
    return <ErrorState onRetry={() => refetchWallet()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Link to={`/customers/${customerId}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to Customer
        </Link>
      </div>
      <PageHeader
        description={`Customer ID: ${customerId}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => setAdjusting(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
            Adjust balance
          </Button>
        }
      />

      {/* Balance card */}
      <Card>
        <div className="flex items-center gap-4 p-5">
          <div className="rounded-xl bg-brand-50 p-3">
            <Wallet className="h-6 w-6 text-brand-600" />
          </div>
          <div>
            <p className="text-sm text-ink-soft">Current Balance</p>
            <p className="text-3xl font-bold text-ink">
              {formatInr(walletData?.balancePaise ?? 0)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Wallet balances are held in INR (top-ups are paid in rupees via Razorpay); the rest of admin is USD-base.
            </p>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="border-b border-sand-200">
        <nav className="-mb-px flex gap-6" aria-label="Wallet tabs">
          {(['transactions', 'topups'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium capitalize transition ${
                activeTab === tab
                  ? 'border-b-2 border-ink text-ink'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'transactions' ? <TransactionsPanel customerId={customerId} /> : <TopupsPanel customerId={customerId} />}
      {adjusting && <AdjustWalletDialog customerId={customerId} onClose={() => setAdjusting(false)} />}
    </div>
  );
}
