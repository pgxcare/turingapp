'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';

import { cn } from '@/lib/utils';

type TooltipProps = {
  text: string;
  children: React.ReactNode;
  className?: string;
};

export function Tooltip({ text, children, className }: TooltipProps) {
  const tooltipId = React.useId();
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const tooltipRef = React.useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 260 });

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;

    const rect = triggerRef.current.getBoundingClientRect();
    const collisionPadding = 12;
    const tooltipWidth = Math.min(280, window.innerWidth - collisionPadding * 2);
    const measuredHeight = tooltipRef.current?.offsetHeight || 56;
    const preferTop = rect.bottom + measuredHeight + 10 > window.innerHeight - collisionPadding;

    const top = preferTop ? rect.top - measuredHeight - 10 : rect.bottom + 10;
    const unclampedLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    const left = Math.max(collisionPadding, Math.min(unclampedLeft, window.innerWidth - tooltipWidth - collisionPadding));

    setCoords({ top: Math.max(collisionPadding, top), left, width: tooltipWidth });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();

    const listener = () => updatePosition();
    window.addEventListener('scroll', listener, true);
    window.addEventListener('resize', listener);
    return () => {
      window.removeEventListener('scroll', listener, true);
      window.removeEventListener('resize', listener);
    };
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (open) {
      const frame = window.requestAnimationFrame(() => updatePosition());
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [open, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        className={cn(
          'inline-flex cursor-help items-center gap-1 align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
        onMouseEnter={() => {
          setOpen(true);
          updatePosition();
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          setOpen(true);
          updatePosition();
        }}
        onBlur={() => setOpen(false)}
      >
        <span className="underline decoration-dotted underline-offset-2">{children}</span>
        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
      </span>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <span
              id={tooltipId}
              ref={tooltipRef}
              role="tooltip"
              className="pointer-events-none fixed z-[110] rounded-md border border-border bg-card px-2.5 py-2 text-xs leading-5 text-card-foreground shadow-xl"
              style={{
                top: coords.top,
                left: coords.left,
                width: coords.width
              }}
            >
              {text}
            </span>,
            document.body
          )
        : null}
    </>
  );
}
