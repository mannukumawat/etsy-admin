import { useEffect, useRef, useState, type RefObject } from 'react';
import { usePageMetaStore, type Crumb } from '@/store';
import { settingsService } from '@/services/settingsService';
import type { Settings } from '@/types';
import { useQuery } from './useQuery';

/** Sets the top-bar title, breadcrumbs and document title. */
export function usePageMeta(title: string, crumbs: Crumb[] = []) {
  const setMeta = usePageMetaStore((s) => s.setMeta);
  const crumbKey = JSON.stringify(crumbs);
  useEffect(() => {
    setMeta(title, crumbs);
    document.title = title ? `${title} · Your Store Admin` : 'Your Store Admin';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, crumbKey, setMeta]);
}

export function useSettings() {
  return useQuery<Settings>('settings', () => settingsService.get());
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let openDialogs = 0;

/** Focus trap + Escape + scroll lock + focus return for drawers and modals. */
export function useDialog(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    openDialogs++;
    document.documentElement.style.overflow = 'hidden';
    const items = () => (node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null) : []);
    requestAnimationFrame(() => (node?.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0] ?? node)?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openDialogs--;
      if (openDialogs <= 0) document.documentElement.style.overflow = '';
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, ref]);
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
