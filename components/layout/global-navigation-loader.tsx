'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { NAVIGATION_FEEDBACK_EVENT, type NavigationFeedbackDetail } from '@/lib/navigation-feedback';
import { cn } from '@/lib/utils';

const MIN_VISIBLE_MS = 520;
const COMPLETE_HIDE_DELAY_MS = 220;
const PROGRESS_TICK_MS = 140;
const MAX_ACTIVE_MS = 10000;

export function GlobalNavigationLoader() {
  const pathname = usePathname();

  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);

  const activeRef = useRef(false);
  const startAtRef = useRef(0);
  const previousPathnameRef = useRef(pathname);
  const finishTimeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const safetyTimeoutRef = useRef<number | null>(null);

  const clearScheduledTimers = useCallback(() => {
    if (finishTimeoutRef.current !== null) {
      window.clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }

    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimeoutRef.current !== null) {
      window.clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current) return;

    clearSafetyTimer();

    const elapsed = Date.now() - startAtRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

    clearScheduledTimers();

    finishTimeoutRef.current = window.setTimeout(() => {
      setProgress(100);

      hideTimeoutRef.current = window.setTimeout(() => {
        activeRef.current = false;
        setActive(false);
        setProgress(0);
        clearSafetyTimer();
      }, COMPLETE_HIDE_DELAY_MS);
    }, remaining);
  }, [clearSafetyTimer, clearScheduledTimers]);

  const start = useCallback(() => {
    clearScheduledTimers();
    clearSafetyTimer();

    if (!activeRef.current) {
      activeRef.current = true;
      startAtRef.current = Date.now();
      setProgress(14);
      setActive(true);
    } else {
      setProgress((current) => Math.max(current, 14));
    }

    safetyTimeoutRef.current = window.setTimeout(() => {
      clearSafetyTimer();
      finish();
    }, MAX_ACTIVE_MS);
  }, [clearSafetyTimer, clearScheduledTimers, finish]);

  useEffect(() => {
    if (!active) {
      if (progressIntervalRef.current !== null) {
        window.clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      return;
    }

    progressIntervalRef.current = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;
        if (current < 40) return Math.min(92, current + 7);
        if (current < 70) return Math.min(92, current + 3.5);
        return Math.min(92, current + 1.4);
      });
    }, PROGRESS_TICK_MS);

    return () => {
      if (progressIntervalRef.current !== null) {
        window.clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [active]);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      finish();
    }
  }, [finish, pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (anchor.dataset.navLoader === 'off') return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.getAttribute('rel') === 'external') return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;

      const currentPath = `${window.location.pathname}${window.location.search}`;
      const nextPath = `${nextUrl.pathname}${nextUrl.search}`;

      if (currentPath === nextPath) return;

      start();
    };

    const handlePopState = () => {
      start();
    };

    const handleNavigationFeedback = (event: Event) => {
      const custom = event as CustomEvent<NavigationFeedbackDetail>;
      if (custom.detail?.phase === 'finish') {
        finish();
        return;
      }
      start();
    };

    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener(NAVIGATION_FEEDBACK_EVENT, handleNavigationFeedback as EventListener);

    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener(NAVIGATION_FEEDBACK_EVENT, handleNavigationFeedback as EventListener);
    };
  }, [finish, start]);

  useEffect(() => {
    return () => {
      clearScheduledTimers();
      clearSafetyTimer();
      if (progressIntervalRef.current !== null) {
        window.clearInterval(progressIntervalRef.current);
      }
    };
  }, [clearSafetyTimer, clearScheduledTimers]);

  return (
    <div className={cn('tt-nav-loader', active && 'tt-nav-loader--active')} aria-hidden={!active} hidden={!active}>
      <div className="tt-nav-loader__rail">
        <div className="tt-nav-loader__fill" style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <div className="tt-nav-loader__chip" role="status" aria-live="polite" aria-label="Loading next workspace view">
        <span className="tt-nav-loader__dot" />
        <span className="sr-only">Loading next workspace view...</span>
      </div>
    </div>
  );
}
