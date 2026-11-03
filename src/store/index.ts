import type { ReactNode } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AdminUser } from '@/types';

// ---------------------------------------------------------------------------------------------
// Session — memory only (refresh signs out). This is a UI demo, NOT authentication or security.
// ---------------------------------------------------------------------------------------------

interface AuthState {
  user: AdminUser | null;
  setUser: (user: AdminUser | null) => void;
}

export const useAuth = create<AuthState>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

// ---------------------------------------------------------------------------------------------
// Display preferences — the only thing persisted in localStorage (non-sensitive).
// ---------------------------------------------------------------------------------------------

interface PrefsState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'ys-admin-prefs', storage: createJSONStorage(() => localStorage), partialize: ({ sidebarCollapsed }) => ({ sidebarCollapsed }) },
  ),
);

// ---------------------------------------------------------------------------------------------
// Page meta (top bar title + breadcrumbs)
// ---------------------------------------------------------------------------------------------

export interface Crumb {
  label: string;
  to?: string;
}

interface MetaState {
  title: string;
  crumbs: Crumb[];
  setMeta: (title: string, crumbs: Crumb[]) => void;
}

export const usePageMetaStore = create<MetaState>()((set) => ({
  title: '',
  crumbs: [],
  setMeta: (title, crumbs) => set({ title, crumbs }),
}));

// ---------------------------------------------------------------------------------------------
// Toasts + imperative confirmation dialog
// ---------------------------------------------------------------------------------------------

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
}

interface UiState {
  toasts: Toast[];
  toast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  openConfirm: (opts: ConfirmOptions) => Promise<boolean>;
  closeConfirm: (ok: boolean) => void;
}

let toastId = 0;

export const useUi = create<UiState>()((set, get) => ({
  toasts: [],
  toast: (message, tone = 'success') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone }] }));
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 7000 : 4000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  confirm: null,
  openConfirm: (opts) =>
    new Promise<boolean>((resolve) => {
      get().confirm?.resolve(false);
      set({ confirm: { ...opts, resolve } });
    }),
  closeConfirm: (ok) => {
    get().confirm?.resolve(ok);
    set({ confirm: null });
  },
}));

/** `if (await confirmAction({...})) doIt()` */
export const confirmAction = (opts: ConfirmOptions) => useUi.getState().openConfirm(opts);
export const toast = (message: string, tone?: ToastTone) => useUi.getState().toast(message, tone);
