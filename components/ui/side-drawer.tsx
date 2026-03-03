'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SideDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  widthClassName?: string;
  overlayClassName?: string;
};

const CLOSE_ANIMATION_MS = 300;

export function SideDrawer({
  open,
  onOpenChange,
  title,
  actions,
  children,
  className,
  contentClassName,
  widthClassName,
  overlayClassName
}: SideDrawerProps) {
  const titleId = React.useId();
  const [present, setPresent] = React.useState(open);
  const [active, setActive] = React.useState(false);
  const closeTimeoutRef = React.useRef<number | null>(null);
  const openFrameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }

      if (openFrameRef.current !== null) {
        window.cancelAnimationFrame(openFrameRef.current);
        openFrameRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (openFrameRef.current !== null) {
      window.cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }

    if (open) {
      setPresent(true);
      setActive(false);
      openFrameRef.current = window.requestAnimationFrame(() => {
        setActive(true);
      });
      return undefined;
    }

    setActive(false);
    closeTimeoutRef.current = window.setTimeout(() => setPresent(false), CLOSE_ANIMATION_MS);
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onOpenChange(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!present || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-hidden={!open}>
      <div
        className={cn(
          'absolute inset-0 bg-slate-950/10 backdrop-blur-[2px] transition-opacity duration-200 pointer-events-auto',
          active ? 'opacity-100' : 'opacity-0',
          overlayClassName
        )}
        onClick={() => onOpenChange(false)}
      />
      <aside
        aria-labelledby={titleId}
        className={cn(
          'absolute inset-y-0 right-0 flex max-w-full flex-col border-l border-border bg-background/95 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out',
          active ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none',
          widthClassName ??
            'w-[92vw] sm:w-[88vw] lg:w-[70vw] xl:w-[65vw] 2xl:w-[60vw] max-w-[1600px]',
          className
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-9 px-0"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className={cn('flex-1 overflow-y-auto px-4 py-4', contentClassName)}>{children}</div>
      </aside>
    </div>,
    document.body
  );
}
