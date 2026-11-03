import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { CustomerKindBadge } from '@/components/orders/CustomerKindBadge';
import { customerPath } from '@/components/orders/orderDisplay';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/Feedback';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { useQuery } from '@/hooks/useQuery';
import { customerService } from '@/services/salesServices';
import type { CustomerSummary } from '@/types';
import { formatDate } from '@/utils/dates';
import { formatUsd } from '@/utils/money';

const SPENT_HINT = 'Net paid after refunds, in USD, converted at each order’s checkout rate.';

export default function CustomersPage() {
  usePageMeta('Customers', [{ label: 'Sales' }]);
  const list = useListParams(['kind'], { sort: 'last', dir: 'desc' });
  const { data, isLoading, isFetching, error, refetch } = useQuery(`customers:list:${list.key}`, () => customerService.list(list.query), { keepPrevious: true });

  const columns: Column<CustomerSummary>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortKey: 'name',
      cell: (c) => (
        <div className="min-w-[11rem] max-w-[18rem]">
          <Link to={customerPath(c.id)} className="block truncate font-medium text-ink hover:underline">
            {c.name}
          </Link>
          <p className="truncate text-xs text-ink-muted">{c.email}</p>
        </div>
      ),
    },
    { key: 'kind', header: 'Type', cell: (c) => <CustomerKindBadge kind={c.kind} /> },
    {
      key: 'phone',
      header: 'Phone',
      hideBelow: 'md',
      cell: (c) => (c.phone ? <span className="whitespace-nowrap">{c.phone}</span> : <span className="text-ink-faint">Not provided</span>),
    },
    { key: 'orders', header: 'Orders', sortKey: 'orders', align: 'right', hideBelow: 'sm', cell: (c) => <span className="num">{c.orderCount}</span> },
    {
      key: 'spent',
      header: <span title={SPENT_HINT}>Spent (USD)</span>,
      sortKey: 'spent',
      align: 'right',
      cell: (c) => <span className="num whitespace-nowrap font-medium">{formatUsd(c.spentUsd)}</span>,
    },
    { key: 'last', header: 'Last order', sortKey: 'last', hideBelow: 'md', cell: (c) => <span className="whitespace-nowrap text-ink-soft">{formatDate(c.lastOrderAt)}</span> },
    {
      key: 'joined',
      header: 'Joined',
      sortKey: 'joined',
      hideBelow: 'lg',
      cell: (c) =>
        c.kind === 'account' && c.createdAt ? (
          <span className="whitespace-nowrap text-ink-soft">{formatDate(c.createdAt)}</span>
        ) : (
          <span className="text-ink-faint">
            <span aria-hidden>—</span>
            <span className="sr-only">Not applicable (guest)</span>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        description={
          <>
            <p>Read-only view of storefront accounts and guest buyers. Guest buyers are grouped by email among guest orders only and are never merged into an account automatically — even when an account uses the same email.</p>
            <p className="mt-1">Spent is net paid after refunds (USD, converted at each order’s checkout rate).</p>
          </>
        }
      />
      <div className="card">
        <FilterBar
          search={list.query.q ?? ''}
          onSearch={(q) => list.update({ q })}
          searchPlaceholder="Search name, email or phone"
          filters={[{ key: 'kind', label: 'Type', options: [{ value: 'account', label: 'Account' }, { value: 'guest', label: 'Guest' }] }]}
          values={list.query.filters}
          onFilter={(k, v) => list.update({ [k]: v })}
          activeCount={list.activeFilters}
          onClear={list.clear}
        />
        <DataTable
          caption="Customers"
          columns={columns}
          rows={data?.items}
          getRowId={(c) => c.id}
          loading={isLoading}
          refreshing={isFetching && !isLoading}
          error={error}
          onRetry={refetch}
          sort={list.query.sort}
          dir={list.query.dir}
          onSort={list.toggleSort}
          page={data?.page}
          pageCount={data?.pageCount}
          total={data?.total}
          pageSize={data?.pageSize}
          onPage={(page) => list.update({ page }, false)}
          empty={
            <EmptyState
              icon={<SearchX className="h-6 w-6" aria-hidden />}
              title={list.activeFilters ? 'No customers match' : 'No customers yet'}
              body={list.activeFilters ? 'Try a different search or clear the filters.' : 'Accounts and guest buyers appear here once they place orders or sign up.'}
              action={
                list.activeFilters ? (
                  <Button variant="outline" size="sm" onClick={list.clear}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </div>
    </>
  );
}
