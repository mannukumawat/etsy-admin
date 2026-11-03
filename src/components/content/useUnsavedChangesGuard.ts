import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { confirmAction } from '@/store';

/**
 * Warns before leaving a form with unsaved edits: in-app navigation (router blocker + confirm dialog) and
 * browser reload / tab close (native beforeunload prompt). Data is in memory only, so a reload loses everything.
 */
export function useUnsavedChangesGuard(when: boolean, message = 'Your unsaved changes will be lost. Saved drafts are kept until you refresh the browser.') {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    void confirmAction({ title: 'Leave without saving?', body: message, confirmLabel: 'Leave page', tone: 'danger' }).then((ok) => {
      if (!active) return;
      const b = blockerRef.current;
      if (b.state !== 'blocked') return;
      if (ok) b.proceed();
      else b.reset();
    });
    return () => {
      active = false;
    };
  }, [blocker.state, message]);

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers need returnValue set to show the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);
}
