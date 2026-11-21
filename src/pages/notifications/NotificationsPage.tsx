import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Send, Clock, Search, X } from 'lucide-react';
import {
  fetchOwnerNotifications,
  fetchOwnerUnreadCount,
  fetchNotificationSends,
  markAllOwnerNotificationsRead,
  markOwnerNotificationRead,
  sendNotification,
} from '@/api/notifications';
import type { NotificationItem, NotificationSendRecord } from '@/api/notifications';
import { fetchCustomers } from '@/api/customers';
import type { CustomerSummary } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { EmptyState, Notice, Skeleton } from '@/components/ui/Feedback';
import { TextField, TextareaField } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta, useDebounced } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { ApiError, errorMessage } from '@/services/api';
import { toast } from '@/store';
import { cn } from '@/utils/misc';

type Tab = 'inbox' | 'send' | 'history';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

// ----- Inbox tab -----
const INBOX_PAGE_SIZE = 20;

function InboxTab() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // H12: the inbox was fixed at 50 items with no way to see older ones, even though
  // the API supports cursor paging. Pages of 20 load on demand instead.
  const load = async (next?: string | null) => {
    if (next === undefined) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchOwnerNotifications(next ?? undefined, INBOX_PAGE_SIZE);
      setItems((prev) => (next ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // H12: mark-read failures used to be swallowed (.catch(() => {})) while the row
  // still showed as read. Now the row only changes on success, and a failure is
  // surfaced so the owner can retry.
  const handleMarkRead = async (id: string) => {
    try {
      await markOwnerNotificationRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      invalidate('notifications:unread');
    } catch (e) {
      toast(`Could not mark as read: ${errorMessage(e)}`, 'error');
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllOwnerNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      invalidate('notifications:unread');
    } catch (e) {
      toast(`Could not mark all as read: ${errorMessage(e)}`, 'error');
    }
  };

  const unread = items.filter((n) => !n.isRead).length;

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (error) return (
    <Notice tone="error" role="alert">
      {error} <button type="button" onClick={() => void load()} className="underline ml-2">Retry</button>
    </Notice>
  );

  return (
    <div className="space-y-3">
      {unread > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => void handleMarkAll()}>
            Mark all read ({unread})
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState icon={<Bell className="h-8 w-8" />} title="No notifications" body="Order, payment and stock alerts for the store appear here." />
      ) : (
        <>
          <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white">
            {items.map((item) => (
              <li key={item.id} className={cn('flex items-start gap-3 px-4 py-3', !item.isRead && 'bg-brand-50/40')}>
                {!item.isRead && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />}
                <div className={cn('min-w-0 flex-1', item.isRead && 'pl-5')}>
                  <p className="font-medium text-sm text-ink">{item.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{item.body}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">{formatDate(item.createdAt)}</p>
                  {/* M-I5: the record carries a link (e.g. the low-stock alert links to
                   *  the filtered inventory list) — it used to be fetched but never shown.
                   *  Only admin paths are linked; customer (/account/…) links are not
                   *  valid inside the admin. */}
                  {item.link && !item.link.startsWith('/account') && (
                    <Link to={item.link} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                      View <ArrowRight className="h-3 w-3" aria-hidden />
                    </Link>
                  )}
                </div>
                {!item.isRead && (
                  <button type="button" onClick={() => void handleMarkRead(item.id)} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
          {cursor && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" loading={loadingMore} onClick={() => void load(cursor)}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ----- Composer tab -----
interface PreviewData { title: string; body: string; link: string; recipientLabel: string }

function SendTab() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [broadcast, setBroadcast] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // H12: the recipient is picked by searching customers (name or email) instead of
  // typing a raw customer ID by hand.
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedSearch = useDebounced(customerSearch, 300);
  const { data: customerResults } = useQuery(
    !broadcast && debouncedSearch.trim().length >= 2 ? `customers:pick:${debouncedSearch.trim()}` : null,
    () => fetchCustomers({ q: debouncedSearch.trim(), pageSize: 8 }),
  );
  const customerId = customer?.id ?? '';

  const handlePreview = () => {
    if (!title.trim() || !body.trim()) {
      setFormError('Title and body are required.');
      return;
    }
    setFormError(null);
    setPreview({
      title: title.trim(),
      body: body.trim(),
      link: link.trim(),
      recipientLabel: broadcast ? 'All customers (broadcast)' : customer ? `${customer.name} (${customer.email})` : '—',
    });
    setPreviewOpen(true);
  };

  const handleSend = async () => {
    if (!broadcast && !customer) {
      setFormError('Choose a customer to send to, or broadcast to all customers.');
      return;
    }
    setConfirmOpen(false);
    setSending(true);
    setFormError(null);
    try {
      const result = await sendNotification({
        customerId: broadcast ? null : customerId || null,
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || undefined,
      });
      setSuccess(`Sent to ${result.recipientCount} recipient${result.recipientCount !== 1 ? 's' : ''}.`);
      setTitle(''); setBody(''); setLink(''); setCustomer(null); setCustomerSearch('');
    } catch (e) {
      if (e instanceof ApiError) setFormError(e.message);
      else setFormError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-lg space-y-4">
      {formError && <Notice tone="error" role="alert">{formError}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      <TextField
        label="Title"
        required
        maxLength={100}
        hint="Max 100 characters"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextareaField
        label="Body"
        required
        maxLength={300}
        rows={3}
        hint="Max 300 characters"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <TextField
        label="Link (optional)"
        placeholder="/account/orders/..."
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />

      <div className="rounded-lg border border-sand-200 p-4 space-y-3">
        <p className="text-sm font-medium text-ink">Recipients</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={broadcast}
            onChange={(e) => setBroadcast(e.target.checked)}
            className="rounded border-sand-300"
          />
          <span className="text-sm text-ink">Broadcast to all customers</span>
        </label>
        {!broadcast && (
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink" htmlFor="notification-customer-search">
              Customer
            </label>
            {customer ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-sand-200 bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{customer.name}</p>
                  <p className="truncate text-xs text-ink-muted">{customer.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setCustomer(null); setCustomerSearch(''); }}
                  className="shrink-0 rounded p-1 text-ink-muted hover:bg-sand-100 hover:text-ink"
                  aria-label="Remove selected customer"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
                  <input
                    id="notification-customer-search"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    autoComplete="off"
                    className="w-full rounded-lg border border-sand-300 bg-white py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-brand-500"
                  />
                </div>
                {debouncedSearch.trim().length >= 2 && (
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-sand-200 bg-white shadow-sm">
                    {(customerResults?.items ?? []).length === 0 ? (
                      <p className="px-3 py-2 text-sm text-ink-muted">No customers match “{debouncedSearch.trim()}”.</p>
                    ) : (
                      customerResults!.items.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setCustomer(c); setCustomerSearch(''); }}
                          className="block w-full px-3 py-2 text-left hover:bg-sand-50"
                        >
                          <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                          <span className="block truncate text-xs text-ink-muted">{c.email}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-ink-muted">Pick the customer who should receive this notification.</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={handlePreview} disabled={sending}>
          Preview
        </Button>
        <Button
          onClick={() => {
            if (!title.trim() || !body.trim()) { setFormError('Title and body are required.'); return; }
            if (broadcast) { setConfirmOpen(true); return; }
            void handleSend();
          }}
          loading={sending}
        >
          <Send className="h-4 w-4 mr-1.5" aria-hidden />
          Send
        </Button>
      </div>

      {/* Preview modal */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Notification preview"
        footer={<Button onClick={() => setPreviewOpen(false)}>Close</Button>}
      >
        {preview && (
          <div className="space-y-3">
            <p className="text-xs text-ink-muted">To: {preview.recipientLabel}</p>
            <div className="rounded-lg border border-sand-200 bg-white p-4 shadow">
              <p className="font-semibold text-ink">{preview.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{preview.body}</p>
              {preview.link && <p className="mt-2 text-xs text-brand-600">{preview.link}</p>}
            </div>
          </div>
        )}
      </Modal>

      {/* Broadcast confirm dialog */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm broadcast"
        description="This will send a notification to all registered customers. This action cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSend()} loading={sending}>Send to all</Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          You are about to broadcast <strong>"{title}"</strong> to all customers.
        </p>
      </Modal>
    </div>
  );
}

// ----- History tab -----
function HistoryTab() {
  const [sends, setSends] = useState<NotificationSendRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchNotificationSends()
      .then(setSends)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;
  if (error) return <Notice tone="error" role="alert">{error}</Notice>;

  if (sends.length === 0) return <p className="py-8 text-center text-sm text-ink-muted">No sends yet.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-sand-200">
      <table className="min-w-full divide-y divide-sand-100 text-sm">
        <thead className="bg-sand-50">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Title</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Type</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Sent</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100 bg-white">
          {sends.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-2.5 text-ink font-medium">{s.title}</td>
              <td className="px-4 py-2.5 text-ink-muted">
                {s.recipientType === 'all' ? 'Broadcast' : 'Single'}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink">{s.successCount}</td>
              <td className="px-4 py-2.5 text-right text-ink-muted">{formatDate(s.sentAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----- Page -----
export default function NotificationsPage() {
  usePageMeta('Notifications', [{ label: 'Sales' }]);
  const { data: unreadCount } = useQuery('notifications:unread', () => fetchOwnerUnreadCount());
  const [tab, setTab] = useState<Tab>('inbox');

  const tabs: Array<{ id: Tab; label: string; icon: typeof Bell }> = [
    { id: 'inbox', label: 'Inbox', icon: Bell },
    { id: 'send', label: 'Send', icon: Send },
    { id: 'history', label: 'History', icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <PageHeader description="Order, payment and stock alerts for the store, and messages sent to customers." />

      <div className="flex gap-1 rounded-lg border border-sand-200 bg-sand-50 p-1 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition',
              tab === id ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {id === 'inbox' && (unreadCount?.count ?? 0) > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                {unreadCount!.count > 99 ? '99+' : unreadCount!.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'inbox' && <InboxTab />}
      {tab === 'send' && <SendTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}
