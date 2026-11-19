import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import {
  fetchOwnerNotifications,
  fetchOwnerUnreadCount,
  markOwnerNotificationRead,
} from '@/api/notifications';
import type { NotificationItem } from '@/api/notifications';
import { cn } from '@/utils/misc';

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { count } = await fetchOwnerUnreadCount();
        if (alive) setUnread(count);
      } catch { /* silent */ }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (!open) {
      setLoading(true);
      try {
        const page = await fetchOwnerNotifications(undefined, 10);
        setItems(page.items);
        setUnread(0);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    }
  };

  const handleItemClick = async (item: NotificationItem) => {
    setOpen(false);
    if (!item.isRead) {
      await markOwnerNotificationRead(item.id).catch(() => { /* silent */ });
    }
    if (item.link) navigate(item.link);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        onClick={() => void handleOpen()}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-sand-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-lg">
          <div className="border-b border-sand-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">Notifications</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-ink-muted text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-muted">No notifications.</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-sand-100">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void handleItemClick(item)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition hover:bg-sand-50',
                      !item.isRead && 'bg-brand-50/50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!item.isRead && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      )}
                      <div className={cn('min-w-0', item.isRead && 'pl-4')}>
                        <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{item.body}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-sand-100 px-4 py-2">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/notifications'); }}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
