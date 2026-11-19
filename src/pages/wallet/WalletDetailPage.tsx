import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Wallet, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { fetchCustomerWallet, fetchCustomerTopups } from '@/api/wallet';
import type { AdminWalletTransaction, AdminWalletTopup } from '@/api/wallet';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Card, PageHeader } from '@/components/ui/Page';
import { useQuery } from '@/hooks/useQuery';
import { formatDate } from '@/utils/dates';

/** Format INR paise as ₹X.XX */
function formatPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);
}

const TX_TYPE_COLORS: Record<string, string> = {
  topup: 'text-emerald-700',
  spend: 'text-red-600',
  refund: 'text-sky-700',
  reversal: 'text-amber-700',
};

export default function WalletDetailPage() {
  const { customerId = '' } = useParams<{ customerId: string }>();
  const [txPage, setTxPage] = useState(1);
  const [topupPage, setTopupPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'transactions' | 'topups'>('transactions');

  const {
    data: walletData,
    isLoading: walletLoading,
    error: walletError,
    refetch: refetchWallet,
  } = useQuery(`wallet:customer:${customerId}:p${txPage}`, () => fetchCustomerWallet(customerId, txPage));

  const {
    data: topupData,
    isLoading: topupLoading,
    error: topupError,
    refetch: refetchTopups,
  } = useQuery(`wallet:topups:${customerId}:p${topupPage}`, () => fetchCustomerTopups(customerId, topupPage));

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

  const transactions = walletData?.transactions.items ?? [];
  const txPageCount = walletData?.transactions.pageCount ?? 1;
  const topups = topupData?.items ?? [];
  const topupPageCount = topupData?.pageCount ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Link to={`/customers/${customerId}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to Customer
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-ink mb-4">Customer Wallet</h1>
      <PageHeader description={`Customer ID: ${customerId}`} />

      {/* Balance card */}
      <Card>
        <div className="flex items-center gap-4 p-5">
          <div className="rounded-xl bg-brand-50 p-3">
            <Wallet className="h-6 w-6 text-brand-600" />
          </div>
          <div>
            <p className="text-sm text-ink-soft">Current Balance</p>
            <p className="text-3xl font-bold text-ink">
              {formatPaise(walletData?.balancePaise ?? 0)}
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

      {/* Transactions tab */}
      {activeTab === 'transactions' && (
        <div className="space-y-3">
          {transactions.length === 0 && !walletLoading && (
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
                  <p className="text-xs text-ink-muted mt-0.5">{formatDate(tx.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-semibold text-sm ${tx.amountPaise >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {tx.amountPaise >= 0 ? '+' : ''}{formatPaise(tx.amountPaise)}
                  </p>
                  <p className="text-xs text-ink-muted">Bal: {formatPaise(tx.balanceAfter)}</p>
                </div>
              </div>
            </Card>
          ))}

          {txPageCount > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <button
                className="btn btn-secondary btn-sm"
                disabled={txPage <= 1}
                onClick={() => setTxPage((p) => p - 1)}
              >Previous</button>
              <span className="self-center text-sm text-ink-muted">{txPage} / {txPageCount}</span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={txPage >= txPageCount}
                onClick={() => setTxPage((p) => p + 1)}
              >Next</button>
            </div>
          )}
        </div>
      )}

      {/* Top-ups tab */}
      {activeTab === 'topups' && (
        <div className="space-y-3">
          {topupLoading && !topupData && (
            <Skeleton className="h-24 w-full" />
          )}
          {!!topupError && <ErrorState onRetry={() => refetchTopups()} />}

          {!topupLoading && topups.length === 0 && (
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
                  <p className="font-semibold text-sm text-emerald-700">+{formatPaise(topup.amountPaise)}</p>
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

          {topupPageCount > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <button
                className="btn btn-secondary btn-sm"
                disabled={topupPage <= 1}
                onClick={() => setTopupPage((p) => p - 1)}
              >Previous</button>
              <span className="self-center text-sm text-ink-muted">{topupPage} / {topupPageCount}</span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={topupPage >= topupPageCount}
                onClick={() => setTopupPage((p) => p + 1)}
              >Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
