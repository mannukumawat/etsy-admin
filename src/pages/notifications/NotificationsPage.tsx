import { useEffect, useState } from 'react';
import { Bell, Send, Clock } from 'lucide-react';
import {
  fetchOwnerNotifications,
  fetchNotificationSends,
  markAllOwnerNotificationsRead,
  markOwnerNotificationRead,
  sendNotification,
} from '@/api/notifications';
import type { NotificationItem, NotificationSendRecord } from '@/api/notifications';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/Feedback';
import { TextField, TextareaField } from '@/components/ui/Form';
import { ApiError, errorMessage } from '@/services/api';
import { cn } from '@/utils/misc';

type Tab = 'inbox' | 'send' | 'history';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

// ----- Inbox tab -----
function InboxTab() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchOwnerNotifications(undefined, 50);
      setItems(page.items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleMarkRead = async (id: string) => {
    await markOwnerNotificationRead(id).catch(() => { /* silent */ });
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleMarkAll = async () => {
    await markAllOwnerNotificationsRead().catch(() => { /* silent */ });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const unread = items.filter((n) => !n.isRead).length;

  if (loading) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;
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
        <p className="py-8 text-center text-sm text-ink-muted">No notifications.</p>
      ) : (
        <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white">
          {items.map((item) => (
            <li key={item.id} className={cn('flex items-start gap-3 px-4 py-3', !item.isRead && 'bg-brand-50/40')}>
              {!item.isRead && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />}
              <div className={cn('min-w-0 flex-1', item.isRead && 'pl-5')}>
                <p className="font-medium text-sm text-ink">{item.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{item.body}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{formatDate(item.createdAt)}</p>
              </div>
              {!item.isRead && (
                <button type="button" onClick={() => void handleMarkRead(item.id)} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
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

  // We don't have a customer search endpoint yet — accept customer ID directly for now
  // The admin can look up the customer ID from the Customers page.
  const [customerId, setCustomerId] = useState('');

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
      recipientLabel: broadcast ? 'All customers (broadcast)' : customerId ? `Customer: ${customerId}` : '—',
    });
    setPreviewOpen(true);
  };

  const handleSend = async () => {
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
      setTitle(''); setBody(''); setLink(''); setCustomerId('');
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
          <TextField
            label="Customer ID (leave blank to cancel)"
            placeholder="cuid..."
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            hint="Find the customer ID from the Customers page"
          />
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
  const [tab, setTab] = useState<Tab>('inbox');

  const tabs: Array<{ id: Tab; label: string; icon: typeof Bell }> = [
    { id: 'inbox', label: 'Inbox', icon: Bell },
    { id: 'send', label: 'Send', icon: Send },
    { id: 'history', label: 'History', icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Notifications</h1>

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
          </button>
        ))}
      </div>

      {tab === 'inbox' && <InboxTab />}
      {tab === 'send' && <SendTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}
