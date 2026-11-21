import { useEffect, useState } from 'react';
import { CheckCheck, Inbox, Mail, MailOpen, Trash2 } from 'lucide-react';
import { contactsApi, type AdminContact, type ContactStatus } from '@/api';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ConfirmDialog, Modal } from '@/components/ui/Dialog';
import { Badge, EmptyState, Notice, type BadgeTone } from '@/components/ui/Feedback';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { toast } from '@/store';
import { formatDate } from '@/utils/dates';

const STATUS_COLORS: Record<ContactStatus, BadgeTone> = {
  unread: 'info',
  read: 'neutral',
  replied: 'success',
};

const SUBJECT_LABELS: Record<string, string> = {
  order: 'Order issue',
  product: 'Product question',
  custom: 'Custom request',
  other: 'Other',
};

function ContactDetailPanel({ contact, onClose }: { contact: AdminContact; onClose: () => void }) {
  // M-O6: shared Modal (focus trap, Lucide close button, overlay) instead of the
  // hand-rolled overlay with a literal ✕. The status is re-read from the server on
  // open, so "Save note" can no longer overwrite a status changed elsewhere with
  // the stale value captured when the row was clicked.
  const [currentStatus, setCurrentStatus] = useState<ContactStatus>(contact.status);
  const [note, setNote] = useState(contact.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    contactsApi
      .getContact(contact.id)
      .then((fresh) => {
        if (cancelled) return;
        setCurrentStatus(fresh.status);
        setNote(fresh.note ?? '');
      })
      .catch(() => {
        // Keep the list's copy; the save below will surface any real failure.
      });
    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  const save = async (nextStatus?: ContactStatus) => {
    setSaving(true);
    setError(null);
    try {
      await contactsApi.updateContact(contact.id, { status: nextStatus ?? currentStatus, note: note || null });
      invalidate('contacts');
      toast('Message updated.', 'success');
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
      size="lg"
      title={contact.name}
      description={
        <span>
          {contact.email} · <Badge tone={STATUS_COLORS[currentStatus]}>{currentStatus}</Badge>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          {currentStatus !== 'replied' && (
            <Button variant="outline" size="sm" loading={saving} onClick={() => save('replied')} icon={<CheckCheck className="h-3.5 w-3.5" />}>
              Mark replied
            </Button>
          )}
          <Button size="sm" loading={saving} onClick={() => save()}>Save note</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-ivory p-4 text-xs text-ink-soft">
          <div><span className="font-medium text-ink">Subject</span><br />{SUBJECT_LABELS[contact.subject] ?? contact.subject}</div>
          {contact.orderNumber && <div><span className="font-medium text-ink">Order</span><br />{contact.orderNumber}</div>}
          <div><span className="font-medium text-ink">Received</span><br />{formatDate(contact.createdAt)}</div>
        </div>
        <div className="rounded-lg border border-sand-200 p-4 text-ink-soft whitespace-pre-wrap leading-relaxed">
          {contact.message}
        </div>
        <div>
          <label className="mb-1.5 block font-medium text-ink" htmlFor="contact-note">Internal note</label>
          <textarea
            id="contact-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Private note for your team..."
            className="input min-h-[80px] resize-y py-2"
          />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}

function DeleteDialog({ contact, onClose }: { contact: AdminContact; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Delete message"
      confirmLabel="Delete"
      tone="danger"
      onConfirm={async () => {
        setError(null);
        try {
          await contactsApi.deleteContact(contact.id);
          invalidate('contacts');
          toast('Message deleted.', 'success');
          onClose();
        } catch (e) {
          setError(errorMessage(e));
        }
      }}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-sm text-ink-soft">Delete message from <strong>{contact.name}</strong>? This cannot be undone.</p>
    </ConfirmDialog>
  );
}

export default function ContactsPage() {
  usePageMeta('Messages', [{ label: 'Sales' }]);
  const list = useListParams(['status']);
  const [viewing, setViewing] = useState<AdminContact | null>(null);
  const [deleting, setDeleting] = useState<AdminContact | null>(null);

  const f = list.query.filters ?? {};
  const { data, isLoading, isFetching, error } = useQuery(
    `contacts:list:${list.key}`,
    () => contactsApi.listContacts({ status: f.status, page: list.query.page, q: list.query.q || undefined }),
    { keepPrevious: true },
  );

  const openAndMarkRead = async (contact: AdminContact) => {
    setViewing(contact);
    if (contact.status === 'unread') {
      try {
        await contactsApi.getContact(contact.id);
        invalidate('contacts');
      } catch (e) {
        // M-O6: a failed mark-read used to be swallowed silently; say so instead.
        toast(`Could not mark this message as read: ${errorMessage(e)}`, 'error');
      }
    }
  };

  const columns: Column<AdminContact>[] = [
    {
      key: 'status',
      header: '',
      cell: (r) => r.status === 'unread'
        ? <Mail className="h-4 w-4 text-brand-600" aria-label="Unread" />
        : <MailOpen className="h-4 w-4 text-ink-faint" aria-label="Read" />,
    },
    {
      key: 'from',
      header: 'From',
      cell: (r) => (
        <div>
          <p className={r.status === 'unread' ? 'font-semibold text-ink' : 'font-medium text-ink'}>{r.name}</p>
          <p className="text-xs text-ink-soft">{r.email}</p>
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      cell: (r) => <span className="text-sm text-ink-soft">{SUBJECT_LABELS[r.subject] ?? r.subject}</span>,
    },
    {
      key: 'message',
      header: 'Message',
      // Reviews-style long-text handling: expandable instead of a hard truncate.
      cell: (r) => <p className="max-w-xs text-sm text-ink-soft line-clamp-2" title={r.message}>{r.message}</p>,
    },
    {
      key: 'status_badge',
      header: 'Status',
      cell: (r) => <Badge tone={STATUS_COLORS[r.status]}>{r.status}</Badge>,
    },
    {
      key: 'date',
      header: 'Received',
      cell: (r) => <span className="whitespace-nowrap text-sm text-ink-muted">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openAndMarkRead(r); }}>View</Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleting(r); }} icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />} aria-label="Delete" />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader description={data ? `${data.total} message${data.total !== 1 ? 's' : ''} total` : undefined} />
      <FilterBar
        search={list.query.q ?? ''}
        onSearch={(q) => list.update({ q })}
        searchPlaceholder="Search name, email, subject, message or order number…"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'unread', label: 'Unread' },
              { value: 'read', label: 'Read' },
              { value: 'replied', label: 'Replied' },
            ],
          },
        ]}
        values={list.query.filters}
        onFilter={(key, value) => list.update({ [key]: value })}
        activeCount={list.activeFilters}
        onClear={list.clear}
      />
      {error ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <DataTable
          caption="Contact messages"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          refreshing={isFetching && !isLoading}
          empty={<EmptyState icon={<Inbox className="h-8 w-8" />} title="No messages" body="Contact form submissions appear here." />}
          page={data?.page}
          pageCount={data?.pages}
          total={data?.total}
          pageSize={25}
          onPage={(p) => list.update({ page: p }, false)}
        />
      )}
      {viewing && <ContactDetailPanel contact={viewing} onClose={() => setViewing(null)} />}
      {deleting && <DeleteDialog contact={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
