import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';

// Keyboard-friendly ordering: explicit up / down / remove buttons (no drag-only UI). After a move, focus follows the
// item and a polite live region announces the new position.

export function ReorderControls({
  index,
  count,
  itemLabel,
  onMove,
  onRemove,
  removeLabel,
}: {
  index: number;
  count: number;
  /** Used in the button labels, e.g. “Move Speckled mug up”. */
  itemLabel: string;
  onMove: (to: number) => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton size="sm" label={`Move ${itemLabel} up`} data-move="up" disabled={index === 0} onClick={() => onMove(index - 1)}>
        <ArrowUp className="h-4 w-4" aria-hidden />
      </IconButton>
      <IconButton size="sm" label={`Move ${itemLabel} down`} data-move="down" disabled={index >= count - 1} onClick={() => onMove(index + 1)}>
        <ArrowDown className="h-4 w-4" aria-hidden />
      </IconButton>
      {onRemove && (
        <IconButton size="sm" label={removeLabel ?? `Remove ${itemLabel}`} data-remove onClick={onRemove} className="hover:text-red-700">
          <X className="h-4 w-4" aria-hidden />
        </IconButton>
      )}
    </div>
  );
}

type FocusTarget = { rowId: string; control: 'up' | 'down' } | { rowId: null };

/**
 * Restores focus after list changes. Rows must carry `data-reorder-id`; the hook's `ref` goes on the list container.
 * `fallback` (optional) receives focus when the list becomes empty.
 */
export function useReorderFocus<T extends HTMLElement = HTMLElement>(fallback?: RefObject<HTMLElement>) {
  const ref = useRef<T>(null);
  const [target, setTarget] = useState<FocusTarget | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!target) return;
    const root = ref.current;
    let el: HTMLElement | null | undefined = null;
    if (root && target.rowId !== null) {
      const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(target.rowId) : target.rowId;
      const row = root.querySelector<HTMLElement>(`[data-reorder-id="${id}"]`);
      el = row?.querySelector<HTMLElement>(`[data-move="${target.control}"]:not(:disabled)`) ?? row?.querySelector<HTMLElement>('[data-move]:not(:disabled), [data-remove]');
    }
    (el ?? fallback?.current ?? root)?.focus();
    setTarget(null);
  }, [target, fallback]);

  /** Call after moving `rowId`; focus stays on the same arrow when possible. */
  const afterMove = useCallback((rowId: string, control: 'up' | 'down', announcement: string) => {
    setTarget({ rowId, control });
    setMessage(announcement);
  }, []);

  /** Call after removing a row; focus goes to `nextRowId` (or the fallback when the list is empty). */
  const afterRemove = useCallback((nextRowId: string | null, announcement: string) => {
    setTarget(nextRowId ? { rowId: nextRowId, control: 'up' } : { rowId: null });
    setMessage(announcement);
  }, []);

  const announce = useCallback((text: string) => setMessage(text), []);

  const live = (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );

  return { ref, afterMove, afterRemove, announce, live };
}
