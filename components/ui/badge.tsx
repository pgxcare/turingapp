import * as React from 'react';

import { cn } from '@/lib/utils';

const variants = {
  default: 'bg-secondary text-secondary-foreground',
  success: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  warning: 'bg-amber-100 text-amber-900 border border-amber-300',
  danger: 'bg-rose-100 text-rose-900 border border-rose-300',
  outline: 'border border-border text-foreground'
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof variants }) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
